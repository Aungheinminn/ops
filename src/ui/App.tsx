import { render, useKeyboard, useTerminalDimensions, useRenderer } from "@opentui/solid";
import { For, Show, createMemo, Index } from "solid-js";
import { createStore } from "solid-js/store";
import { SessionStore, type SessionData, type Message } from "../core/SessionStore";
import type { CLIOptions } from "../config/cli";
import type { KeyEvent, TextareaRenderable, ScrollBoxRenderable } from "@opentui/core";

// Command categories for hybrid routing
// TUI commands: handled directly by the UI layer (instant, no agent needed)
const TUI_COMMANDS = new Set([
  "quit", "q",
  "new", "n",
  "close", "w",
  "switch", "s",
]);

// Agent commands: handled by pi-coding-agent internally (no LLM call)
const AGENT_COMMANDS = new Set([
  "settings",
  "model",
  "scoped-models",
  "export",
  "import",
  "share",
  "copy",
  "name",
  "session",
  "changelog",
  "hotkeys",
  "fork",
  "tree",
  "login",
  "logout",
  "compact",
  "resume",
  "reload",
]);

// All slash commands for autocomplete (combining both categories)
const SLASH_COMMANDS = [
  // TUI commands
  { name: "quit", description: "Quit application (TUI)" },
  { name: "new", description: "Start a new session (TUI)" },
  { name: "close", description: "Close current session (TUI)" },
  { name: "switch", description: "Switch to another session (TUI)" },
  // Agent commands
  { name: "settings", description: "Open settings menu (Agent)" },
  { name: "model", description: "Select model (Agent)" },
  { name: "export", description: "Export session (Agent)" },
  { name: "import", description: "Import session from JSONL (Agent)" },
  { name: "copy", description: "Copy last agent message (Agent)" },
  { name: "share", description: "Share session as GitHub gist (Agent)" },
  { name: "compact", description: "Manually compact session context (Agent)" },
  { name: "fork", description: "Create fork from previous message (Agent)" },
  { name: "tree", description: "Navigate session tree (Agent)" },
  { name: "resume", description: "Resume a different session (Agent)" },
  { name: "reload", description: "Reload keybindings and extensions (Agent)" },
  { name: "changelog", description: "Show changelog entries (Agent)" },
  { name: "hotkeys", description: "Show all keyboard shortcuts (Agent)" },
  { name: "login", description: "Login with OAuth provider (Agent)" },
  { name: "logout", description: "Logout from OAuth provider (Agent)" },
  { name: "session", description: "Show session info and stats (Agent)" },
  { name: "name", description: "Set session display name (Agent)" },
];

function Sidebar(props: { sessions: Record<string, SessionData>; activeId: string | null; focused: boolean; selectedIndex: number }) {
  const sessionsList = createMemo(() => Object.entries(props.sessions));

  return (
    <box width="20%" flexDirection="column" border={true} borderStyle="rounded" borderColor={props.focused ? "#3b82f6" : "#4b5563"}>
      <box paddingLeft={1} paddingRight={1}>
        <text>
          <span style={{ bold: true, fg: props.focused ? "#3b82f6" : "white" }}>
            Sessions
          </span>
        </text>
      </box>
      <box height={1} />
      <For each={sessionsList()}>
        {([id, data], index) => {
          const isActive = () => id === props.activeId;
          const isSelected = () => index() === props.selectedIndex && props.focused;
          const isIdle = () => Date.now() - data.lastActivity > 5 * 60 * 1000;

          return (
            <box height={1} backgroundColor={isActive() ? "#3b82f6" : (isSelected() ? "#1e40af" : undefined)} flexDirection="row">
              <text flexShrink={0}>
                <span style={{ bold: true }}>{isActive() ? "▸ " : (isSelected() ? "→ " : "  ")}</span>
              </text>
              <text flexShrink={0}>
                {data.isLoading ?
                  <span style={{ fg: "yellow" }}>◆ </span> :
                  isIdle() ?
                    <span style={{ fg: isActive() || isSelected() ? "white" : "#9ca3af" }}>◇ </span> :
                    <span style={{ fg: isActive() || isSelected() ? "white" : "#9ca3af" }}>◇ </span>
                }
              </text>
              <text>
                <span style={{ fg: isActive() || isSelected() ? "white" : isIdle() ? "#6b7280" : "#93c5fd" }}>
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
  let commandScroll: ScrollBoxRenderable | undefined

  const [state, setState] = createStore({
    showCommands: false,
    commandFilter: "",
    selectedCommand: 0,
    isInserting: false,
    mode: "build" as "plan" | "build",
    lineCount: 3,
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
    
    // Count lines in the textarea
    const lines = text.split('\n').length
    setState("lineCount", Math.min(10, Math.max(1, lines)))

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
    
    // Scroll selected item into view
    if (!commandScroll) return
    const viewportHeight = Math.min(10, commands.length)
    const scrollBottom = commandScroll.scrollTop + viewportHeight
    if (next < commandScroll.scrollTop) {
      // Scroll up: make selected item the first visible
      commandScroll.scrollTo(next)
    } else if (next + 1 > scrollBottom) {
      // Scroll down: make selected item the last visible
      commandScroll.scrollTo(next - viewportHeight + 1)
    }
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
      setState({
        showCommands: false,
    lineCount: 5,
      })
    }
  }

  const handleKey = (key: KeyEvent) => {
    if (!state.showCommands) {
      // Tab toggles between plan and build mode
      if (key.name === "tab") {
        setState("mode", state.mode === "build" ? "plan" : "build")
        key.preventDefault()
        return
      }
      
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

  const inputHeight = createMemo(() => {
    // textarea height (dynamic 3-10) + mode indicator (1) + spacing (1) + border padding (2)
    const textareaHeight = Math.max(3, Math.min(10, state.lineCount))
    const baseHeight = textareaHeight + 4
    if (state.showCommands) {
      return baseHeight + popupHeight()
    }
    return baseHeight
  })

  return (
    <box
      height={inputHeight()}
      border={true}
      borderStyle="rounded"
      borderColor={state.mode === "plan" ? "#fbbf24" : "#60a5fa"}
      focusedBorderColor={state.mode === "plan" ? "#fbbf24" : "#60a5fa"}
      flexDirection="column"
      focusable={true}
    >
      <Show when={state.showCommands}>
        <scrollbox 
          flexDirection="column" 
          height={popupHeight()}
          scrollbarOptions={{ visible: false }}
          ref={(r: ScrollBoxRenderable) => (commandScroll = r)}
        >
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
        </scrollbox>
      </Show>
      <box flexDirection="row" paddingLeft={1} paddingRight={1} height={state.lineCount}>
        <text flexShrink={0}>
          <span style={{ bold: true, fg: state.mode === "plan" ? "#fbbf24" : "#60a5fa" }}>
            {state.mode === "plan" ? "◎ " : "▶ "}
          </span>
        </text>
        <textarea
          flexGrow={1}
          minHeight={3}
          maxHeight={10}
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
      <box flexGrow={1} minHeight={1} />
      <box height={1} paddingLeft={1}>
        <text>
          <span style={{ bold: true, fg: state.mode === "plan" ? "#fbbf24" : "#60a5fa" }}>
             {state.mode === "plan" ? "Plan " : "Build"}
          </span>
          <span style={{ fg: "#6b7280" }}> (Tab to toggle)</span>
        </text>
      </box>
    </box>
  )
}

function App() {
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();

  const sessions = createMemo(() => SessionStore.getSessions());
  const activeId = createMemo(() => SessionStore.getActiveId());
  const activeSession = createMemo(() => SessionStore.getActiveSession());

  // Sidebar navigation state
  const [sidebarState, setSidebarState] = createStore({
    focused: false,
    selectedIndex: 0,
  });

  // Reset sidebar selection when sessions change or focus is toggled
  const resetSidebarSelection = () => {
    const ids = Object.keys(sessions());
    const currentIdx = ids.indexOf(activeId() || '');
    setSidebarState("selectedIndex", currentIdx >= 0 ? currentIdx : 0);
  };

  const cleanup = () => {
    if (renderer) {
      renderer.destroy();
    }
    setTimeout(() => process.exit(0), 50);
  };

  useKeyboard((e: KeyEvent) => {
    // Handle sidebar navigation when focused
    if (sidebarState.focused && e.eventType === "press") {
      const sessionIds = Object.keys(sessions());
      const currentCount = sessionIds.length;

      if (e.name === "up") {
        setSidebarState("selectedIndex", (prev) => {
          const next = prev - 1;
          return next < 0 ? currentCount - 1 : next;
        });
        e.preventDefault();
        return;
      }

      if (e.name === "down") {
        setSidebarState("selectedIndex", (prev) => {
          const next = prev + 1;
          return next >= currentCount ? 0 : next;
        });
        e.preventDefault();
        return;
      }

      if (e.name === "return") {
        const selectedId = sessionIds[sidebarState.selectedIndex];
        if (selectedId) {
          SessionStore.switchSession(selectedId);
          setSidebarState("focused", false);
        }
        e.preventDefault();
        return;
      }

      if (e.name === "escape") {
        setSidebarState("focused", false);
        e.preventDefault();
        return;
      }

      // Any other key exits sidebar focus mode
      setSidebarState("focused", false);
      return;
    }

    if (e.ctrl && e.name === "s" && e.eventType === "press") {
      if (!sidebarState.focused) {
        resetSidebarSelection();
        setSidebarState("focused", true);
      }
      e.preventDefault();
      return;
    }

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

  // Parse command from input text
  const parseCommand = (text: string): { cmd: string; args: string } | null => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return null;
    
    const spaceIdx = trimmed.indexOf(' ');
    const cmd = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
    const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
    return { cmd, args };
  };

  // Handle TUI-only commands
  const handleTUICommand = async (cmd: string, args: string): Promise<boolean> => {
    switch (cmd) {
      case 'quit':
      case 'q':
        cleanup();
        return true;
        
      case 'new':
      case 'n':
        await SessionStore.createSession(process.cwd(), args || undefined);
        return true;
        
      case 'close':
      case 'w': {
        const id = activeId();
        if (id) {
          SessionStore.closeSession(id);
        }
        return true;
      }
      
      case 'switch':
      case 's': {
        // TODO: Show session switcher UI
        // For now, just switch to next session
        const ids = Object.keys(sessions());
        const currentIdx = ids.indexOf(activeId() || '');
        const nextIdx = (currentIdx + 1) % ids.length;
        if (ids[nextIdx]) {
          SessionStore.switchSession(ids[nextIdx]);
        }
        return true;
      }
        
      default:
        return false;
    }
  };

  // Commands that need special handling in SessionStore layer
  const SESSIONSTORE_COMMANDS = new Set(['export', 'copy', 'name']);

  // Main input handler with hybrid routing
  const handleInput = async (text: string) => {
    const parsed = parseCommand(text);
    
    if (!parsed) {
      // Regular message (not a command) - send to agent
      const id = activeId();
      if (id) {
        await SessionStore.sendMessage(id, text);
      }
      return;
    }
    
    const { cmd, args } = parsed;
    const id = activeId();
    if (!id) return;
    
    // Check if it's a TUI command
    if (TUI_COMMANDS.has(cmd)) {
      const handled = await handleTUICommand(cmd, args);
      if (handled) return;
    }
    
    // Check if it needs SessionStore special handling
    if (SESSIONSTORE_COMMANDS.has(cmd)) {
      const handled = await SessionStore.handleCommand(id, cmd, args);
      if (handled) return;
    }
    
    // Check if it's an agent command (pi-coding-agent handles internally)
    if (AGENT_COMMANDS.has(cmd)) {
      // Send to agent - pi-coding-agent will handle it without LLM call
      await SessionStore.sendMessage(id, text);
      return;
    }
    
    // Unknown command - send to LLM as a regular message
    // The LLM can interpret it or respond that it's unknown
    await SessionStore.sendMessage(id, text);
  };

  const sessionsList = createMemo(() => Object.keys(sessions()));
  if (sessionsList().length === 0) {
    SessionStore.createSession(process.cwd());
  }

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="row"
    >
      <Sidebar sessions={sessions()} activeId={activeId()} focused={sidebarState.focused} selectedIndex={sidebarState.selectedIndex} />
      <box flexGrow={1} flexDirection="column">
        <ChatPanel session={activeSession()} />
        <InputBar onSubmit={handleInput} />
      </box>
    </box>
  );
}

export async function runTUI(options: CLIOptions) {
  await render(App, {
    useMouse: true,
    exitOnCtrlC: false,
  });
}
