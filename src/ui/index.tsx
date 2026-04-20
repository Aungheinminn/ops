import { render, useTerminalDimensions, useRenderer } from '@opentui/solid';
import { createMemo, onMount } from 'solid-js';
import type { CLIOptions } from '../cli/types.js';
import { SessionStore } from '../core/session/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useNavigation } from './hooks/useNavigation.js';
import { parseCommand, isCommand, getCommandCategory } from './hooks/useCommands.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { ChatPanel } from './components/layout/ChatPanel.js';
import { InputBar } from './components/input/InputBar.js';

function App() {
  const dimensions = useTerminalDimensions();
  const renderer = useRenderer();
  const { state: navState, actions: navActions } = useNavigation();
  
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
    onNewSession: () => SessionStore.createSession(process.cwd()),
    
    onCloseSession: () => {
      const id = activeId();
      if (id) SessionStore.closeSession(id);
    },
    
    onSwitchSession: () => {
      const ids = sessionIds();
      const currentIdx = activeIndex();
      const nextIdx = (currentIdx + 1) % ids.length;
      if (ids[nextIdx]) {
        SessionStore.switchSession(ids[nextIdx]);
      }
    },
    
    onQuit: cleanup,
    
    onFocusSidebar: () => {
      if (!navState.sidebar.focused) {
        navActions.focusSidebar(sessionIds().length, activeIndex());
      }
    },
    
    sidebarFocused: () => navState.sidebar.focused,
    
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
          await SessionStore.sendMessage(id, text);
          return;
        }
      }
    }
    
    await SessionStore.sendMessage(id, text);
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
        <InputBar onSubmit={handleInput} />
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
