import { render, useTerminalDimensions, useRenderer } from '@opentui/solid';
import { createMemo, onMount, createSignal, Show, createEffect } from 'solid-js';
import type { CLIOptions } from '../cli/types.js';
import { Colors, type InputMode } from '../core/types.js';
import { SessionStore } from '../core/session/index.js';
import { SessionStorage } from '../core/storage/session-storage.js';
import type { SessionMetadata } from '../core/storage/types.js';
import { configManager } from '../core/config.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { parseCommand, isCommand, getCommandCategory } from './hooks/useCommands.js';
import { ChatPanel } from './components/layout/ChatPanel.js';
import { InputBar } from './components/input/InputBar.js';
import { ApiKeyDialog, ModelSelector, SettingsDialog, SessionManager } from './components/dialogs/index.js';

const DIALOG_COMMANDS = new Set([
  'login',
  'model',
  'settings',
  'sessions',
  'scoped-models',
  'tree',
  'fork',
  'resume',
]);

const DIRECT_AGENT_COMMANDS = new Set([
  'logout',
  'copy',
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

  const [activeDialog, setActiveDialog] = createSignal<{
    type: string;
    args: string;
  } | null>(null);

  const [savedSessions, setSavedSessions] = createSignal<SessionMetadata[]>([]);
  const [savedSessionsLoaded, setSavedSessionsLoaded] = createSignal(false);
  const [queueCount, setQueueCount] = createSignal(0);
  const [inputMode, setInputMode] = createSignal<InputMode>('build');

  const sessions = createMemo(() => SessionStore.getSessions());
  const activeId = createMemo(() => SessionStore.getActiveId());
  const activeSession = createMemo(() => SessionStore.getActiveSession());
  const sessionIds = createMemo(() => Object.keys(sessions()));

  // Track queue state for active session
  const activeQueueState = createMemo(() => {
    const id = activeId();
    if (!id) return { steering: [], followUp: [], totalCount: 0 };
    return SessionStore.getQueueState(id);
  });

  // Update queue count when queue state changes
  createEffect(() => {
    const state = activeQueueState();
    setQueueCount(state.totalCount);
  });

  const allSessionIds = createMemo(() => {
    const active = sessionIds();
    const saved = savedSessions()
      .filter(s => !active.includes(s.id));
    
    const allIds = [...active, ...saved.map(s => s.id)];
    allIds.sort((a, b) => b.localeCompare(a));
    
    return allIds;
  });

  const activeIndex = createMemo(() => {
    const ids = allSessionIds();
    return ids.indexOf(activeId() || '');
  });

  // Convert sessions to SessionListItem format for SessionManager
  const sessionListItems = createMemo(() => {
    const items: Record<string, any> = {};
    const allIds = allSessionIds();
    
    for (const id of allIds) {
      const session = sessions()[id];
      if (session) {
        items[id] = {
          id: session.id,
          name: session.name,
          cwd: session.cwd,
          lastActivity: session.lastActivity,
          messages: session.messages,
          isLoading: session.isLoading,
          isActive: id === activeId(),
        };
      } else {
        // Check in saved sessions
        const saved = savedSessions().find(s => s.id === id);
        if (saved) {
          items[id] = {
            id: saved.id,
            name: saved.name,
            cwd: saved.cwd,
            lastActivity: saved.updatedAt,
            messages: [],
            isLoading: false,
            isActive: false,
          };
        }
      }
    }
    
    return items;
  });

  onMount(async () => {
    const diskSessions = await SessionStorage.listSessions();
    setSavedSessions(diskSessions);
    setSavedSessionsLoaded(true);
    
    if (diskSessions.length > 0) {
      console.log(`Found ${diskSessions.length} saved sessions on disk`);
    }
    
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

    onOpenSessionManager: () => {
      if (activeDialog()) return;
      setActiveDialog({ type: 'sessions', args: '' });
    },

    dialogFocused: () => !!activeDialog(),

    onRenameSession: () => {
      if (activeDialog()) return;
      setActiveDialog({ type: 'rename', args: '' });
    },
  });

  const handleInput = async (text: string, mode: InputMode, options?: { forceSteer?: boolean; forceFollowUp?: boolean }) => {
    const id = activeId();
    if (!id) return;

    if (isCommand(text)) {
      const parsed = parseCommand(text);
      if (!parsed) {
        await SessionStore.sendMessageWithMode(id, text, mode, options);
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
          // Check if this is the sessions dialog command
          if (parsed.cmd === 'sessions') {
            setActiveDialog({ type: 'sessions', args: parsed.args });
            return;
          }
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

          await SessionStore.sendMessageWithMode(id, text, mode, options);
          return;
        }
      }
    }

    await SessionStore.sendMessageWithMode(id, text, mode, options);
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

  const handleSessionSelect = async (sessionId: string, isActiveSession: boolean) => {
    const activeIds = sessionIds();
    
    if (!isActiveSession && !activeIds.includes(sessionId)) {
      // Need to load saved session
      const savedSession = savedSessions().find(s => s.id === sessionId);
      if (savedSession) {
        console.log(`Loading saved session: ${savedSession.name}`);
        const loadedSession = await SessionStore.loadSavedSession(sessionId);
        if (loadedSession) {
          await SessionStore.createSessionFromSaved(loadedSession, props.defaultModel);
        }
      }
    } else {
      SessionStore.switchSession(sessionId);
    }
    setActiveDialog(null);
  };

  const handleSessionDelete = async (sessionId: string) => {
    await SessionStore.deleteSavedSession(sessionId);
    // Refresh saved sessions list
    const diskSessions = await SessionStorage.listSessions();
    setSavedSessions(diskSessions);
  };

  const handleSessionRename = (sessionId: string) => {
    // Open rename dialog
    setActiveDialog({ type: 'rename', args: '' });
  };

  const renderDialog = () => {
    const dialog = activeDialog();
    const sessionData = activeSession();
    
    if (!dialog || !sessionData) return null;

    switch (dialog.type) {
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

      case 'sessions':
        return (
          <SessionManager
            sessions={sessionListItems()}
            activeId={activeId()}
            savedSessions={savedSessions()}
            onSelect={handleSessionSelect}
            onDelete={handleSessionDelete}
            onRename={handleSessionRename}
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
                {`Command: /${dialog.type}`}
              </span>
            </text>
            <text>
              <span style={{ fg: "#6b7280" }}>
                {dialog.args ? `Args: ${dialog.args}` : "No arguments"}
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
  };

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
    >
      {/* Main content layer - always rendered */}
      <box flexGrow={1} flexDirection="column">
        <ChatPanel session={activeSession()} queueState={activeQueueState()} mode={inputMode()} />
        <InputBar
          onSubmit={handleInput}
          currentModel={activeSession()?.session?.model}
          isStreaming={activeSession()?.isLoading}
          queueCount={queueCount()}
          mode={inputMode()}
          onModeChange={setInputMode}
        />
      </box>

      {/* Dialog overlay layer - rendered on top when active */}
      <Show when={activeDialog()}>
        <box
          position="absolute"
          width={dimensions().width}
          height={dimensions().height}
          flexDirection="row"
          justifyContent="center"
          alignItems="center"
        >
          {renderDialog()}
        </box>
      </Show>
    </box>
  );
}

export async function runTUI(options: CLIOptions): Promise<void> {
  const appOptions = options;

  function AppWithOptions() {
    return App({ defaultModel: appOptions.model });
  }

  await render(AppWithOptions, {
    useMouse: true,
    exitOnCtrlC: false,
  });
}
