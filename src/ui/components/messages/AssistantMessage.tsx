import { For, Show } from 'solid-js';
import type { AssistantRichMessage } from '../../../core/messages/types.ts';
import { Colors } from '../../../core/types.ts';
import { ThinkingBlock } from './ThinkingBlock.tsx';
import { TextBlock } from './TextBlock.tsx';
import { ToolCallBlock } from './ToolCallBlock.tsx';
import { ToolResultBlock } from './ToolResultBlock.tsx';
import type { ContentBlock } from '../../../core/messages/types.ts';

interface AssistantMessageProps {
  message: AssistantRichMessage;
}

export function AssistantMessage(props: AssistantMessageProps) {
  const renderBlock = (block: ContentBlock) => {
    switch (block.type) {
      case 'thinking':
        return <ThinkingBlock block={block} />;
      case 'text':
        return <TextBlock block={block} />;
      case 'tool_call':
        return <ToolCallBlock block={block} />;
      case 'tool_result':
        return <ToolResultBlock block={block} />;
      default:
        return null;
    }
  };

  return (
    <box flexDirection="row" padding={1}>
      <text style={{ fg: Colors.success }}>▎</text>
      <box paddingLeft={1} flexGrow={1} flexDirection="column">
        <Show when={props.message.isStreaming}>
          <text style={{ fg: Colors.muted }}>Thinking...</text>
        </Show>
        <For each={props.message.content}>
          {(block) => renderBlock(block)}
        </For>
      </box>
    </box>
  );
}
