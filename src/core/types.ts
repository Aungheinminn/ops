export type Role = 'user' | 'agent';

export type InputMode = 'plan' | 'build';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface Session {
  id: string;
  name: string;
  cwd: string;
  lastActivity: number;
  messages: Message[];
  isLoading: boolean;
}

export interface SessionData extends Session {
  session: import('@mariozechner/pi-coding-agent').AgentSession;
  services: import('@mariozechner/pi-coding-agent').AgentSessionServices;
  unsubscribe: () => void;
}

export interface SessionSummary {
  id: string;
  name: string;
  lastActivity: number;
  isActive: boolean;
  isLoading: boolean;
  isIdle: boolean;
}

export interface TerminalDimensions {
  width: number;
  height: number;
}

export interface SidebarState {
  focused: boolean;
  selectedIndex: number;
}

export interface InputBarState {
  showCommands: boolean;
  commandFilter: string;
  selectedCommand: number;
  isInserting: boolean;
  mode: InputMode;
  lineCount: number;
}

export type CommandCategory = 'tui' | 'agent' | 'session' | 'unknown';

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  category: CommandCategory;
}

export interface ParsedCommand {
  cmd: string;
  args: string;
  raw: string;
}

export type CommandHandler = (sessionId: string, args: string) => Promise<boolean>;

export function hasContent(msg: unknown): msg is { content: string } {
  return msg !== null && 
         typeof msg === 'object' && 
         'content' in msg && 
         typeof (msg as { content: unknown }).content === 'string';
}

export function hasText(msg: unknown): msg is { text: string } {
  return msg !== null && 
         typeof msg === 'object' && 
         'text' in msg && 
         typeof (msg as { text: unknown }).text === 'string';
}

export interface ContentItem {
  type?: string;
  text?: string;
  thinking?: string;
  toolUse?: unknown;
  toolResult?: unknown;
}

export function extractMessageContent(msg: unknown): string {
  if (typeof msg === 'string') {
    return msg;
  }
  
  if (msg && typeof msg === 'object') {
    // Handle content array (pi-coding-agent format)
    if ('content' in msg) {
      const content = (msg as { content: unknown }).content;
      
      // If content is a string, return it directly
      if (typeof content === 'string') {
        return content;
      }
      
      // If content is an array, extract from each item
      if (Array.isArray(content)) {
        return content.map((item: ContentItem) => {
          if (typeof item === 'string') return item;
          
          // Handle text content
          if (item.type === 'text' && item.text) {
            return item.text;
          }
          
          // Handle thinking content
          if (item.type === 'thinking' && item.thinking) {
            return item.thinking;
          }
          
          // Handle plain text field
          if (item.text) {
            return item.text;
          }
          
          return '';
        }).join('');
      }
    }
    
    // Handle direct text field
    if (hasText(msg)) {
      return msg.text;
    }
  }
  
  return '';
}

export const Colors = {
  primary: '#3b82f6',
  primaryDark: '#1e40af',
  success: '#10b981',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#93c5fd',
  muted: '#6b7280',
  light: '#9ca3af',
  white: '#ffffff',
  border: '#4b5563',
  borderFocused: '#3b82f6',
  plan: '#fbbf24',
  build: '#60a5fa',
};

export const IDLE_TIMEOUT = 5 * 60 * 1000;
export const SESSION_TIMEOUT = 30 * 60 * 1000;
export const DEFAULT_SESSION_PREFIX = 'Session';
