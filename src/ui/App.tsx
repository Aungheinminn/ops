import { render, useKeyboard, useTerminalDimensions, useRenderer } from "@opentui/solid";
import { For, Show, createMemo, Index } from "solid-js";
import { createStore } from "solid-js/store";
import { SessionStore, type SessionData, type Message } from "../core/SessionStore";
import type { CLIOptions } from "../config/cli";
import type { KeyEvent, TextareaRenderable } from "@opentui/core";

// Built-in slash commands from pi-coding-agent
const SLASH_COMMANDS = [
  { name: "quit", description: "Quit application" },
  { name: "new", description: "Start a new session" },
  { name: "session", description: "Show session info and stats" },
  { name: "settings", description: "Open settings menu" },
  { name: "model", description: "Select model (opens selector UI)" },
  { name: "export", description: "Export session (HTML/JSONL)" },
  { name: "import", description: "Import session from JSONL" },
  { name: "copy", description: "Copy last agent message to clipboard" },
  { name: "share", description: "Share session as GitHub gist" },
  { name: "compact", description: "Manually compact session context" },
  { name: "fork", description: "Create fork from previous message" },
  { name: "tree", description: "Navigate session tree" },
  { name: "resume", description: "Resume a different session" },
  { name: "reload", description: "Reload keybindings and extensions" },
  { name: "changelog", description: "Show changelog entries" },
  { name: "hotkeys", description: "Show all keyboard shortcuts" },
  { name: "login", description: "Login with OAuth provider" },
  { name: "logout", description: "Logout from OAuth provider" },
];

function HeaderBar(props: { activeSession?: SessionData }) {
  return (
    <box height={1} backgroundColor="#3b82f6">
      <text>
        <span style={{ bold: true }}>  OPS </span>
        <span> | </span>
        <Show when={props.activeSession}>
          <span>{props.activeSession!.name} </span>
        </Show>
      </text>
      <box flexGrow={1} />
      <text>
        <span style={{ dim: true }}> Ctrl+P:Cmd | Ctrl+N:New | Ctrl+C:Quit </span>
      </text>
    </box>
  );
}

function Sidebar(props: { sessions: Record<string, SessionData>; activeId: string | null }) {
  const sessionsList = createMemo(() => Object.entries(props.sessions));

  return (
    <box width="20%" flexDirection="column" border={true} title="Sessions">
      <For each={sessionsList()}>
        {([id, data]) => {
          const isActive = () => id === props.activeId;
          const isIdle = () => Date.now() - data.lastActivity > 5 * 60 * 1000;

          return (
            <box height={1} backgroundColor={isActive() ? "#3b82f6" : undefined} flexDirection="row">
              <text flexShrink={0}>
                <span style={{ bold: true }}>{isActive() ? "▸ " : "  "}</span>
              </text>
              <text flexShrink={0}>
                {data.isLoading ?
                  <span style={{ fg: "yellow" }}>◆ </span> :
                  isIdle() ?
                    <span style={{ fg: isActive() ? "white" : "#9ca3af" }}>◇ </span> :
                    <span style={{ fg: isActive() ? "white" : "#9ca3af" }}>◇ </span>
                }
              </text>
              <text>
                <span style={{ fg: isActive() ? "white" : isIdle() ? "gray" : "white" }}>
                  {data.name}
                </span>
              </text>
            </box>
          );
        }}
      </For>
    </box>
  );
}

function MessageBubble(props: { message: Message }) {
  const isUser = () => props.message.role === 'user';

  return (
    <box flexDirection="column" padding={1}>
      <text>
        <span style={{ bold: true, fg: isUser() ? "#3b82f6" : "#10b981" }}>
          {isUser() ? "You" : "Agent"}
        </span>
        {props.message.isStreaming && <span style={{ fg: "gray" }}> ◌</span>}
      </text>
      <box paddingLeft={2}>
        <text>{props.message.content}</text>
      </box>
    </box>
  );
}

function ChatPanel(props: { session?: SessionData }) {
  return (
    <box flexGrow={1} flexDirection="column">
      <Show when={props.session} fallback={
        <text>
          <span style={{ fg: "gray" }}>No active session. Press Ctrl+N to create one.</span>
        </text>
      }>
        <scrollbox flexGrow={1}>
          <For each={props.session!.messages}>
            {(message) => <MessageBubble message={message} />}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}

// InputBar with slash command autocomplete
function InputBar(props: { onSubmit: (text: string) => void }) {
  let textarea: TextareaRenderable | undefined

  const [state, setState] = createStore({
    showCommands: false,
    commandFilter: "",
    selectedCommand: 0,
    isInserting: false,
  });

  const filteredCommands = createMemo(() => {
    if (!state.commandFilter) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(cmd =>
      cmd.name.toLowerCase().includes(state.commandFilter.toLowerCase())
    );
  });



  const checkForSlashCommand = () => {
    // Don't reopen popup if we're inserting a command
    if (state.isInserting) return

    const text = textarea?.plainText ?? ""
    const cursorOffset = textarea?.cursorOffset ?? 0

    if (text.startsWith("/") && !text.slice(0, cursorOffset).includes(" ")) {
      const filter = text.slice(1, cursorOffset)
      setState({
        showCommands: true,
        commandFilter: filter,
        selectedCommand: 0,
      })
    } else {
      setState("showCommands", false)
    }
  }

  const insertCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
    const newText = `/${cmd.name} `
    if (textarea) {
      textarea.setText(newText)
      // Move cursor to end
      textarea.cursorOffset = newText.length
    }
    setState("showCommands", false)
  }

  const moveSelection = (direction: number) => {
    const commands = filteredCommands()
    if (commands.length === 0) {
      setState("selectedCommand", 0)
      return
    }
    let next = state.selectedCommand + direction
    // Clamp to valid bounds
    if (next < 0) next = commands.length - 1
    if (next >= commands.length) next = 0
    setState("selectedCommand", next)
  }

  const handleSubmit = () => {
    const text = textarea?.plainText ?? ""
    if (text.trim()) {
      props.onSubmit(text)
      // Only clear if textarea is still valid (not destroyed)
      try {
        textarea?.setText("")
      } catch {
        // Textarea may be destroyed if /quit was submitted
      }
      setState("showCommands", false)
    }
  }

  const handleKey = (key: KeyEvent) => {
    if (!state.showCommands) {
      // Check for slash key to show commands
      if (key.name === "/" && (textarea?.cursorOffset ?? 0) === 0) {
        setState({
          showCommands: true,
          commandFilter: "",
          selectedCommand: 0,
        })
      }
      return
    }

    // Command autocomplete is visible
    const name = key.name?.toLowerCase()

    if (name === "up" || (key.ctrl && name === "p")) {
      moveSelection(-1)
      key.preventDefault()
      return
    }

    if (name === "down" || (key.ctrl && name === "n")) {
      moveSelection(1)
      key.preventDefault()
      return
    }

    if (name === "escape") {
      setState("showCommands", false)
      key.preventDefault()
      return
    }

    if (name === "return" || name === "tab") {
      const commands = filteredCommands()
      const selectedIdx = state.selectedCommand
      
      // Validate selection is in bounds
      if (selectedIdx >= 0 && selectedIdx < commands.length) {
        const cmd = commands[selectedIdx]
        
        // Insert the command into textarea and close popup
        // User will need to press Enter again to actually submit
        const fullCommand = `/${cmd.name} `
        if (textarea) {
          // Set flag to prevent popup from reopening
          setState({
            showCommands: false,
            isInserting: true,
          })
          textarea.setText(fullCommand)
          textarea.cursorOffset = fullCommand.length
          // Clear flag after text is set
          setState("isInserting", false)
        }
        key.preventDefault()
        return
      }
      
      // No valid command selected - close popup
      setState("showCommands", false)
      return
    }
  }

  const popupHeight = createMemo(() => {
    const count = filteredCommands().length
    return Math.min(10, Math.max(1, count))
  })

  return (
    <box
      height={state.showCommands ? 5 + popupHeight() : 5}
      border={true}
      flexDirection="column"
      focusable={true}
    >
      <Show when={state.showCommands}>
        <box flexDirection="column" height={popupHeight()} overflow="hidden">
          <Index each={filteredCommands()}>
            {(cmd, index) => (
              <box
                height={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={index === state.selectedCommand ? "#3b82f6" : undefined}
                flexDirection="row"
                gap={2}
              >
                <text flexShrink={0}>
                  <span style={{ bold: true, fg: index === state.selectedCommand ? "white" : "#3b82f6" }}>
                    /{cmd().name}
                  </span>
                </text>
                <text fg={index === state.selectedCommand ? "white" : "gray"}>
                  {cmd().description}
                </text>
              </box>
            )}
          </Index>
        </box>
      </Show>
      <box flexDirection="row" paddingLeft={1} paddingRight={1} flexGrow={1}>
        <text flexShrink={0}>{"> "}</text>
        <textarea
          flexGrow={1}
          minHeight={1}
          maxHeight={4}
          placeholder={state.showCommands ? "Type to filter commands, Enter to select" : "Enter to send, Shift+Enter for new line, / for commands"}
          textColor="#ffffff"
          focusedTextColor="#ffffff"
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
          onSubmit={handleSubmit}
          onKeyDown={handleKey}
          onContentChange={checkForSlashCommand}
          ref={(val: TextareaRenderable) => {
            textarea = val
            setTimeout(() => textarea?.focus(), 0)
          }}
        />
      </box>
    </box>
  )
}

function StatusBar(props: { activeSession?: SessionData }) {
  return (
    <box height={1} backgroundColor="#1f2937">
      <text>
        <Show when={props.activeSession} fallback={<span style={{ fg: "gray" }}> No session </span>}>
          <span style={{ fg: "gray" }}>
            {props.activeSession!.messages.length} messages |
            {props.activeSession!.isLoading ? " Loading..." : " Ready"}
          </span>
        </Show>
      </text>
      <box flexGrow={1} />
      <text>
        <span style={{ fg: "gray" }}>v1.0.0</span>
      </text>
    </box>
  );
}

function App() {
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();

  const sessions = createMemo(() => SessionStore.getSessions());
  const activeId = createMemo(() => SessionStore.getActiveId());
  const activeSession = createMemo(() => SessionStore.getActiveSession());

  const cleanup = () => {
    if (renderer) {
      renderer.destroy();
    }
    setTimeout(() => process.exit(0), 50);
  };

  useKeyboard((e: KeyEvent) => {
    if (e.ctrl && e.name === "n" && e.eventType === "press") {
      SessionStore.createSession(process.cwd());
    }

    if (e.ctrl && e.name === "w" && e.eventType === "press") {
      const id = activeId();
      if (id) {
        SessionStore.closeSession(id);
      }
    }

    if (e.ctrl && e.name === "Tab" && e.eventType === "press") {
      const ids = Object.keys(sessions());
      const currentIdx = ids.indexOf(activeId() || '');
      const nextIdx = (currentIdx + 1) % ids.length;
      if (ids[nextIdx]) {
        SessionStore.switchSession(ids[nextIdx]);
      }
    }

    if (e.ctrl && e.name === "c" && e.eventType === "press") {
      cleanup();
    }
  });

  // Handle input - some commands are handled directly by TUI
  const handleInput = async (text: string) => {
    const trimmed = text.trim();
    const cmd = trimmed.split(' ')[0];
    
    // Commands handled directly by TUI (like pi-coding-agent's interactive mode)
    switch (cmd) {
      case '/quit':
        cleanup();
        return;
      case '/new':
        await SessionStore.createSession(process.cwd());
        return;
      default:
        // Other commands sent to agent
        const id = activeId();
        if (id) {
          await SessionStore.sendMessage(id, text);
        }
    }
  };

  const sessionsList = createMemo(() => Object.keys(sessions()));
  if (sessionsList().length === 0) {
    SessionStore.createSession(process.cwd());
  }

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
    >
      <HeaderBar activeSession={activeSession()} />

      <box flexGrow={1} flexDirection="row">
        <Sidebar sessions={sessions()} activeId={activeId()} />
        <box flexGrow={1} flexDirection="column">
          <ChatPanel session={activeSession()} />
          <InputBar onSubmit={handleInput} />
        </box>
      </box>

      <StatusBar activeSession={activeSession()} />
    </box>
  );
}

export async function runTUI(options: CLIOptions) {
  await render(App, {
    useMouse: true,
    exitOnCtrlC: false,
  });
}
