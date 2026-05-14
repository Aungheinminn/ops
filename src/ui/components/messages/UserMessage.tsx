import type { UserRichMessage } from '../../../core/messages/types.ts';
import type { MouseEvent } from '@opentui/core';
import { createSignal } from 'solid-js';
import { Colors } from '../../../core/types.ts';

interface UserMessageProps {
  message: UserRichMessage;
  onClick?: (messageId: string) => void;
}

export function UserMessage(props: UserMessageProps) {
  const [hovered, setHovered] = createSignal(false);

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

  const handleMouseOver = () => setHovered(true);
  const handleMouseOut = () => setHovered(false);

  return (
    <box
      flexDirection="row"
      padding={1}
      width="100%"
      backgroundColor={hovered() ? '#1e293b' : undefined}
      onMouseUp={handleMouseUp}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text style={{ fg: Colors.primary }}>▎</text>
      <box paddingLeft={1} flexGrow={1}>
        <text>{content()}</text>
      </box>
    </box>
  );
}
