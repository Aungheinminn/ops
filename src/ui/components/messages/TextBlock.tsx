import type { TextBlock as TextBlockType } from '../../../core/messages/types.ts';
import { SimpleMarkdownRenderer } from './MarkdownRenderer.tsx';

interface TextBlockProps {
  block: TextBlockType;
}

 
export function TextBlock(props: TextBlockProps) {
  return (
    <SimpleMarkdownRenderer content={props.block.content || ' '} />
  );
}
