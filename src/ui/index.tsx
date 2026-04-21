import { render, useTerminalDimensions, useRenderer } from '@opentui/solid';
import { createMemo, onMount, createSignal, Show } from 'solid-js';
import type { CLIOptions } from '../cli/types.js';
import { SessionStore } from '../core/session/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useNavigation } from './hooks/useNavigation.js';
import { parseCommand, isCommand, getCommandCategory } from './hooks/useCommands.js';
import { AGENT_COMMANDS } from '../cli/commands.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { ChatPanel } from './components/layout/ChatPanel.js';
import { InputBar } from './components/input/InputBar.js';
import { ApiKeyDialog, ModelSelector, SettingsDialog } from './components/dialogs/index.js';
import type { Message } from '../core/types.js';
import { ulid } from 'ulid';

// Dialog types that need interactive UI
const DIALOG_COMMANDS = new Set([
  'login',
  'model', 
  'settings',
  'scoped-models',
  'tree',
  'fork',
  'resume',
]);

// Agent commands that can be handled directly without dialog
const DIRECT_AGENT_COMMANDS = new Set([
  'logout',
  'copy',
  'session',
  'compact',
  'reload',
  'changelog',
  'hotkeys',
  'export',
  'share',
]);

function App() {
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();
  const { state: navState, actions: navActions } = useNavigation();
  
  // Dialog state for interactive commands
  const [activeDialog, setActiveDialog] = createSignal<{
    type: string;
    args: string;
  } | null>(null);
  
  const sessions = createMemo(() => SessionStore.getSessions());
  const activeId = createMemo(() => SessionStore.getActiveId());
  const activeSession = createMemo(() => SessionStore.getActiveSession());
  const sessionIds = createMemo(() => Object.keys(sessions()));
  
  const activeIndex = createMemo(() => {
    const ids = sessionIds();
    return ids.indexOf(activeId() || '');
  });
  
  onMount(() => {
    if (sessionIds().length === 0) {
      SessionStore.createSession(process.cwd());
    }
  });
  
  const cleanup = () => {
    if (renderer) {
      renderer.destroy();
    }
    setTimeout(() => process.exit(0), 50);
  };
  
  useKeyboard({
    onNewSession: () => {
      if (activeDialog()) return; // Don't create session when dialog is open
      SessionStore.createSession(process.cwd());
    },

    onCloseSession: () => {
      if (activeDialog()) return;
      const id = activeId();
      if (id) SessionStore.closeSession(id);
    },

    onSwitchSession: () => {
      if (activeDialog()) return;
      const ids = sessionIds();
      const currentIdx = activeIndex();
      const nextIdx = (currentIdx + 1) % ids.length;
      if (ids[nextIdx]) {
        SessionStore.switchSession(ids[nextIdx]);
      }
    },

    onQuit: cleanup,

    onEscape: () => {
      if (activeDialog()) {
        handleDialogCancel();
      }
    },

    // Note: Dialogs handle their own Enter key - don't add global handler here

    onFocusSidebar: () => {
      if (activeDialog()) return;
      if (!navState.sidebar.focused) {
        navActions.focusSidebar(sessionIds().length, activeIndex());
      }
    },

    sidebarFocused: () => navState.sidebar.focused,
    dialogFocused: () => !!activeDialog(),

    onSidebarNavigate: (direction) => {
      const maxIndex = sessionIds().length - 1;
      if (direction === 'up') {
        navActions.navigateUp(maxIndex);
      } else {
        navActions.navigateDown(maxIndex);
      }
    },

    onSidebarSelect: () => {
      const ids = sessionIds();
      const selectedId = ids[navState.sidebar.selectedIndex];
      if (selectedId) {
        SessionStore.switchSession(selectedId);
        navActions.defocusSidebar();
      }
    },

    onSidebarDefocus: () => navActions.defocusSidebar(),
  });
  
  const handleInput = async (text: string) => {
    const id = activeId();
    if (!id) return;
    
    if (isCommand(text)) {
      const parsed = parseCommand(text);
      if (!parsed) {
        await SessionStore.sendMessage(id, text);
        return;
      }
      
      const category = getCommandCategory(parsed.cmd);
      
      switch (category) {
        case 'tui': {
          switch (parsed.cmd) {
            case 'quit':
            case 'q':
              cleanup();
              return;
            case 'new':
            case 'n':
              await SessionStore.createSession(process.cwd(), parsed.args || undefined);
              return;
            case 'close':
            case 'w':
              if (id) SessionStore.closeSession(id);
              return;
            case 'switch':
            case 's': {
              const ids = sessionIds();
              const currentIdx = activeIndex();
              const nextIdx = (currentIdx + 1) % ids.length;
              if (ids[nextIdx]) {
                SessionStore.switchSession(ids[nextIdx]);
              }
              return;
            }
          }
          break;
        }
        
        case 'session': {
          const handled = await SessionStore.handleCommand(id, parsed.cmd, parsed.args);
          if (handled) return;
          break;
        }
        
        case 'agent': {
          // Handle agent commands
          const cmd = parsed.cmd.toLowerCase();
          
          // Commands that need interactive dialogs
          if (DIALOG_COMMANDS.has(cmd)) {
            setActiveDialog({ type: cmd, args: parsed.args });
            return;
          }
          
          // Commands that can be handled directly
          if (DIRECT_AGENT_COMMANDS.has(cmd)) {
            await handleDirectAgentCommand(id, cmd, parsed.args);
            return;
          }
          
          // Unknown agent command - send to session
          await SessionStore.sendMessage(id, text);
          return;
        }
      }
    }
    
    await SessionStore.sendMessage(id, text);
  };
  
  // Handle agent commands that don't need interactive UI
  const handleDirectAgentCommand = async (sessionId: string, cmd: string, args: string) => {
    const sessionData = activeSession();
    if (!sessionData) return;
    
    switch (cmd) {
      case 'logout': {
        const provider = args.trim() || 'anthropic';
        sessionData.services.authStorage.logout(provider);
        await SessionStore.sendMessage(sessionId, `Logged out from ${provider}`);
        return;
      }
      
      case 'session': {
        const info = `Session: ${sessionData.name}
ID: ${sessionData.id}
CWD: ${sessionData.cwd}
Messages: ${sessionData.messages.length}`;
        await SessionStore.sendMessage(sessionId, info);
        return;
      }
      
      case 'compact': {
        // Send compact command to session
        await sessionData.session.sendUserMessage('/compact');
        return;
      }
      
      case 'reload': {
        // Reload settings, extensions, etc.
        sessionData.services.settingsManager.reload();
        sessionData.services.modelRegistry.refresh();
        await SessionStore.sendMessage(sessionId, 'Settings and extensions reloaded');
        return;
      }
      
      case 'copy': {
        // Copy last agent message - handled by session command handler
        await SessionStore.handleCommand(sessionId, 'copy', args);
        return;
      }
      
      default: {
        // Send other commands to session
        await sessionData.session.sendUserMessage(`/${cmd} ${args}`.trim());
      }
    }
  };
  
  // Handle dialog completion
  const handleDialogComplete = async (result?: unknown) => {
    const dialog = activeDialog();
    if (!dialog) return;
    
    const sessionId = activeId();
    if (!sessionId) {
      setActiveDialog(null);
      return;
    }
    
    const sessionData = activeSession();
    if (!sessionData) {
      setActiveDialog(null);
      return;
    }
    
    // Handle result based on dialog type
    switch (dialog.type) {
      case 'login': {
        // Login dialog handles authStorage directly
        if (result) {
          await SessionStore.sendMessage(sessionId, 'API key saved successfully');
        }
        break;
      }
      
      case 'model': {
        if (result && typeof result === 'object' && 'id' in result) {
          const model = result as { id: string; provider: string };
          await sessionData.session.setModel(model as any);
          await SessionStore.sendMessage(sessionId, `Model changed to ${model.id}`);
        }
        break;
      }
      
      case 'settings': {
        // Settings already saved by dialog
        await SessionStore.sendMessage(sessionId, 'Settings updated');
        break;
      }
    }
    
    setActiveDialog(null);
  };
  
  const handleDialogCancel = () => {
    setActiveDialog(null);
  };
  
  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="row"
    >
      <Sidebar
        sessions={sessions()}
        activeId={activeId()}
        focused={navState.sidebar.focused}
        selectedIndex={navState.sidebar.selectedIndex}
      />
      <box flexGrow={1} flexDirection="column">
        <ChatPanel session={activeSession()} />
        
        <Show
          when={activeDialog()}
          fallback={<InputBar onSubmit={handleInput} />}
        >
          {(dialog) => {
            const sessionData = activeSession();
            if (!sessionData) return null;

            // Render appropriate dialog based on type
            switch (dialog().type) {
              case 'login':
                return (
                  <ApiKeyDialog
                    authStorage={sessionData.services.authStorage}
                    onComplete={(success) => handleDialogComplete(success)}
                    onCancel={handleDialogCancel}
                  />
                );

              case 'model':
                return (
                  <ModelSelector
                    modelRegistry={sessionData.services.modelRegistry}
                    currentModel={sessionData.session.model}
                    onSelect={(model) => handleDialogComplete(model)}
                    onCancel={handleDialogCancel}
                  />
                );

              case 'settings':
                return (
                  <SettingsDialog
                    settingsManager={sessionData.services.settingsManager}
                    onComplete={() => handleDialogComplete(true)}
                    onCancel={handleDialogCancel}
                  />
                );

              case 'scoped-models':
              case 'tree':
              case 'fork':
              case 'resume':
                // Placeholder for other dialogs
                return (
                  <box
                    height={10}
                    border={true}
                    borderStyle="rounded"
                    borderColor="#3b82f6"
                    flexDirection="column"
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text>
                      <span style={{ bold: true, fg: "#3b82f6" }}>
                        {`Command: /${dialog().type}`}
                      </span>
                    </text>
                    <text>
                      <span style={{ fg: "#6b7280" }}>
                        {dialog().args ? `Args: ${dialog().args}` : "No arguments"}
                      </span>
                    </text>
                    <box flexGrow={1} />
                    <text>
                      <span style={{ fg: "#fbbf24" }}>
                        This dialog will be implemented in a future phase.
                      </span>
                    </text>
                    <text>
                      <span style={{ fg: "#6b7280" }}>
                        Press Esc or Enter to close
                      </span>
                    </text>
                  </box>
                );

              default:
                return null;
            }
          }}
        </Show>
      </box>
    </box>
  );
}

export async function runTUI(_options: CLIOptions): Promise<void> {
  await render(App, {
    useMouse: true,
    exitOnCtrlC: false,
  });
}
