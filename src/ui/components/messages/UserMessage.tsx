import type { UserRichMessage } from '../../../core/messages/types.ts';
import { Colors } from '../../../core/types.ts';

interface UserMessageProps {
  message: UserRichMessage;
}

export function UserMessage(props: UserMessageProps) {
  const content = () => {
    return props.message.content
      .filter(block => block.type === 'text')
      .map(block => block.content)
      .join('');
  };

  return (
    <box flexDirection="row" padding={1}>
      <text style={{ fg: Colors.primary }}>▎</text>
      <box paddingLeft={1} flexGrow={1}>
        <text>{content()}</text>
      </box>
    </box>
  );
}
