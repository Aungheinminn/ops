import type { UserRichMessage } from '../../../core/messages/types.ts';
import type { MouseEvent } from '@opentui/core';
import { Colors } from '../../../core/types.ts';

interface UserMessageProps {
  message: UserRichMessage;
  onClick?: (messageId: string) => void;
}

export function UserMessage(props: UserMessageProps) {
  const content = () => {
    return props.message.content
      .filter(block => block.type === 'text')
      .map(block => block.content)
      .join('');
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) return;
    props.onClick?.(props.message.id);
  };

  return (
    <box
      flexDirection="row"
      padding={1}
      onMouseUp={handleMouseUp}
    >
      <text style={{ fg: Colors.primary }}>▎</text>
      <box paddingLeft={1} flexGrow={1}>
        <text>{content()}</text>
      </box>
    </box>
  );
}
