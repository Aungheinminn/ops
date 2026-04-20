import { For, createMemo } from 'solid-js';
import type { SessionData } from '../../../core/types.js';
import { Colors } from '../../../core/types.js';

interface SidebarProps {
  sessions: Record<string, SessionData>;
  activeId: string | null;
  focused: boolean;
  selectedIndex: number;
}

export function Sidebar(props: SidebarProps) {
  const sessionsList = createMemo(() => Object.entries(props.sessions));
  
  const borderColor = () => props.focused ? Colors.borderFocused : Colors.border;
  
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
      <For each={sessionsList()}>
        {([id, data], index) => {
          const isActive = () => id === props.activeId;
          const isSelected = () => index() === props.selectedIndex && props.focused;
          const isIdle = () => Date.now() - data.lastActivity > 5 * 60 * 1000;
          
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
          
          return (
            <box 
              height={1} 
              backgroundColor={bgColor()} 
              flexDirection="row"
            >
              <text flexShrink={0}>
                <span style={{ bold: true }}>
                  {isActive() ? "▸ " : (isSelected() ? "→ " : "  ")}
                </span>
              </text>
              <text flexShrink={0}>
                {data.isLoading ? (
                  <span style={{ fg: "yellow" }}>◆ </span>
                ) : (
                  <span style={{ fg: textColor() }}>◇ </span>
                )}
              </text>
              <text>
                <span style={{ fg: textColor() }}>
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
