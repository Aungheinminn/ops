import type { SessionData } from './types.ts';
import { ulid } from 'ulid';
import { execSync } from 'child_process';
import { SessionStore } from './session/index.js';
import { SessionStorage } from './storage/session-storage.js';

export interface HandlerResult {
  success: boolean;
  message?: string;
}

export type SessionCommandHandler = (
  session: SessionData,
  args: string
) => Promise<HandlerResult>;

export const handleExport: SessionCommandHandler = async (session, args) => {
  const path = args || `./session-${session.id}.html`;
  
  await session.session.sendUserMessage(`/export ${args}`);
  
  return {
    success: true,
    message: `Export requested: ${path}`,
  };
};

export const handleCopy: SessionCommandHandler = async (session, _args) => {
  const messages = session.messages;
  const lastAgentMsg = [...messages].reverse().find(m => m.role === 'agent');
  
  if (!lastAgentMsg) {
    return {
      success: false,
      message: 'No agent message to copy',
    };
  }

  try {
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input: lastAgentMsg.content });
    } else {
      throw new Error('Clipboard only available on macOS');
    }
    
    return {
      success: true,
      message: 'Copied last message to clipboard',
    };
  } catch {
    return {
      success: true,
      message: 'Could not copy to clipboard (not available)',
    };
  }
};

export const handleName: SessionCommandHandler = async (session, args) => {
  if (!args.trim()) {
    return {
      success: false,
      message: 'Please provide a name: /name <new-name>',
    };
  }
  
  const success = await SessionStore.renameSession(session.id, args.trim());
  
  return {
    success,
    message: success ? `Session renamed to: ${args}` : 'Failed to rename session',
  };
};

export const handleSave: SessionCommandHandler = async (session, args) => {
  // If args provided, rename then save
  if (args.trim()) {
    await SessionStore.renameSession(session.id, args.trim());
  }
  
  // Force immediate save (bypass debounce)
  await SessionStore.saveSessionNow(session.id);
  
  return {
    success: true,
    message: `Session saved: ${session.name}`,
  };
};

export const handleLoad: SessionCommandHandler = async (_session, args) => {
  if (!args.trim()) {
    return {
      success: false,
      message: 'Please provide a session ID: /load <session-id>',
    };
  }
  
  const sessionId = args.trim();
  const exists = await SessionStorage.sessionExists(sessionId);
  
  if (!exists) {
    return {
      success: false,
      message: `Session not found: ${sessionId}`,
    };
  }
  
  // Switch to the session (will load from disk if not in memory)
  await SessionStore.switchSession(sessionId);
  
  return {
    success: true,
    message: `Loading session: ${sessionId}`,
  };
};

export const handleSessions: SessionCommandHandler = async () => {
  const savedSessions = await SessionStorage.listSessions();
  
  if (savedSessions.length === 0) {
    return {
      success: true,
      message: 'No saved sessions found.',
    };
  }
  
  const sessionList = savedSessions
    .map(s => `  • ${s.name} (${s.id.slice(0, 8)}...) - ${s.messageCount} messages`)
    .join('\n');
  
  return {
    success: true,
    message: `Saved sessions:\n${sessionList}`,
  };
};

export const handleDelete: SessionCommandHandler = async (_session, args) => {
  if (!args.trim()) {
    return {
      success: false,
      message: 'Please provide a session ID: /delete <session-id>',
    };
  }
  
  const sessionId = args.trim();
  const success = await SessionStore.deleteSavedSession(sessionId);
  
  return {
    success,
    message: success ? `Session deleted: ${sessionId}` : `Session not found: ${sessionId}`,
  };
};

export const handleRename: SessionCommandHandler = async (session, args) => {
  if (!args.trim()) {
    return {
      success: false,
      message: 'Please provide a new name: /rename <new-name>',
    };
  }
  
  const success = await SessionStore.renameSession(session.id, args.trim());
  
  return {
    success,
    message: success ? `Session renamed to: ${args}` : 'Failed to rename session',
  };
};

export const SESSION_COMMAND_HANDLERS: Record<string, SessionCommandHandler> = {
  export: handleExport,
  copy: handleCopy,
  name: handleName,
  save: handleSave,
  load: handleLoad,
  sessions: handleSessions,
  delete: handleDelete,
  rename: handleRename,
};

export function hasSessionHandler(command: string): boolean {
  return command in SESSION_COMMAND_HANDLERS;
}

export function getSessionHandler(command: string): SessionCommandHandler | undefined {
  return SESSION_COMMAND_HANDLERS[command];
}
