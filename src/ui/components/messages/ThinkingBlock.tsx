import type { ThinkingBlock as ThinkingBlockType } from '../../../core/messages/types.ts';
import { Colors } from '../../../core/types.ts';

interface ThinkingBlockProps {
  block: ThinkingBlockType;
}

export function ThinkingBlock(props: ThinkingBlockProps) {
  return (
    <box flexDirection="column" marginBottom={1}>
      <text style={{ fg: Colors.muted }}>
        <span style={{ fg: Colors.light }}>💭 </span>
        <span style={{ fg: Colors.muted, italic: true }}>
          {props.block.isRedacted ? '(redacted)' : props.block.content || 'Thinking...'}
        </span>
      </text>
    </box>
  );
}
