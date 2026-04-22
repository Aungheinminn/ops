import { Colors } from '../../../core/types.ts';
import type { ToolCallBlock as ToolCallBlockType } from '../../../core/messages/types.ts';

interface ToolCallBlockProps {
  block: ToolCallBlockType;
}

export function ToolCallBlock(props: ToolCallBlockProps) {
  const getIcon = () => {
    const icons: Record<string, string> = {
      write: '📝',
      edit: '✏️',
      bash: '⚡',
      read: '📖',
      grep: '🔍',
      find: '🔎',
      ls: '📁',
    };
    return icons[props.block.name] || '🔧';
  };

  const formatContent = () => {
    try {
      return JSON.stringify(props.block.arguments, null, 2);
    } catch {
      return String(props.block.arguments);
    }
  };

  const content = formatContent();
  const lineCount = content.split('\n').length;
  const border = Array(lineCount).fill('│').join('\n');

  return (
    <box flexDirection="row" marginY={1}>
      <text style={{ fg: Colors.border }}>{border}</text>
      <box paddingLeft={1} flexGrow={1} flexDirection="column">
        <box flexDirection="row">
          <text>{getIcon()}</text>
          <box paddingLeft={1}>
            <text>
              <span style={{ fg: Colors.light, bold: true }}>{props.block.name}</span>
            </text>
          </box>
        </box>
        <box paddingTop={1}>
          <text style={{ fg: Colors.light }}>
            {content}
          </text>
        </box>
      </box>
    </box>
  );
}
