/**
 * Simple Markdown Renderer - Regex-based formatting for terminal UI
 * 
 * Features:
 * - Headers: # Text → bold + colored
 * - Bold: **text** → bold
 * - Italic: *text* → italic  
 * - Code: `code` → gray background
 * - Horizontal rules: --- → line
 * 
 * No AST parsing, no streaming/complete switching - same simple approach always.
 */

import { For } from 'solid-js';
import type { JSX } from 'solid-js';

interface SimpleMarkdownRendererProps {
  content: string;
}

// Header colors by level
const HEADER_COLORS = ['#3b82f6', '#3b82f6', '#60a5fa', '#9ca3af', '#6b7280', '#6b7280'];

/**
 * Split text by inline markdown patterns while preserving delimiters
 */
function splitByInlineMarkdown(text: string): Array<{ type: 'text' | 'bold' | 'code' | 'italic'; content: string }> {
  const parts: Array<{ type: 'text' | 'bold' | 'code' | 'italic'; content: string }> = [];
  let remaining = text;
  
  // Pattern to match: **bold**, `code`, *italic*
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let match;
  let lastIndex = 0;
  
  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }
    
    // Add the matched element
    const matched = match[0];
    if (matched.startsWith('**') && matched.endsWith('**')) {
      parts.push({ type: 'bold', content: matched.slice(2, -2) });
    } else if (matched.startsWith('`') && matched.endsWith('`')) {
      parts.push({ type: 'code', content: matched.slice(1, -1) });
    } else if (matched.startsWith('*') && matched.endsWith('*')) {
      parts.push({ type: 'italic', content: matched.slice(1, -1) });
    }
    
    lastIndex = pattern.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }
  
  // If no matches, return whole text
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }
  
  return parts;
}

/**
 * Render inline elements (bold, code, italic)
 */
function renderInlineElements(text: string): JSX.Element {
  const parts = splitByInlineMarkdown(text);
  
  return (
    <>
      <For each={parts}>
        {(part) => {
          switch (part.type) {
            case 'bold':
              return <span style={{ bold: true }}>{part.content}</span>;
            case 'code':
              return (
                <span style={{ bg: '#374151', fg: '#e5e7eb' }}>
                  {part.content}
                </span>
              );
            case 'italic':
              return <span style={{ italic: true }}>{part.content}</span>;
            default:
              return <span>{part.content}</span>;
          }
        }}
      </For>
    </>
  );
}

/**
 * Render a single line with appropriate formatting
 */
function renderLine(line: string, index: number): JSX.Element {
  // Empty line
  if (!line || line.trim() === '') {
    return <box />;
  }
  
  // Headers: # Text or ## Text → bold + colored
  const headerMatch = line.match(/^(#{1,6})\s*(.+)$/);
  if (headerMatch) {
    const level = headerMatch[1].length;
    const text = headerMatch[2];
    const color = HEADER_COLORS[level - 1] || '#6b7280';
    return (
      <box marginTop={1} marginBottom={1}>
        <text>
          <span style={{ bold: true, fg: color }}>{text}</span>
        </text>
      </box>
    );
  }
  
  // Horizontal rule: --- or *** → line
  if (line.match(/^[-*]{3,}$/)) {
    return (
      <box marginTop={1} marginBottom={1}>
        <text style={{ fg: '#4b5563' }}>
          {'─'.repeat(40)}
        </text>
      </box>
    );
  }

  // Regular line with inline formatting
  return (
    <box marginBottom={0}>
      <text>{renderInlineElements(line)}</text>
    </box>
  );
}

/**
 * SimpleMarkdownRenderer - Renders markdown using regex-based formatting
 * 
 * Features:
 * - Headers: # Text → bold + colored (no # shown)
 * - Bold: **text** → bold
 * - Italic: *text* → italic
 * - Code: `code` → gray background  
 * - Horizontal rules: --- → line
 * 
 * Uses same approach during streaming and after completion.
 */
export function SimpleMarkdownRenderer(props: SimpleMarkdownRendererProps): JSX.Element {
  const lines = () => (props.content || '').split('\n');
  
  return (
    <box flexDirection="column">
      <For each={lines()}>
        {(line, index) => renderLine(line, index())}
      </For>
    </box>
  );
}

/**
 * Backward-compatible export name
 */
export const MarkdownRenderer = SimpleMarkdownRenderer;
