import type { RichMessage } from '../messages/types.js';

export interface PersistedSession {
  id: string;
  name: string;
  cwd: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessageAt?: number;
}

export interface SessionMetadata {
  id: string;
  name: string;
  cwd: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export type PersistedMessage = RichMessage;

export interface PersistedSessionData {
  session: PersistedSession;
  messages: PersistedMessage[];
}

export const STORAGE_CONFIG = {
  baseDir: '.pi/ops/sessions',
  sessionFile: 'session.json',
  messagesFile: 'messages.json',
  debounceMs: 1500,
} as const;

export function isPersistedSession(obj: unknown): obj is PersistedSession {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'id' in obj &&
    typeof (obj as { id: unknown }).id === 'string' &&
    'name' in obj &&
    typeof (obj as { name: unknown }).name === 'string' &&
    'cwd' in obj &&
    typeof (obj as { cwd: unknown }).cwd === 'string'
  );
}
