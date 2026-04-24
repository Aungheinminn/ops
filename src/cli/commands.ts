import type { Command } from '../core/types.ts';

export const COMMANDS: Command[] = [
  {
    name: 'quit',
    aliases: ['q'],
    description: 'Quit application',
    category: 'tui',
  },
  {
    name: 'new',
    aliases: ['n'],
    description: 'Start a new session',
    category: 'tui',
  },
  {
    name: 'switch',
    aliases: ['s'],
    description: 'Switch to another session',
    category: 'tui',
  },
  {
    name: 'list',
    aliases: ['ls'],
    description: 'List all sessions',
    category: 'tui',
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear chat',
    category: 'tui',
  },
  {
    name: 'export',
    description: 'Export session to file',
    category: 'session',
  },
  {
    name: 'copy',
    description: 'Copy last agent message to clipboard',
    category: 'session',
  },
  {
    name: 'name',
    description: 'Set session display name',
    category: 'session',
  },
  {
    name: 'save',
    description: 'Save session to disk (optionally with new name: /save <name>)',
    category: 'session',
  },
  {
    name: 'load',
    description: 'Load a saved session: /load <session-id>',
    category: 'session',
  },
  {
    name: 'sessions',
    description: 'List all saved sessions on disk',
    category: 'session',
  },
  {
    name: 'delete',
    description: 'Delete a saved session: /delete <session-id>',
    category: 'session',
  },
  {
    name: 'rename',
    description: 'Rename current session: /rename <new-name>',
    category: 'session',
  },
  {
    name: 'settings',
    description: 'Open settings menu',
    category: 'agent',
  },
  {
    name: 'model',
    description: 'Select model',
    category: 'agent',
  },
  {
    name: 'scoped-models',
    description: 'Show scoped models',
    category: 'agent',
  },
  {
    name: 'import',
    description: 'Import session from JSONL',
    category: 'agent',
  },
  {
    name: 'share',
    description: 'Share session as GitHub gist',
    category: 'agent',
  },
  {
    name: 'compact',
    description: 'Manually compact session context',
    category: 'agent',
  },
  {
    name: 'fork',
    description: 'Create fork from previous message',
    category: 'agent',
  },
  {
    name: 'tree',
    description: 'Navigate session tree',
    category: 'agent',
  },
  {
    name: 'resume',
    description: 'Resume a different session',
    category: 'agent',
  },
  {
    name: 'reload',
    description: 'Reload keybindings and extensions',
    category: 'agent',
  },
  {
    name: 'changelog',
    description: 'Show changelog entries',
    category: 'agent',
  },
  {
    name: 'hotkeys',
    description: 'Show all keyboard shortcuts',
    category: 'agent',
  },
  {
    name: 'login',
    description: 'Login with OAuth provider',
    category: 'agent',
  },
  {
    name: 'logout',
    description: 'Logout from OAuth provider',
    category: 'agent',
  },
  {
    name: 'session',
    description: 'Show session info and stats',
    category: 'agent',
  },
];

const buildCommandMap = (): Map<string, Command> => {
  const map = new Map<string, Command>();
  for (const cmd of COMMANDS) {
    map.set(cmd.name, cmd);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        map.set(alias, cmd);
      }
    }
  }
  return map;
};

const commandMap = buildCommandMap();

export function getCommand(name: string): Command | undefined {
  return commandMap.get(name.toLowerCase());
}

export function hasCommand(name: string): boolean {
  return commandMap.has(name.toLowerCase());
}

export function getCommandsByCategory(category: Command['category']): Command[] {
  return COMMANDS.filter(cmd => cmd.category === category);
}

export function getAutocompleteCommands(): Array<{ name: string; description: string }> {
  return COMMANDS.map(cmd => ({
    name: cmd.name,
    description: `${cmd.description} (${cmd.category})`,
  }));
}

export const TUI_COMMANDS = new Set(
  COMMANDS.filter(c => c.category === 'tui').flatMap(c => [c.name, ...(c.aliases || [])])
);

export const AGENT_COMMANDS = new Set(
  COMMANDS.filter(c => c.category === 'agent').flatMap(c => [c.name, ...(c.aliases || [])])
);

export const SESSION_COMMANDS = new Set(
  COMMANDS.filter(c => c.category === 'session').flatMap(c => [c.name, ...(c.aliases || [])])
);
