import type { ParsedCommand, InputMode } from '../../core/types.js';
import { TUI_COMMANDS, SESSION_COMMANDS, AGENT_COMMANDS } from '../../cli/commands.js';

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  
  return { cmd, args, raw: trimmed };
}

export function isCommand(text: string): boolean {
  return text.trim().startsWith('/');
}

export function getCommandCategory(cmd: string): 'tui' | 'session' | 'agent' | 'unknown' {
  const normalized = cmd.toLowerCase();
  
  if (TUI_COMMANDS.has(normalized)) return 'tui';
  if (SESSION_COMMANDS.has(normalized)) return 'session';
  if (AGENT_COMMANDS.has(normalized)) return 'agent';
  
  return 'unknown';
}

export function toggleMode(current: InputMode): InputMode {
  return current === 'build' ? 'plan' : 'build';
}

export function formatCommand(cmd: string, args: string = ''): string {
  return args ? `/${cmd} ${args}` : `/${cmd}`;
}
