import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { log, logError } from '../logger.js';
import type { PersistedSession, SessionMetadata, PersistedMessage } from './types.js';
import { STORAGE_CONFIG } from './types.js';

export class SessionStorage {
  private static readonly BASE_DIR = join(homedir(), STORAGE_CONFIG.baseDir);

  private static ensureBaseDir(): void {
    if (!existsSync(this.BASE_DIR)) {
      mkdirSync(this.BASE_DIR, { recursive: true, mode: 0o700 });
      log(`Created sessions directory: ${this.BASE_DIR}`);
    }
  }

  private static getSessionDir(sessionId: string): string {
    return join(this.BASE_DIR, sessionId);
  }

  private static ensureSessionDir(sessionId: string): string {
    this.ensureBaseDir();
    const dir = this.getSessionDir(sessionId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
  }

  private static getSessionFilePath(sessionId: string): string {
    return join(this.getSessionDir(sessionId), STORAGE_CONFIG.sessionFile);
  }

  private static getMessagesFilePath(sessionId: string): string {
    return join(this.getSessionDir(sessionId), STORAGE_CONFIG.messagesFile);
  }

  static async saveSession(session: PersistedSession): Promise<void> {
    try {
      this.ensureSessionDir(session.id);
      const filePath = this.getSessionFilePath(session.id);
      const content = JSON.stringify(session, null, 2);
      writeFileSync(filePath, content, 'utf-8');
      log(`Session saved: ${session.id} (${session.name})`);
    } catch (err) {
      logError(`Failed to save session ${session.id}`, err);
      throw err;
    }
  }

  static async loadSession(sessionId: string): Promise<PersistedSession | null> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (!existsSync(filePath)) {
        return null;
      }
      const content = readFileSync(filePath, 'utf-8');
      const session = JSON.parse(content) as PersistedSession;
      log(`Session loaded: ${sessionId}`);
      return session;
    } catch (err) {
      logError(`Failed to load session ${sessionId}`, err);
      return null;
    }
  }

  static async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const dir = this.getSessionDir(sessionId);
      if (!existsSync(dir)) {
        return false;
      }
      rmSync(dir, { recursive: true, force: true });
      log(`Session deleted: ${sessionId}`);
      return true;
    } catch (err) {
      logError(`Failed to delete session ${sessionId}`, err);
      return false;
    }
  }

  static async listSessions(): Promise<SessionMetadata[]> {
    try {
      this.ensureBaseDir();
      const entries = readdirSync(this.BASE_DIR, { withFileTypes: true });
      
      const sessions: SessionMetadata[] = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionId = entry.name;
          const session = await this.loadSession(sessionId);
          if (session) {
            sessions.push({
              id: session.id,
              name: session.name,
              cwd: session.cwd,
              model: session.model,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: session.messageCount,
            });
          }
        }
      }
      
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      
      log(`Listed ${sessions.length} sessions`);
      return sessions;
    } catch (err) {
      logError('Failed to list sessions', err);
      return [];
    }
  }

  static async sessionExists(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionFilePath(sessionId);
    return existsSync(filePath);
  }

  static async saveMessages(sessionId: string, messages: PersistedMessage[]): Promise<void> {
    try {
      this.ensureSessionDir(sessionId);
      const filePath = this.getMessagesFilePath(sessionId);
      const content = JSON.stringify(messages, null, 2);
      writeFileSync(filePath, content, 'utf-8');
      log(`Messages saved for session ${sessionId}: ${messages.length} messages`);
    } catch (err) {
      logError(`Failed to save messages for session ${sessionId}`, err);
      throw err;
    }
  }

  static async loadMessages(sessionId: string): Promise<PersistedMessage[]> {
    try {
      const filePath = this.getMessagesFilePath(sessionId);
      if (!existsSync(filePath)) {
        return [];
      }
      const content = readFileSync(filePath, 'utf-8');
      const messages = JSON.parse(content) as PersistedMessage[];
      log(`Messages loaded for session ${sessionId}: ${messages.length} messages`);
      return messages;
    } catch (err) {
      logError(`Failed to load messages for session ${sessionId}`, err);
      return [];
    }
  }

  static async appendMessage(sessionId: string, message: PersistedMessage): Promise<void> {
    try {
      const messages = await this.loadMessages(sessionId);
      messages.push(message);
      await this.saveMessages(sessionId, messages);
    } catch (err) {
      logError(`Failed to append message to session ${sessionId}`, err);
      throw err;
    }
  }

  static async getMessageCount(sessionId: string): Promise<number> {
    try {
      const messages = await this.loadMessages(sessionId);
      return messages.length;
    } catch {
      return 0;
    }
  }

  static getStoragePath(): string {
    return this.BASE_DIR;
  }

  static async renameSession(sessionId: string, newName: string): Promise<boolean> {
    try {
      const session = await this.loadSession(sessionId);
      if (!session) {
        return false;
      }
      session.name = newName;
      session.updatedAt = Date.now();
      await this.saveSession(session);
      log(`Session renamed: ${sessionId} -> "${newName}"`);
      return true;
    } catch (err) {
      logError(`Failed to rename session ${sessionId}`, err);
      return false;
    }
  }
}

export default SessionStorage;
