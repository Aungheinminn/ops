import { For, Show, createMemo } from 'solid-js';
import type { AssistantRichMessage } from '../../../core/messages/types.ts';
import { Colors } from '../../../core/types.ts';
import { ThinkingBlock } from './ThinkingBlock.tsx';
import { TextBlock } from './TextBlock.tsx';
import { ToolCallBlock } from './ToolCallBlock.tsx';
import { ToolResultBlock } from './ToolResultBlock.tsx';
import type { ContentBlock, ToolCallBlock as ToolCallBlockType } from '../../../core/messages/types.ts';

interface AssistantMessageProps {
  message: AssistantRichMessage;
}

export function AssistantMessage(props: AssistantMessageProps) {
  // Check if any tool calls are streaming (being received)
  const streamingToolCalls = createMemo(() => {
    return props.message.content.filter(
      (block): block is ToolCallBlockType => 
        block.type === 'tool_call' && !!block.isStreaming
    );
  });

  // Determine loading text based on what's streaming
  const loadingText = createMemo(() => {
    if (!props.message.isStreaming) return null;
    
    const tools = streamingToolCalls();
    if (tools.length > 0) {
      // If we have tool calls streaming, show the tool name
      const toolName = tools[0]?.name || 'tool';
      return `Calling ${toolName}...`;
    }
    
    // Otherwise show thinking
    return 'Thinking...';
  });

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
        <Show when={loadingText()}>
          <text style={{ fg: Colors.muted }}>{loadingText()}</text>
        </Show>
        <For each={props.message.content}>
          {(block) => renderBlock(block)}
        </For>
      </box>
    </box>
  );
}
