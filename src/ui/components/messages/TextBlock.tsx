import type { TextBlock as TextBlockType } from '../../../core/messages/types.ts';
import { SimpleMarkdownRenderer } from './MarkdownRenderer.tsx';

interface TextBlockProps {
  block: TextBlockType;
}

/**
 * TextBlock - Renders text content with simple markdown formatting
 * 
 * Uses regex-based formatting that works consistently during streaming
 * and after completion. Supports headers, bold, italic, and inline code.
 */
export function TextBlock(props: TextBlockProps) {
  return (
    <SimpleMarkdownRenderer content={props.block.content || ' '} />
  );
}
