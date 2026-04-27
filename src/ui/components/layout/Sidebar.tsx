import { For, createMemo, createSignal, createEffect, onCleanup } from 'solid-js';
import type { SessionData } from '../../../core/types.js';
import type { SessionMetadata } from '../../../core/storage/types.js';
import { Colors } from '../../../core/types.js';

const SPINNER_FRAMES = ['-', '\\', '|', '/'];
const IDLE_INDICATOR = '  ';

interface SidebarProps {
  sessions: Record<string, SessionData>;
  activeId: string | null;
  focused: boolean;
  selectedIndex: number;
  allSessionIds: string[];
  savedSessions?: SessionMetadata[];
}

export function Sidebar(props: SidebarProps) {
  const savedSessionsMap = createMemo(() => {
    const map = new Map<string, SessionMetadata>();
    props.savedSessions?.forEach(s => map.set(s.id, s));
    return map;
  });
  
  const borderColor = () => props.focused ? Colors.borderFocused : Colors.build;

  const [frame, setFrame] = createSignal(0);

  const hasLoadingSession = createMemo(() =>
    props.allSessionIds.some(id => props.sessions[id]?.isLoading)
  );

  createEffect(() => {
    if (!hasLoadingSession()) return;

    const interval = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 200);

    onCleanup(() => clearInterval(interval));
  });
  
  return (
    <box 
      width="20%" 
      flexDirection="column" 
      border={true} 
      borderStyle="rounded" 
      borderColor={borderColor()}
    >
      <box paddingLeft={1} paddingRight={1}>
        <text>
          <span style={{ bold: true, fg: props.focused ? Colors.primary : Colors.white }}>
            Sessions
          </span>
        </text>
      </box>
      <box height={1} />
      
      <For each={props.allSessionIds}>
        {(id, index) => {
          const session = props.sessions[id];
          const savedSession = savedSessionsMap().get(id);
          const isActive = () => id === props.activeId;
          const isSelected = () => index() === props.selectedIndex && props.focused;
          const isLoading = () => session?.isLoading || false;
          const isIdle = () => session ? Date.now() - session.lastActivity > 5 * 60 * 1000 : false;
          
          const bgColor = () => {
            if (isActive()) return Colors.primary;
            if (isSelected()) return Colors.primaryDark;
            return undefined;
          };
          
          const textColor = () => {
            if (isActive() || isSelected()) return Colors.white;
            if (isIdle()) return Colors.muted;
            return Colors.info;
          };
          
          const displayName = () => session?.name || savedSession?.name || 'Unknown';
          
          return (
            <box
              height={1}
              backgroundColor={bgColor()}
              flexDirection="row"
              alignItems="center"
            >
              <text flexShrink={0}>
                <span style={{ bold: true }}>
                  {isActive() ? "▸ " : (isSelected() ? "→ " : "  ")}
                </span>
              </text>
              <text flexShrink={0}>
                {isLoading() ? (
                  <span style={{ fg: "white" }}>{SPINNER_FRAMES[frame()]} </span>
                ) : (
                  <span style={{ fg: textColor() }}>{IDLE_INDICATOR}</span>
                )}
              </text>
              <text>
                <span style={{ fg: textColor() }}>
                  {displayName()}
                </span>
              </text>
            </box>
          );
        }}
      </For>
    </box>
  );
}
