import { createStore, produce } from 'solid-js/store';
import type { SessionData, Message as OldMessage, InputMode } from '../types.js';
import type { SessionStoreState, SessionListItem, QueueState } from './types.js';
import { createSession, createSessionEventHandler, cleanupSession } from './lifecycle.js';
import { createUserMessage as createOldUserMessage } from '../messages.js';
import { hasSessionHandler, getSessionHandler } from '../commands.js';
import { getOrCreateMessageStore, removeMessageStore, type MessageStore } from '../messages/store.ts';
import type { RichMessage } from '../messages/types.ts';
import { SessionStorage } from '../storage/session-storage.js';
import type { PersistedSession, SessionMetadata } from '../storage/types.js';
import { ulid } from 'ulid';
import { routeMessage, isAgentBusy, getQueueState, clearQueue } from '../queue/router.ts';

const [store, setStore] = createStore<SessionStoreState>({
  sessions: {},
  activeId: null,
  queueStates: {},
});

const debounceTimers = new Map<string, NodeJS.Timeout>();
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

  getQueueState(sessionId: string): QueueState {
    return store.queueStates[sessionId] ?? { steering: [], followUp: [], totalCount: 0 };
  }

  isAgentBusy(sessionId: string): boolean {
    const data = store.sessions[sessionId];
    if (!data) return false;
    return isAgentBusy(data.session, sessionId);
  }

  async discoverSessions(): Promise<SessionMetadata[]> {
    const sessions = await SessionStorage.listSessions();
    return sessions;
  }

  async loadSavedSession(sessionId: string): Promise<SessionData | null> {
    const persisted = await SessionStorage.loadSession(sessionId);
    if (!persisted) {
      return null;
    }

    const messages = await SessionStorage.loadMessages(sessionId);
    
    const sessionData: Partial<SessionData> = {
      id: persisted.id,
      name: persisted.name,
      cwd: persisted.cwd,
      lastActivity: persisted.updatedAt,
      messages: [],
      isLoading: false,
    };

    return sessionData as SessionData;
  }

  private debouncedSave(sessionId: string): void {
    const existing = debounceTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.saveSessionNow(sessionId);
      debounceTimers.delete(sessionId);
      pendingSaves.delete(sessionId);
    }, 1500);

    debounceTimers.set(sessionId, timer);
    pendingSaves.add(sessionId);
  }

  async saveSessionNow(sessionId: string): Promise<void> {
    const data = store.sessions[sessionId];
    if (!data) return;

    const messageStore = getOrCreateMessageStore(sessionId);
    const messages = messageStore.messages;

    const persisted: PersistedSession = {
      id: data.id,
      name: data.name,
      cwd: data.cwd,
      model: data.session.model?.id || 'unknown',
      createdAt: data.lastActivity - 1000,
      updatedAt: Date.now(),
      messageCount: messages.length,
      lastMessageAt: messages.length > 0 
        ? messages[messages.length - 1].timestamp 
        : undefined,
    };

    try {
      await SessionStorage.saveSession(persisted);
      await SessionStorage.saveMessages(sessionId, messages);
    } catch (err) {
    }
  }

  triggerSave(sessionId: string): void {
    this.debouncedSave(sessionId);
  }

  async saveAllPending(): Promise<void> {
    for (const [sessionId, timer] of debounceTimers.entries()) {
      clearTimeout(timer);
      await this.saveSessionNow(sessionId);
    }
    debounceTimers.clear();
    pendingSaves.clear();
  }

  async createSession(cwd: string, name?: string, defaultModel?: string): Promise<string> {
    const data = await createSession(cwd, name, store.sessions, defaultModel);

    const messageStore = getOrCreateMessageStore(data.id);

    setStore('queueStates', data.id, { steering: [], followUp: [], totalCount: 0 });

    const handler = createSessionEventHandler(data.id, {
      onLoadingChange: (loading) => {
        setStore('sessions', data.id, 'isLoading', loading);
      },
      onActivity: () => {
        setStore('sessions', data.id, 'lastActivity', Date.now());
      },
      onMessageUpdate: () => {
        this.triggerSave(data.id);
      },
      onQueueUpdate: (queueState) => {
        setStore('queueStates', data.id, queueState);
      },
    });

    data.unsubscribe = data.session.subscribe(handler);
    setStore('sessions', data.id, data);
    this.setActiveId(data.id);

    return data.id;
  }

  async createSessionFromSaved(savedSession: SessionData, defaultModel?: string): Promise<string | null> {
    try {
      if (store.sessions[savedSession.id]) {
        this.setActiveId(savedSession.id);
        return savedSession.id;
      }

      const newSessionId = await this.createSessionWithId(
        savedSession.id,
        savedSession.cwd,
        savedSession.name,
        defaultModel
      );

      const savedMessages = await SessionStorage.loadMessages(savedSession.id);
      if (savedMessages.length > 0) {
        const messageStore = getOrCreateMessageStore(newSessionId);
        messageStore.restoreMessages(savedMessages);
      }

      return newSessionId;
    } catch (err) {
      return null;
    }
  }

  private async createSessionWithId(
    sessionId: string,
    cwd: string,
    name?: string,
    defaultModel?: string
  ): Promise<string> {
    const { createSessionWithId } = await import('./lifecycle.js');
    
    const data = await createSessionWithId(sessionId, cwd, name, store.sessions, defaultModel);

    const messageStore = getOrCreateMessageStore(data.id);

    setStore('queueStates', data.id, { steering: [], followUp: [], totalCount: 0 });

    const handler = createSessionEventHandler(data.id, {
      onLoadingChange: (loading) => {
        setStore('sessions', data.id, 'isLoading', loading);
      },
      onActivity: () => {
        setStore('sessions', data.id, 'lastActivity', Date.now());
      },
      onMessageUpdate: () => {
        this.triggerSave(data.id);
      },
      onQueueUpdate: (queueState) => {
        setStore('queueStates', data.id, queueState);
      },
    });

    data.unsubscribe = data.session.subscribe(handler);
    setStore('sessions', data.id, data);
    this.setActiveId(data.id);

    return data.id;
  }

  closeSession(id: string): void {
    const data = store.sessions[id];
    if (!data) return;

    this.saveSessionNow(id);

    cleanupSession(data);

    removeMessageStore(id);

    const timer = debounceTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(id);
    }
    pendingSaves.delete(id);

    setStore('sessions', produce((sessions: Record<string, SessionData>) => {
      delete sessions[id];
    }));

    setStore('queueStates', produce((states: Record<string, QueueState>) => {
      delete states[id];
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

    const savedSession = await this.loadSavedSession(id);
    if (savedSession) {
    }
  }

  async autoRenameSession(sessionId: string, userMessage: string): Promise<void> {
    const data = store.sessions[sessionId];
    if (!data) return;

    if (!this.isDefaultName(data.name)) {
      return;
    }

    const newName = this.generateSessionName(userMessage);
    await this.renameSession(sessionId, newName);
  }

  private isDefaultName(name: string): boolean {
    return name === 'New Session';
  }

  private generateSessionName(message: string): string {
    let name = message
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 50)
      .trim();

    if (name.length > 0) {
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }

    if (!name) {
      name = `Session ${Date.now()}`;
    }

    return name;
  }

  async renameSession(sessionId: string, newName: string): Promise<boolean> {
    const data = store.sessions[sessionId];
    if (!data) return false;

    setStore('sessions', sessionId, 'name', newName);
    
    const result = await SessionStorage.renameSession(sessionId, newName);
    
    return result;
  }

  async sendMessage(sessionId: string, content: string): Promise<void> {
    const data = store.sessions[sessionId];
    if (!data) {
      return;
    }

    if (!data.session.model) {
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

    const agentBusy = isAgentBusy(data.session, sessionId);

    if (!agentBusy) {
      const messageStore = getOrCreateMessageStore(sessionId);
      messageStore.addUserMessage(content);

      const message = createOldUserMessage(content);
      setStore('sessions', sessionId, 'messages', (messages) => [...messages, message]);
      setStore('sessions', sessionId, 'lastActivity', Date.now());

      const messages = messageStore.messages;
      const userMessages = messages.filter((m: RichMessage) => m.role === 'user');
      if (userMessages.length === 1) {
        await this.autoRenameSession(sessionId, content);
      }
      this.triggerSave(sessionId);

      try {
        await routeMessage(data.session, sessionId, content, 'build');
      } catch (err) {
      }
    } else {
      setStore('sessions', sessionId, 'lastActivity', Date.now());

      try {
        await routeMessage(data.session, sessionId, content, 'build');
      } catch (err) {
      }
    }
  }

  async sendMessageWithMode(sessionId: string, content: string, mode: InputMode, options?: {
    forceSteer?: boolean;
    forceFollowUp?: boolean;
  }): Promise<void> {
    const data = store.sessions[sessionId];
    if (!data) {
      return;
    }

    if (!data.session.model) {
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

    const agentBusy = isAgentBusy(data.session, sessionId);

    if (!agentBusy) {
      const messageStore = getOrCreateMessageStore(sessionId);
      messageStore.addUserMessage(content);

      const message = createOldUserMessage(content);
      setStore('sessions', sessionId, 'messages', (messages) => [...messages, message]);
      setStore('sessions', sessionId, 'lastActivity', Date.now());

      const messages = messageStore.messages;
      const userMessages = messages.filter((m: RichMessage) => m.role === 'user');
      if (userMessages.length === 1) {
        await this.autoRenameSession(sessionId, content);
      }
      this.triggerSave(sessionId);

      try {
        await routeMessage(data.session, sessionId, content, mode, options);
      } catch (err) {
      }
    } else {
      setStore('sessions', sessionId, 'lastActivity', Date.now());

      try {
        await routeMessage(data.session, sessionId, content, mode, options);
      } catch (err) {
      }
    }
  }

  clearQueue(sessionId: string): { steering: string[]; followUp: string[] } {
    const data = store.sessions[sessionId];
    if (!data) {
      return { steering: [], followUp: [] };
    }
    return clearQueue(data.session);
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

  async listSavedSessions(): Promise<SessionMetadata[]> {
    return SessionStorage.listSessions();
  }

  async deleteSavedSession(sessionId: string): Promise<boolean> {
    if (store.sessions[sessionId]) {
      this.closeSession(sessionId);
    }
    return SessionStorage.deleteSession(sessionId);
  }
}

export const SessionStore = new SessionStoreClass();
