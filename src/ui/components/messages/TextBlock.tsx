import type { TextBlock as TextBlockType } from '../../../core/messages/types.ts';

interface TextBlockProps {
  block: TextBlockType;
}

export function TextBlock(props: TextBlockProps) {
  return (
    <text>
      {props.block.content || ' '}
    </text>
  );
}
