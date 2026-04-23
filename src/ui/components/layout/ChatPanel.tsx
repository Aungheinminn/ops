import { Show, createMemo, createEffect, on } from 'solid-js';
import type { SessionData } from '../../../core/types.js';
import { Colors } from '../../../core/types.js';
import { SessionStore } from '../../../core/session/index.ts';
import { MessageList } from '../messages/MessageList.tsx';
import type { ScrollBoxRenderable } from '@opentui/core';

interface ChatPanelProps {
  session?: SessionData;
}

function EmptyState() {
  return (
    <text>
      <span style={{ fg: Colors.muted }}>
        No active session. Press Ctrl+N to create one.
      </span>
    </text>
  );
}

export function ChatPanel(props: ChatPanelProps) {
  const messageStore = createMemo(() => {
    if (!props.session) return undefined;
    return SessionStore.getMessageStore(props.session.id);
  });

  const messages = createMemo(() => messageStore()?.messages ?? []);
  let scrollboxRef: ScrollBoxRenderable | undefined;

  const scrollToBottom = () => {
    setTimeout(() => {
      if (!scrollboxRef) return;
      scrollboxRef.scrollTo(scrollboxRef.scrollHeight);
    }, 50);
  };

  createEffect(() => {
    const msgs = messages();
    const lastMsg = msgs[msgs.length - 1];
    const contentLength = lastMsg?.content.reduce((acc, block) => {
      if ('content' in block && typeof block.content === 'string') {
        return acc + block.content.length;
      }
      return acc;
    }, 0) ?? 0;
    
    if (contentLength > 0 && scrollboxRef) {
      scrollToBottom();
    }
  });

  createEffect(on(
    () => messages().length,
    (count, prevCount) => {
      if (count > (prevCount ?? 0)) {
        scrollToBottom();
      }
    }
  ));

  return (
    <box flexGrow={1} flexDirection="column">
      <Show when={props.session} fallback={<EmptyState />}>
        <scrollbox 
          flexGrow={1}
          ref={(r: ScrollBoxRenderable) => { scrollboxRef = r; }}
          stickyScroll={true}
          stickyStart="bottom"
          focusable={false}
        >
          <MessageList messages={messages()} />
        </scrollbox>
      </Show>
    </box>
  );
}
