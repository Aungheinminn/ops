import type { Session, SessionData } from '../types.js';

export interface SessionStoreState {
  sessions: Record<string, SessionData>;
  activeId: string | null;
}

export interface SessionListItem extends Session {
  isActive: boolean;
}
