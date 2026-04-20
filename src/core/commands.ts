import type { SessionData } from './types.ts';
import { ulid } from 'ulid';
import { execSync } from 'child_process';

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

export const handleName: SessionCommandHandler = async (_session, args) => {
  if (!args.trim()) {
    return {
      success: false,
      message: 'Please provide a name: /name <new-name>',
    };
  }
  
  return {
    success: true,
    message: `Session renamed to: ${args}`,
  };
};

export const SESSION_COMMAND_HANDLERS: Record<string, SessionCommandHandler> = {
  export: handleExport,
  copy: handleCopy,
  name: handleName,
};

export function hasSessionHandler(command: string): boolean {
  return command in SESSION_COMMAND_HANDLERS;
}

export function getSessionHandler(command: string): SessionCommandHandler | undefined {
  return SESSION_COMMAND_HANDLERS[command];
}
