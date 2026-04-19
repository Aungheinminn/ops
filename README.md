# OPS - Multi-Session Coding Agent CLI

A Claude Code-inspired TUI with multi-session support using the pi-coding-agent SDK.

## Features

- **Multi-Session Support**: Create and manage multiple agent sessions
- **OpenTUI Interface**: Built with SolidJS and OpenTUI for a modern terminal UI
- **Keyboard Shortcuts**: Vim-style keybindings for navigation
- **Slash Commands**: `/new`, `/switch`, `/close`, `/models`, etc.
- **Session Management**: Auto-cleanup of inactive sessions (30min timeout)
- **Real-time Updates**: Live message streaming and tool execution display

## Tech Stack

- **Runtime**: Bun
- **TUI Framework**: OpenTUI (@opentui/core, @opentui/solid)
- **Agent SDK**: @mariozechner/pi-coding-agent
- **UI Framework**: SolidJS
- **Language**: TypeScript

## Installation

```bash
bun install
```

## Development

```bash
# Run in watch mode
bun run dev

# Type check
bun run typecheck

# Build for production
bun run build
```

## Usage

```bash
# Run the CLI
./bin/ops

# With options
./bin/ops --dir /path/to/project --model claude-3-5-sonnet
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Create new session |
| `Ctrl+W` | Close current session |
| `Ctrl+Tab` | Switch to next session |
| `Ctrl+C` | Quit application |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/new [name]` | Create new session |
| `/switch <id>` | Switch to session |
| `/close [id]` | Close a session |
| `/list` | List all sessions |
| `/models` | Show available models |
| `/clear` | Clear chat |
| `/quit` | Exit application |

## Project Structure

```
src/
├── index.tsx              # Entry point
├── config/                # Configuration
│   ├── cli.ts            # CLI argument parsing
│   └── constants.ts      # Default values
├── core/                  # Core logic
│   └── SessionStore.ts   # Multi-session management
└── ui/                    # TUI components
    ├── App.tsx           # Main application
    └── components/       # UI components
```

## License

MIT
