import { Colors } from '../../../core/types.ts';
import type { ToolResultBlock as ToolResultBlockType } from '../../../core/messages/types.ts';
import { SimpleMarkdownRenderer } from './MarkdownRenderer.tsx';
import { containsMarkdown } from './markdown.ts';

interface ToolResultBlockProps {
  block: ToolResultBlockType;
}

/**
 * ToolResultBlock - Renders tool execution results
 * 
 * Conditionally renders markdown if the content contains markdown syntax,
 * otherwise renders as plain text for better readability of command output.
 */
export function ToolResultBlock(props: ToolResultBlockProps) {
  const icon = () => props.block.isError ? '✗' : '✓';
  const iconColor = () => props.block.isError ? Colors.error : Colors.success;

  const output = () => {
    const content = props.block.content;
    // Limit output length for display
    if (content.length > 500) {
      return content.slice(0, 500) + '\n... (' + (content.length - 500) + ' more chars)';
    }
    return content;
  };

  const content = output();
  const shouldRenderMarkdown = () => containsMarkdown(content);

  return (
    <box flexDirection="row" marginBottom={1}>
      <box 
        flexDirection="row" 
        paddingLeft={1} 
        flexGrow={1}
        borderStyle="single"
        borderColor={props.block.isError ? Colors.error : Colors.success}
      >
        <text style={{ fg: iconColor() }}>{icon()}</text>
        <box paddingLeft={1} flexGrow={1}>
          {shouldRenderMarkdown() ? (
            <SimpleMarkdownRenderer content={content} />
          ) : (
            <text style={{ fg: Colors.muted }}>
              {content}
            </text>
          )}
        </box>
      </box>
    </box>
  );
}
