import type { AgentSession, AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type { SessionData } from '../types.js';
import { parseMessageStart, parseMessageUpdate, parseToolExecution, isHandledEventType } from '../messages.js';
import { ulid } from 'ulid';

export async function createSession(
  cwd: string,
  name?: string,
  existingSessions: Record<string, SessionData> = {}
): Promise<SessionData> {
  const { createAgentSession } = await import('@mariozechner/pi-coding-agent');
  
  const { session } = await createAgentSession({ cwd });
  
  const sessionId = ulid();
  const sessionName = name || `Session ${Object.keys(existingSessions).length + 1}`;
  
  const data: SessionData = {
    id: sessionId,
    session,
    name: sessionName,
    cwd,
    lastActivity: Date.now(),
    messages: [],
    unsubscribe: () => {},
    isLoading: false,
  };
  
  return data;
}

export function createEventHandler(
  _sessionId: string,
  callbacks: {
    onLoadingChange: (loading: boolean) => void;
    onMessageAdd: (message: import('../types.js').Message) => void;
    onMessageUpdate: (content: string) => void;
    onMessageComplete: () => void;
    onActivity: () => void;
  }
): (event: AgentSessionEvent) => void {
  return (event: AgentSessionEvent) => {
    callbacks.onActivity();
    
    if (!isHandledEventType(event.type)) {
      return;
    }
    
    switch (event.type) {
      case 'agent_start':
        callbacks.onLoadingChange(true);
        break;
      case 'agent_end':
        callbacks.onLoadingChange(false);
        break;
      case 'message_start': {
        const message = parseMessageStart(event);
        callbacks.onMessageAdd(message);
        break;
      }
      case 'message_update': {
        const content = parseMessageUpdate(event);
        callbacks.onMessageUpdate(content);
        break;
      }
      case 'message_end':
        callbacks.onMessageComplete();
        break;
      case 'tool_execution_start': {
        const message = parseToolExecution(event);
        if (message) {
          callbacks.onMessageAdd(message);
        }
        break;
      }
    }
  };
}

export function cleanupSession(session: SessionData): void {
  try {
    session.unsubscribe();
  } catch {
    // Ignore
  }
}
