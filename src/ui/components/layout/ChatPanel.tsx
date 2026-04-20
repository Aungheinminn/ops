import { For, Show } from 'solid-js';
import type { SessionData, Message } from '../../../core/types.js';
import { Colors } from '../../../core/types.js';

interface ChatPanelProps {
  session?: SessionData;
}

function MessageBubble(props: { message: Message }) {
  const isUser = () => props.message.role === 'user';
  
  return (
    <box flexDirection="column" padding={1}>
      <text>
        <span style={{ bold: true, fg: isUser() ? Colors.primary : Colors.success }}>
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

function EmptyState() {
  return (
    <text>
      <span style={{ fg: Colors.muted }}>
        No active session. Press Ctrl+N to create one.
      </span>
    </text>
  );
}

export function ChatPanel(props: ChatPanelProps) {
  return (
    <box flexGrow={1} flexDirection="column">
      <Show when={props.session} fallback={<EmptyState />}>
        <scrollbox flexGrow={1}>
          <For each={props.session!.messages}>
            {(message) => <MessageBubble message={message} />}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}
