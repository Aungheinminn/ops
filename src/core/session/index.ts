import { createStore, produce } from 'solid-js/store';
import type { SessionData, Message as OldMessage } from '../types.js';
import type { SessionStoreState, SessionListItem } from './types.js';
import { createSession, createSessionEventHandler, cleanupSession } from './lifecycle.js';
import { createUserMessage as createOldUserMessage } from '../messages.js';
import { hasSessionHandler, getSessionHandler } from '../commands.js';
import { log, logError } from '../logger.js';
import { getOrCreateMessageStore, removeMessageStore, type MessageStore } from '../messages/store.ts';
import type { RichMessage } from '../messages/types.ts';

const [store, setStore] = createStore<SessionStoreState>({
  sessions: {},
  activeId: null,
});

// Message stores are now managed by the messages module registry

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

  async createSession(cwd: string, name?: string): Promise<string> {
    const data = await createSession(cwd, name, store.sessions);
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
    });

    data.unsubscribe = data.session.subscribe(handler);
    log('Subscribed to session events');
    setStore('sessions', data.id, data);
    this.setActiveId(data.id);

    return data.id;
  }

  closeSession(id: string): void {
    const data = store.sessions[id];
    if (!data) return;

    cleanupSession(data);

    // Clean up message store
    removeMessageStore(id);

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

  switchSession(id: string): void {
    if (store.sessions[id]) {
      this.setActiveId(id);
    }
  }

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
}

export const SessionStore = new SessionStoreClass();
