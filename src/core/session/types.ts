import type { Session, SessionData } from '../types.js';

export interface QueueState {
  steering: readonly string[];
  followUp: readonly string[];
  totalCount: number;
}

export interface SessionStoreState {
  sessions: Record<string, SessionData>;
  activeId: string | null;
  queueStates: Record<string, QueueState>;
}

export interface SessionListItem extends Session {
  isActive: boolean;
}
