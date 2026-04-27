import { Colors } from '../../../core/types.ts';
import type { ToolCallBlock as ToolCallBlockType } from '../../../core/messages/types.ts';

interface ToolCallBlockProps {
  block: ToolCallBlockType;
}

const SIMPLE_TOOLS = ['read', 'bash', 'grep', 'find', 'ls'];
const COMPLEX_TOOLS = ['edit', 'write'];

function getIcon(name: string): string {
  const icons: Record<string, string> = {
    write: '📝',
    edit: '✏️',
    bash: '⚡',
    read: '📖',
    grep: '🔍',
    find: '🔎',
    ls: '📁',
  };
  return icons[name] || '🔧';
}

function getFilePath(args: Record<string, unknown>): string {
  return String(args.path || 'unknown');
}

function formatSimpleTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'read':
      return `read: ${args.path || 'unknown'}`;
    case 'bash':
      return `bash: ${args.command || 'unknown'}`;
    case 'grep': {
      const pattern = args.pattern || '';
      const grepPath = args.path || '.';
      return `grep: "${pattern}" in ${grepPath}`;
    }
    case 'find': {
      const pattern = args.pattern || '';
      const findPath = args.path || '.';
      return `find: "${pattern}" in ${findPath}`;
    }
    case 'ls':
      return `ls: ${args.path || '.'}`;
    default:
      return `${name}: ${JSON.stringify(args)}`;
  }
}

function formatComplexToolContent(name: string, args: Record<string, unknown>): string {
  if (name === 'write') {
    return String(args.content || '');
  }
  if (name === 'edit') {
    const edits = args.edits as Array<{ oldText?: string; newText?: string }> | undefined;
    
    if (edits && edits.length > 0) {
      const edit = edits[0];
      const oldStr = edit?.oldText || '';
      const newStr = edit?.newText || '';
      return `old_string:\n${oldStr}\n\nnew_string:\n${newStr}`;
    }
    
    return 'No edits specified';
  }
  return JSON.stringify(args, null, 2);
}

export function ToolCallBlock(props: ToolCallBlockProps) {
  const { name, arguments: args, isStreaming } = props.block;
  const icon = getIcon(name);

  if (isStreaming) {
    return (
      <box flexDirection="row" marginY={1}>
        <text>{icon}</text>
        <box paddingLeft={1}>
          <text style={{ fg: Colors.muted }}>
            Calling {name}...
          </text>
        </box>
      </box>
    );
  }

  if (SIMPLE_TOOLS.includes(name)) {
    return (
      <box flexDirection="row" marginY={1}>
        <text>{icon}</text>
        <box paddingLeft={1}>
          <text style={{ fg: Colors.light }}>
            {formatSimpleTool(name, args)}
          </text>
        </box>
      </box>
    );
  }

  if (COMPLEX_TOOLS.includes(name)) {
    const content = formatComplexToolContent(name, args);
    return (
      <box
        flexDirection="column"
        marginY={1}
        border={['left']}
        borderStyle="single"
        borderColor={Colors.border}
        paddingLeft={1}
        paddingRight={1}
      >
        <box flexDirection="row">
          <text>{icon}</text>
          <box paddingLeft={1}>
            <text>
              <span style={{ fg: Colors.light, bold: true }}>
                {name}: {getFilePath(args)}
              </span>
            </text>
          </box>
        </box>
        <box paddingTop={1}>
          <text style={{ fg: Colors.light }}>{content}</text>
        </box>
      </box>
    );
  }

  const content = JSON.stringify(args, null, 2);
  return (
    <box
      flexDirection="column"
      marginY={1}
      border={['left']}
      borderStyle="single"
      borderColor={Colors.border}
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexDirection="row">
        <text>{icon}</text>
        <box paddingLeft={1}>
          <text>
            <span style={{ fg: Colors.light, bold: true }}>{name}</span>
          </text>
        </box>
      </box>
      <box paddingTop={1}>
        <text style={{ fg: Colors.light }}>{content}</text>
      </box>
    </box>
  );
}
