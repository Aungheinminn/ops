import { For, Show } from 'solid-js';
import type { RichMessage } from '../../../core/messages/types.ts';
import { isUserMessage, isAssistantMessage } from '../../../core/messages/types.ts';
import { UserMessage } from './UserMessage.tsx';
import { AssistantMessage } from './AssistantMessage.tsx';
import { Colors } from '../../../core/types.ts';

interface MessageListProps {
  messages: RichMessage[];
}

function WelcomeMessage() {
  return (
    <box flexDirection="column" padding={2}>
      <text>
        <span style={{ bold: true, fg: Colors.primary }}>Welcome to Ops</span>
      </text>
      <box height={1} />
      <text style={{ fg: Colors.muted }}>
        Quick start:
      </text>
      <text style={{ fg: Colors.muted }}>
        • Type a message and press Enter to chat
      </text>
      <text style={{ fg: Colors.muted }}>
        • Press Shift+Enter for a new line
      </text>
      <text style={{ fg: Colors.muted }}>
        • Type / for commands (try /help)
      </text>
      <text style={{ fg: Colors.muted }}>
        • Press Ctrl+N to create a new session
      </text>
      <text style={{ fg: Colors.muted }}>
        • Press Tab to toggle between Build and Plan modes
      </text>
    </box>
  );
}

export function MessageList(props: MessageListProps) {
  return (
    <box flexDirection="column">
      <Show when={props.messages.length === 0}>
        <WelcomeMessage />
      </Show>
      <For each={props.messages}>
        {(message) => {
          if (isUserMessage(message)) {
            return <UserMessage message={message} />;
          } else if (isAssistantMessage(message)) {
            return <AssistantMessage message={message} />;
          }
          return null;
        }}
      </For>
    </box>
  );
}
