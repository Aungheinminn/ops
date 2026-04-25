import { render, useTerminalDimensions, useRenderer } from '@opentui/solid';
import { createMemo, onMount, createSignal, Show } from 'solid-js';
import type { CLIOptions } from '../cli/types.js';
import { Colors } from '../core/types.js';
import { SessionStore } from '../core/session/index.js';
import { SessionStorage } from '../core/storage/session-storage.js';
import type { SessionMetadata } from '../core/storage/types.js';
import { configManager } from '../core/config.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useNavigation } from './hooks/useNavigation.js';
import { parseCommand, isCommand, getCommandCategory } from './hooks/useCommands.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { ChatPanel } from './components/layout/ChatPanel.js';
import { InputBar } from './components/input/InputBar.js';
import { ApiKeyDialog, ModelSelector, SettingsDialog } from './components/dialogs/index.js';

const DIALOG_COMMANDS = new Set([
  'login',
  'model',
  'settings',
  'scoped-models',
  'tree',
  'fork',
  'resume',
]);

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

interface AppProps {
  defaultModel?: string;
}

function App(props: AppProps) {
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();
  const { state: navState, actions: navActions } = useNavigation();

  const [activeDialog, setActiveDialog] = createSignal<{
    type: string;
    args: string;
  } | null>(null);

  const [savedSessions, setSavedSessions] = createSignal<SessionMetadata[]>([]);
  const [savedSessionsLoaded, setSavedSessionsLoaded] = createSignal(false);

  const sessions = createMemo(() => SessionStore.getSessions());
  const activeId = createMemo(() => SessionStore.getActiveId());
  const activeSession = createMemo(() => SessionStore.getActiveSession());
  const sessionIds = createMemo(() => Object.keys(sessions()));

  // Combine and sort all sessions by last activity (most recent first)
  const allSessionIds = createMemo(() => {
    const active = sessionIds();
    const saved = savedSessions()
      .filter(s => !active.includes(s.id));
    
    // Create a combined list with timestamps for sorting
    const allSessions = [
      ...active.map(id => {
        const session = sessions()[id];
        return { id, timestamp: session?.lastActivity || 0 };
      }),
      ...saved.map(s => ({ id: s.id, timestamp: s.updatedAt }))
    ];
    
    // Sort by timestamp descending (most recent first)
    allSessions.sort((a, b) => b.timestamp - a.timestamp);
    
    return allSessions.map(s => s.id);
  });

  const activeIndex = createMemo(() => {
    const ids = allSessionIds();
    return ids.indexOf(activeId() || '');
  });

  onMount(async () => {
    // Load saved sessions from disk first
    const diskSessions = await SessionStorage.listSessions();
    setSavedSessions(diskSessions);
    setSavedSessionsLoaded(true);
    
    if (diskSessions.length > 0) {
      console.log(`Found ${diskSessions.length} saved sessions on disk`);
    }
    
    // Only create a new session if there are no active sessions
    if (sessionIds().length === 0) {
      await SessionStore.createSession(process.cwd(), undefined, props.defaultModel);
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
      if (activeDialog()) return;
      SessionStore.createSession(process.cwd(), undefined, props.defaultModel);
    },

    onCloseSession: () => {
      if (activeDialog()) return;
      const id = activeId();
      if (id) SessionStore.closeSession(id);
    },

    onSwitchSession: () => {
      if (activeDialog()) return;
      const ids = allSessionIds();
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



    onFocusSidebar: () => {
      if (activeDialog()) return;
      if (!navState.sidebar.focused) {
        navActions.focusSidebar(allSessionIds().length, activeIndex());
      }
    },

    sidebarFocused: () => navState.sidebar.focused,
    dialogFocused: () => !!activeDialog(),

    onSidebarNavigate: (direction) => {
      const maxIndex = allSessionIds().length - 1;
      if (direction === 'up') {
        navActions.navigateUp(maxIndex);
      } else {
        navActions.navigateDown(maxIndex);
      }
    },

    onSidebarSelect: async () => {
      const ids = allSessionIds();
      const activeIds = sessionIds();
      const selectedId = ids[navState.sidebar.selectedIndex];
      if (selectedId) {
        // Check if this is a saved session (not currently active)
        if (!activeIds.includes(selectedId)) {
          // Load the saved session from disk
          const savedSession = savedSessions().find(s => s.id === selectedId);
          if (savedSession) {
            console.log(`Loading saved session: ${savedSession.name}`);
            // Load the full session data from disk
            const loadedSession = await SessionStore.loadSavedSession(selectedId);
            if (loadedSession) {
              // Create a new session with the saved data
              const newSessionId = await SessionStore.createSessionFromSaved(loadedSession, props.defaultModel);
              if (newSessionId) {
                setSavedSessions(prev => prev.filter(s => s.id !== selectedId));
                navActions.defocusSidebar();
                return;
              }
            }
          }
        }
        // For active sessions, just switch
        SessionStore.switchSession(selectedId);
        navActions.defocusSidebar();
      }
    },

    onSidebarDefocus: () => navActions.defocusSidebar(),

    onRenameSession: () => {
      if (activeDialog()) return;
      setActiveDialog({ type: 'rename', args: '' });
    },
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
              await SessionStore.createSession(process.cwd(), parsed.args || undefined, props.defaultModel);
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
          const cmd = parsed.cmd.toLowerCase();

          if (DIALOG_COMMANDS.has(cmd)) {
            setActiveDialog({ type: cmd, args: parsed.args });
            return;
          }

          if (DIRECT_AGENT_COMMANDS.has(cmd)) {
            await handleDirectAgentCommand(id, cmd, parsed.args);
            return;
          }

          await SessionStore.sendMessage(id, text);
          return;
        }
      }
    }

    await SessionStore.sendMessage(id, text);
  };

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
        await sessionData.session.sendUserMessage('/compact');
        return;
      }

      case 'reload': {
        sessionData.services.settingsManager.reload();
        sessionData.services.modelRegistry.refresh();
        await SessionStore.sendMessage(sessionId, 'Settings and extensions reloaded');
        return;
      }

      case 'copy': {
        await SessionStore.handleCommand(sessionId, 'copy', args);
        return;
      }

      default: {
        await sessionData.session.sendUserMessage(`/${cmd} ${args}`.trim());
      }
    }
  };

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

    switch (dialog.type) {
      case 'login': {
        if (result) {
          await SessionStore.sendMessage(sessionId, 'API key saved successfully');
        }
        break;
      }

      case 'model': {
        if (result && typeof result === 'object' && 'id' in result) {
          const model = result as any;
          await sessionData.session.setModel(model);
          // Persist model selection to config
          configManager.set('defaultModel', model.id);
          await configManager.save();
        }
        break;
      }

      case 'settings': {
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
        allSessionIds={allSessionIds()}
        savedSessions={savedSessions()}
      />
      <box flexGrow={1} flexDirection="column">
        <ChatPanel session={activeSession()} />

        <Show
          when={activeDialog()}
          fallback={<InputBar onSubmit={handleInput} currentModel={activeSession()?.session?.model} />}
        >
              {(dialog) => {
                const sessionData = activeSession();
                if (!sessionData) return null;

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

                  case 'rename': {
                    const session = activeSession();
                    let textareaRef: { plainText: string; focus: () => void } | undefined;
                    
                    const handleRenameSubmit = () => {
                      const id = activeId();
                      const newName = textareaRef?.plainText.trim() || '';
                      if (id && newName) {
                        SessionStore.renameSession(id, newName);
                      }
                      setActiveDialog(null);
                    };
                    
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
                          <span style={{ bold: true, fg: "#3b82f6" }}>Rename Session</span>
                        </text>
                        <text>
                          <span style={{ fg: "#6b7280" }}>Current: {session?.name || 'Unknown'}</span>
                        </text>
                        <box height={1} />
                        <textarea
                          flexGrow={1}
                          minHeight={1}
                          maxHeight={1}
                          placeholder="Enter new session name..."
                          textColor={Colors.white}
                          focusedTextColor={Colors.white}
                          keyBindings={[
                            { name: "return", action: "submit" },
                          ]}
                          onSubmit={handleRenameSubmit}
                          ref={(val: { plainText: string; focus: () => void }) => {
                            textareaRef = val;
                            setTimeout(() => val?.focus(), 0);
                          }}
                        />
                        <box flexGrow={1} />
                        <text>
                          <span style={{ fg: "#6b7280" }}>Press Enter to save, Esc to cancel</span>
                        </text>
                      </box>
                    );
                  }

                  default:
                    return null;
                }
              }}
            </Show>
      </box>
    </box>
  );
}

export async function runTUI(options: CLIOptions): Promise<void> {
  // Store CLI options for use in the app
  const appOptions = options;

  function AppWithOptions() {
    return App({ defaultModel: appOptions.model });
  }

  await render(AppWithOptions, {
    useMouse: true,
    exitOnCtrlC: false,
  });
}
