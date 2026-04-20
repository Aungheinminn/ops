import { createStore, produce } from 'solid-js/store';
import type { AgentSession, AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import { ulid } from 'ulid';

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface SessionData {
  id: string;
  session: AgentSession;
  name: string;
  cwd: string;
  lastActivity: number;
  messages: Message[];
  unsubscribe: () => void;
  isLoading: boolean;
}

// Store interface for reactive access - use object instead of Map for SolidJS store
interface SessionStoreState {
  sessions: Record<string, SessionData>;
  activeId: string | null;
}

const [store, setStore] = createStore<SessionStoreState>({
  sessions: {},
  activeId: null,
});

class SessionStoreClass {
  getSessions() {
    return store.sessions;
  }

  getActiveId() {
    return store.activeId;
  }

  setActiveId(id: string | null) {
    setStore('activeId', id);
  }

  async createSession(cwd: string, name?: string): Promise<string> {
    const { createAgentSession } = await import('@mariozechner/pi-coding-agent');

    const { session } = await createAgentSession({
      cwd,
    });

    const sessionId = ulid();
    const sessionName = name || `Session ${Object.keys(store.sessions).length + 1}`;

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      this.handleEvent(sessionId, event);
    });

    const data: SessionData = {
      id: sessionId,
      session,
      name: sessionName,
      cwd,
      lastActivity: Date.now(),
      messages: [],
      unsubscribe,
      isLoading: false,
    };

    setStore('sessions', sessionId, data);

    // Always switch to the new session
    this.setActiveId(sessionId);

    return sessionId;
  }

  private handleEvent(sessionId: string, event: AgentSessionEvent) {
    const data = store.sessions[sessionId];
    if (!data) return;

    setStore('sessions', sessionId, 'lastActivity', Date.now());

    switch (event.type) {
      case 'agent_start':
        setStore('sessions', sessionId, 'isLoading', true);
        break;
      case 'agent_end':
        setStore('sessions', sessionId, 'isLoading', false);
        break;
      case 'message_start': {
        const msg = event.message;
        // Handle different message structures
        let content = '';
        if (msg) {
          if (typeof msg === 'string') {
            content = msg;
          } else if ('content' in msg) {
            content = typeof msg.content === 'string' ? msg.content : '';
          } else if ('text' in msg) {
            content = typeof msg.text === 'string' ? msg.text : '';
          }
        }
        const newMessage: Message = {
          id: ulid(),
          role: 'agent',
          content,
          timestamp: Date.now(),
          isStreaming: true,
        };
        setStore('sessions', sessionId, 'messages', (messages) => [...messages, newMessage]);
        break;
      }
      case 'message_update': {
        const evtMsg = event.message;
        let content = '';
        if (evtMsg) {
          if (typeof evtMsg === 'string') {
            content = evtMsg;
          } else if ('content' in evtMsg) {
            content = typeof evtMsg.content === 'string' ? evtMsg.content : '';
          } else if ('text' in evtMsg) {
            content = typeof evtMsg.text === 'string' ? evtMsg.text : '';
          }
        }
        setStore('sessions', sessionId, 'messages', produce((messages: Message[]) => {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'agent') {
            lastMsg.content = content;
          }
        }));
        break;
      }
      case 'message_end': {
        setStore('sessions', sessionId, 'messages', produce((messages: Message[]) => {
          const msg = messages[messages.length - 1];
          if (msg) {
            msg.isStreaming = false;
          }
        }));
        break;
      }
      case 'tool_execution_start': {
        const newMessage: Message = {
          id: ulid(),
          role: 'agent',
          content: `🔧 Using tool: ${event.toolName}`,
          timestamp: Date.now(),
        };
        setStore('sessions', sessionId, 'messages', (messages) => [...messages, newMessage]);
        break;
      }
    }
  }

  async sendMessage(sessionId: string, content: string) {
    const data = store.sessions[sessionId];
    if (!data) return;

    const newMessage: Message = {
      id: ulid(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setStore('sessions', sessionId, 'messages', (messages) => [...messages, newMessage]);
    setStore('sessions', sessionId, 'lastActivity', Date.now());

    await data.session.sendUserMessage(content);
  }

  // Handle agent-level commands that need special processing
  // Returns true if command was handled, false if should be sent as regular message
  async handleCommand(sessionId: string, command: string, args: string): Promise<boolean> {
    const data = store.sessions[sessionId];
    if (!data) return false;

    switch (command) {
      case 'export': {
        // Handle export with optional path argument
        const path = args || `./session-${sessionId}.html`;
        try {
          // Note: pi-coding-agent may expose export functionality
          // For now, add a system message indicating export attempt
          const systemMsg: Message = {
            id: ulid(),
            role: 'agent',
            content: `📤 Export requested: ${path}`,
            timestamp: Date.now(),
          };
          setStore('sessions', sessionId, 'messages', (messages) => [...messages, systemMsg]);
          
          // Send the actual command to agent
          await data.session.sendUserMessage(`/${command} ${args}`);
          return true;
        } catch (err) {
          console.error('Export failed:', err);
          return false;
        }
      }

      case 'copy': {
        // Copy last agent message to clipboard
        const messages = data.messages;
        const lastAgentMsg = [...messages].reverse().find(m => m.role === 'agent');
        if (lastAgentMsg) {
          try {
            // Try to use native clipboard if available
            if (typeof process !== 'undefined' && process.platform !== 'win32') {
              const { execSync } = await import('child_process');
              execSync('pbcopy', { input: lastAgentMsg.content });
            }
            
            const systemMsg: Message = {
              id: ulid(),
              role: 'agent',
              content: '✓ Copied last message to clipboard',
              timestamp: Date.now(),
            };
            setStore('sessions', sessionId, 'messages', (messages) => [...messages, systemMsg]);
            return true;
          } catch {
            // Clipboard not available - still return true to prevent sending to LLM
            const systemMsg: Message = {
              id: ulid(),
              role: 'agent',
              content: '⚠ Could not copy to clipboard (clipboard not available)',
              timestamp: Date.now(),
            };
            setStore('sessions', sessionId, 'messages', (messages) => [...messages, systemMsg]);
            return true;
          }
        }
        return false;
      }

      case 'name': {
        // Rename session
        if (args) {
          setStore('sessions', sessionId, 'name', args);
          const systemMsg: Message = {
            id: ulid(),
            role: 'agent',
            content: `✓ Session renamed to: ${args}`,
            timestamp: Date.now(),
          };
          setStore('sessions', sessionId, 'messages', (messages) => [...messages, systemMsg]);
          return true;
        }
        return false;
      }

      default:
        // Command not handled here - let it go to agent as regular message
        return false;
    }
  }

  switchSession(sessionId: string) {
    if (store.sessions[sessionId]) {
      this.setActiveId(sessionId);
    }
  }

  closeSession(sessionId: string) {
    const data = store.sessions[sessionId];
    if (data) {
      data.unsubscribe();

      setStore('sessions', produce((sessions: Record<string, SessionData>) => {
        delete sessions[sessionId];
      }));

      if (store.activeId === sessionId) {
        const nextId = Object.keys(store.sessions)[0] || null;
        this.setActiveId(nextId);
      }
    }
  }

  cleanupInactive(timeout: number = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [id, data] of Object.entries(store.sessions)) {
      if (now - data.lastActivity > timeout) {
        this.closeSession(id);
      }
    }
  }

  getSession(sessionId: string): SessionData | undefined {
    return store.sessions[sessionId];
  }

  getActiveSession(): SessionData | undefined {
    const id = store.activeId;
    return id ? store.sessions[id] : undefined;
  }

  listSessions(): Array<{ id: string; name: string; lastActivity: number; isActive: boolean }> {
    return Object.entries(store.sessions).map(([id, data]) => ({
      id,
      name: data.name,
      lastActivity: data.lastActivity,
      isActive: id === store.activeId,
    }));
  }
}

export const SessionStore = new SessionStoreClass();
