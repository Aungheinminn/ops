import { createStore, produce } from 'solid-js/store';
import type { SessionData, Message as OldMessage } from '../types.js';
import type { SessionStoreState, SessionListItem } from './types.js';
import { createSession, createSessionEventHandler, cleanupSession } from './lifecycle.js';
import { createUserMessage as createOldUserMessage } from '../messages.js';
import { hasSessionHandler, getSessionHandler } from '../commands.js';
import { log, logError } from '../logger.js';
import { getOrCreateMessageStore, removeMessageStore, type MessageStore } from '../messages/store.ts';
import type { RichMessage } from '../messages/types.ts';
import { SessionStorage } from '../storage/session-storage.js';
import type { PersistedSession, SessionMetadata } from '../storage/types.js';
import { ulid } from 'ulid';

const [store, setStore] = createStore<SessionStoreState>({
  sessions: {},
  activeId: null,
});

// Debounce timers for auto-save
const debounceTimers = new Map<string, NodeJS.Timeout>();

// Track which sessions need to be saved
const pendingSaves = new Set<string>();

class SessionStoreClass {
  getSessions(): Record<string, SessionData> {
    return store.sessions;
  }

  getActiveId(): string | null {
    return store.activeId;
  }

  getSession(id: string): SessionData | undefined {
    return store.sessions[id];
  }

  getActiveSession(): SessionData | undefined {
    return store.activeId ? store.sessions[store.activeId] : undefined;
  }

  getMessageStore(sessionId: string): MessageStore | undefined {
    return getOrCreateMessageStore(sessionId);
  }

  // ============================================================================
  // Session Discovery and Loading
  // ============================================================================

  /**
   * Discover all saved sessions from disk
   * Called on app startup to populate the session list
   */
  async discoverSessions(): Promise<SessionMetadata[]> {
    const sessions = await SessionStorage.listSessions();
    log(`Discovered ${sessions.length} saved sessions`);
    return sessions;
  }

  /**
   * Load a saved session from disk
   * Creates a new SessionData from persisted data
   */
  async loadSavedSession(sessionId: string): Promise<SessionData | null> {
    const persisted = await SessionStorage.loadSession(sessionId);
    if (!persisted) {
      logError(`Failed to load session: ${sessionId}`);
      return null;
    }

    const messages = await SessionStorage.loadMessages(sessionId);
    
    // Create session data structure
    const sessionData: Partial<SessionData> = {
      id: persisted.id,
      name: persisted.name,
      cwd: persisted.cwd,
      lastActivity: persisted.updatedAt,
      messages: [], // Will be converted from RichMessage
      isLoading: false,
      // Note: session, services, and unsubscribe will be set up by lifecycle
    };

    log(`Loaded saved session: ${persisted.name} (${messages.length} messages)`);
    return sessionData as SessionData;
  }

  // ============================================================================
  // Auto-Save with Debouncing
  // ============================================================================

  /**
   * Debounced save for messages
   */
  private debouncedSave(sessionId: string): void {
    // Clear existing timer
    const existing = debounceTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.saveSessionNow(sessionId);
      debounceTimers.delete(sessionId);
      pendingSaves.delete(sessionId);
    }, 1500);

    debounceTimers.set(sessionId, timer);
    pendingSaves.add(sessionId);
  }

  /**
   * Force immediate save (bypass debounce)
   */
  async saveSessionNow(sessionId: string): Promise<void> {
    const data = store.sessions[sessionId];
    if (!data) return;

    const messageStore = getOrCreateMessageStore(sessionId);
    const messages = messageStore.messages;

    // Convert to persisted session
    const persisted: PersistedSession = {
      id: data.id,
      name: data.name,
      cwd: data.cwd,
      model: data.session.model?.id || 'unknown',
      createdAt: data.lastActivity - 1000, // Approximate
      updatedAt: Date.now(),
      messageCount: messages.length,
      lastMessageAt: messages.length > 0 
        ? messages[messages.length - 1].timestamp 
        : undefined,
    };

    try {
      await SessionStorage.saveSession(persisted);
      await SessionStorage.saveMessages(sessionId, messages);
      log(`Session saved: ${sessionId} (${messages.length} messages)`);
    } catch (err) {
      logError(`Failed to save session ${sessionId}`, err);
    }
  }

  /**
   * Trigger a debounced save
   */
  triggerSave(sessionId: string): void {
    this.debouncedSave(sessionId);
  }

  /**
   * Save all pending sessions immediately
   * Called before app exit
   */
  async saveAllPending(): Promise<void> {
    // Clear all debounce timers and save immediately
    for (const [sessionId, timer] of debounceTimers.entries()) {
      clearTimeout(timer);
      await this.saveSessionNow(sessionId);
    }
    debounceTimers.clear();
    pendingSaves.clear();
  }

  // ============================================================================
  // Session Creation
  // ============================================================================

  async createSession(cwd: string, name?: string, defaultModel?: string): Promise<string> {
    const data = await createSession(cwd, name, store.sessions, defaultModel);
    log(`Session created, model: ${data.session.model?.id || 'none'}`);

    // Get or create message store - session lifecycle already registered it
    const messageStore = getOrCreateMessageStore(data.id);

    const handler = createSessionEventHandler(data.id, {
      onLoadingChange: (loading) => {
        log(`onLoadingChange: ${loading}`);
        setStore('sessions', data.id, 'isLoading', loading);
      },
      onActivity: () => {
        setStore('sessions', data.id, 'lastActivity', Date.now());
      },
      onMessageUpdate: () => {
        // Trigger debounced save when messages update
        this.triggerSave(data.id);
      },
    });

    data.unsubscribe = data.session.subscribe(handler);
    log('Subscribed to session events');
    setStore('sessions', data.id, data);
    this.setActiveId(data.id);

    // Note: Session is saved only when first message is sent
    // See sendMessage() for the auto-save trigger

    return data.id;
  }

  /**
   * Create a new session from saved session data
   * This restores a session that was previously saved to disk
   */
  async createSessionFromSaved(savedSession: SessionData, defaultModel?: string): Promise<string | null> {
    try {
      // Create a new session with the saved session's properties
      const newSessionId = await this.createSession(savedSession.cwd, savedSession.name, defaultModel);

      // Load the saved messages and restore them to the new session
      const savedMessages = await SessionStorage.loadMessages(savedSession.id);
      if (savedMessages.length > 0) {
        const messageStore = getOrCreateMessageStore(newSessionId);
        // Restore messages to the message store
        messageStore.restoreMessages(savedMessages);
        log(`Restored ${savedMessages.length} messages to session ${newSessionId}`);
      }

      return newSessionId;
    } catch (err) {
      logError('Failed to create session from saved data', err);
      return null;
    }
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  closeSession(id: string): void {
    const data = store.sessions[id];
    if (!data) return;

    // Save before closing
    this.saveSessionNow(id);

    cleanupSession(data);

    // Clean up message store
    removeMessageStore(id);

    // Clean up debounce timer
    const timer = debounceTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(id);
    }
    pendingSaves.delete(id);

    setStore('sessions', produce((sessions: Record<string, SessionData>) => {
      delete sessions[id];
    }));

    if (store.activeId === id) {
      const nextId = Object.keys(store.sessions)[0] || null;
      this.setActiveId(nextId);
    }
  }

  setActiveId(id: string | null): void {
    setStore('activeId', id);
  }

  async switchSession(id: string): Promise<void> {
    if (store.sessions[id]) {
      this.setActiveId(id);
      return;
    }

    // Try to load from disk if not in memory
    log(`Session ${id} not in memory, attempting to load from disk...`);
    const savedSession = await this.loadSavedSession(id);
    if (savedSession) {
      // TODO: Need to properly restore session with AgentSession
      // For now, just log that we found it
      log(`Found saved session: ${savedSession.name}`);
    }
  }

  // ============================================================================
  // Session Renaming
  // ============================================================================

  /**
   * Auto-rename session based on first user message
   */
  async autoRenameSession(sessionId: string, userMessage: string): Promise<void> {
    const data = store.sessions[sessionId];
    if (!data) return;

    // Only auto-rename if using default name
    if (!this.isDefaultName(data.name)) {
      return;
    }

    const newName = this.generateSessionName(userMessage);
    await this.renameSession(sessionId, newName);
  }

  /**
   * Check if a name is a default generated name
   */
  private isDefaultName(name: string): boolean {
    return name === 'New Session';
  }

  /**
   * Generate a session name from user message
   */
  private generateSessionName(message: string): string {
    // Clean up the message
    let name = message
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .slice(0, 50) // Limit length
      .trim();

    // Capitalize first letter
    if (name.length > 0) {
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }

    // Fallback if empty
    if (!name) {
      name = `Session ${Date.now()}`;
    }

    return name;
  }

  /**
   * Manually rename a session
   */
  async renameSession(sessionId: string, newName: string): Promise<boolean> {
    const data = store.sessions[sessionId];
    if (!data) return false;

    // Update in-memory
    setStore('sessions', sessionId, 'name', newName);
    
    // Save to disk
    const result = await SessionStorage.renameSession(sessionId, newName);
    if (result) {
      log(`Session renamed: ${sessionId} -> "${newName}"`);
    }
    
    return result;
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async sendMessage(sessionId: string, content: string): Promise<void> {
    const data = store.sessions[sessionId];
    if (!data) {
      log('sendMessage: no session data');
      return;
    }

    log(`sendMessage: ${content}`);
    log(`Session model: ${data.session.model?.id || 'none'}`);

    // Check if model is selected
    if (!data.session.model) {
      log('No model selected, showing error');
      const errorMessage: OldMessage = {
        id: `system-${Date.now()}`,
        role: 'agent',
        content: '⚠️ No model selected.\n\nPlease either:\n1. Use /model to select a model\n2. Set an API key environment variable (ANTHROPIC_API_KEY, OPENCODEGO_API_KEY, etc.)\n3. Use /login to save API keys to ~/.pi/agent/auth.json',
        timestamp: Date.now(),
        isStreaming: false,
      };
      setStore('sessions', sessionId, 'messages', (messages) => [...messages, errorMessage]);
      return;
    }

    // Add user message to the message store
    const messageStore = getOrCreateMessageStore(sessionId);
    messageStore.addUserMessage(content);

    // Also add to old message store for backwards compatibility
    const message = createOldUserMessage(content);
    setStore('sessions', sessionId, 'messages', (messages) => [...messages, message]);
    setStore('sessions', sessionId, 'lastActivity', Date.now());

    // Auto-rename on first user message, save on all messages
    const messages = messageStore.messages;
    const userMessages = messages.filter((m: RichMessage) => m.role === 'user');
    if (userMessages.length === 1) {
      await this.autoRenameSession(sessionId, content);
    }
    // Save session after every message
    this.triggerSave(sessionId);

    log('Calling session.sendUserMessage...');
    try {
      await data.session.sendUserMessage(content);
      log('sendUserMessage completed');
    } catch (err) {
      logError('sendUserMessage error', err);
    }
  }

  async handleCommand(sessionId: string, command: string, args: string): Promise<boolean> {
    const data = store.sessions[sessionId];
    if (!data) return false;

    if (hasSessionHandler(command)) {
      const handler = getSessionHandler(command);
      if (handler) {
        const result = await handler(data, args);

        if (result.message) {
          const newMessage: OldMessage = {
            id: `cmd-${Date.now()}`,
            role: 'agent',
            content: result.message,
            timestamp: Date.now(),
            isStreaming: false,
          };
          setStore('sessions', sessionId, 'messages', (messages) => [...messages, newMessage]);
        }

        return true;
      }
    }

    return false;
  }

  addMessage(sessionId: string, message: OldMessage): void {
    const data = store.sessions[sessionId];
    if (!data) return;

    setStore('sessions', sessionId, 'messages', (messages) => [...messages, message]);
    setStore('sessions', sessionId, 'lastActivity', Date.now());
  }

  cleanupInactive(timeout: number = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, data] of Object.entries(store.sessions)) {
      if (now - data.lastActivity > timeout) {
        this.closeSession(id);
      }
    }
  }

  listSessions(): SessionListItem[] {
    return Object.entries(store.sessions).map(([id, data]) => ({
      id,
      name: data.name,
      lastActivity: data.lastActivity,
      isLoading: data.isLoading,
      messages: data.messages,
      isActive: id === store.activeId,
      cwd: data.cwd,
    }));
  }

  // ============================================================================
  // Saved Session List (from disk)
  // ============================================================================

  /**
   * Get list of all saved sessions from disk
   */
  async listSavedSessions(): Promise<SessionMetadata[]> {
    return SessionStorage.listSessions();
  }

  /**
   * Delete a saved session from disk
   */
  async deleteSavedSession(sessionId: string): Promise<boolean> {
    // Close if active
    if (store.sessions[sessionId]) {
      this.closeSession(sessionId);
    }
    return SessionStorage.deleteSession(sessionId);
  }
}

export const SessionStore = new SessionStoreClass();
