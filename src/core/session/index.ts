import { createStore, produce } from 'solid-js/store';
import type { SessionData, Message } from '../types.js';
import type { SessionStoreState, SessionListItem } from './types.js';
import { createSession, createEventHandler, cleanupSession } from './lifecycle.js';
import { createUserMessage } from '../messages.js';
import { hasSessionHandler, getSessionHandler } from '../commands.js';

const [store, setStore] = createStore<SessionStoreState>({
  sessions: {},
  activeId: null,
});

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
  
  async createSession(cwd: string, name?: string): Promise<string> {
    const data = await createSession(cwd, name, store.sessions);
    
    const handler = createEventHandler(data.id, {
      onLoadingChange: (loading) => {
        setStore('sessions', data.id, 'isLoading', loading);
      },
      onMessageAdd: (message) => {
        setStore('sessions', data.id, 'messages', (messages) => [...messages, message]);
      },
      onMessageUpdate: (content) => {
        setStore('sessions', data.id, 'messages', produce((messages: Message[]) => {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'agent') {
            lastMsg.content = content;
          }
        }));
      },
      onMessageComplete: () => {
        setStore('sessions', data.id, 'messages', produce((messages: Message[]) => {
          const msg = messages[messages.length - 1];
          if (msg) {
            msg.isStreaming = false;
          }
        }));
      },
      onActivity: () => {
        setStore('sessions', data.id, 'lastActivity', Date.now());
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
    
    cleanupSession(data);
    
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
    if (!data) return;
    
    const message = createUserMessage(content);
    setStore('sessions', sessionId, 'messages', (messages) => [...messages, message]);
    setStore('sessions', sessionId, 'lastActivity', Date.now());
    
    await data.session.sendUserMessage(content);
  }
  
  async handleCommand(sessionId: string, command: string, args: string): Promise<boolean> {
    const data = store.sessions[sessionId];
    if (!data) return false;
    
    if (hasSessionHandler(command)) {
      const handler = getSessionHandler(command);
      if (handler) {
        const result = await handler(data, args);
        
        if (result.message) {
          const newMessage: import('../types.js').Message = {
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
