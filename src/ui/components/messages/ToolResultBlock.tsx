import { Colors } from '../../../core/types.ts';
import type { ToolResultBlock as ToolResultBlockType } from '../../../core/messages/types.ts';

interface ToolResultBlockProps {
  block: ToolResultBlockType;
}

export function ToolResultBlock(props: ToolResultBlockProps) {
  const icon = () => props.block.isError ? '✗' : '✓';
  const iconColor = () => props.block.isError ? Colors.error : Colors.success;

  const output = () => {
    const content = props.block.content;
    if (content.length > 500) {
      return content.slice(0, 500) + '\n... (' + (content.length - 500) + ' more chars)';
    }
    return content;
  };

  const content = output();
  const lineCount = content.split('\n').length;
  const border = Array(lineCount).fill('│').join('\n');

  return (
    <box flexDirection="row" marginBottom={1}>
      <text style={{ fg: Colors.border }}>{border}</text>
      <box paddingLeft={1} flexGrow={1} flexDirection="row">
        <text style={{ fg: iconColor() }}>{icon()}</text>
        <box paddingLeft={1}>
          <text style={{ fg: Colors.muted }}>
            {content}
          </text>
        </box>
      </box>
    </box>
  );
}
