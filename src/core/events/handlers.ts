import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type { RoutedEvent, EventCategory, EventHandlerContext } from './types.ts';
import { createEventRouter, routeEvent } from './router.ts';
import { setTurnActive, setToolExecuting } from '../queue/router.ts';

export type EventHandler = (event: RoutedEvent, ctx: EventHandlerContext) => void;

function extractContentFromMessage(event: AgentSessionEvent): { messageId?: string; role?: string; content?: unknown } {
  if ('message' in event && event.message) {
    const msg = event.message as { id?: string; role?: string; content?: unknown };
    const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      messageId,
      role: msg.role,
      content: msg.content,
    };
  }
  return {};
}

function handleLifecycleEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  if (event.event.type === 'agent_start') {
    ctx.onLoadingChange(true);
  } else if (event.event.type === 'agent_end') {
    ctx.onLoadingChange(false);
  }
}

function handleTurnEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  if (event.event.type === 'turn_start') {
    setTurnActive(ctx.sessionId, true);
  } else if (event.event.type === 'turn_end') {
    setTurnActive(ctx.sessionId, false);
  }
}

function handleMessageEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  const msgEvent = event.event as { type: string; message?: { id?: string; role?: string; content?: unknown; timestamp?: number } };

  if (msgEvent.type === 'message_start') {
    const { messageId, role } = extractContentFromMessage(msgEvent as AgentSessionEvent);

    if (role === 'user') {
      const userContent = extractUserContent(msgEvent.message);
      if (userContent) {
        const lastMessage = ctx.messageStore.getLastMessage() as { role?: string; content?: { content?: string }[] } | undefined;
        if (lastMessage && lastMessage.role === 'user' && lastMessage.content) {
          const lastContent = lastMessage.content.map((c: { content?: string }) => c.content).join('');
          if (lastContent === userContent) {
            return;
          }
        }
        ctx.messageStore.addUserMessage(userContent);
      }
      return;
    }

    if (messageId && role) {
      ctx.messageStore.startMessage(
        messageId,
        role as 'assistant',
        msgEvent.message?.timestamp || Date.now()
      );
    }
  } else if (msgEvent.type === 'message_end') {
    const currentId = ctx.messageStore.getCurrentMessageId();
    if (currentId) {
      ctx.messageStore.completeMessage(currentId);
    }
  }
}

function extractUserContent(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;

  const msg = message as { content?: unknown; text?: string };

  if (msg.content) {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((item: unknown) => item && typeof item === 'object' && 'type' in item && (item as { type: string }).type === 'text')
        .map((item: unknown) => (item as { text?: string }).text)
        .filter((text: string | undefined): text is string => typeof text === 'string');
      return textParts.join('') || null;
    }
  }

  if (msg.text) {
    return msg.text;
  }

  return null;
}

function handleStreamingEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  const streamingEvent = event.event as {
    type: string;
    contentIndex?: number;
    delta?: string;
    content?: string;
    toolCall?: { id: string; name: string; arguments: Record<string, unknown> };
    partial?: { content?: unknown[] };
  };

  const currentId = ctx.messageStore.getCurrentMessageId();
  if (!currentId) {
    return;
  }

  switch (streamingEvent.type) {
    case 'text_start': {
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.addContentBlock(currentId, {
          type: 'text',
          content: '',
          contentIndex: streamingEvent.contentIndex,
          isStreaming: true,
        });
      }
      break;
    }

    case 'text_delta': {
      if (streamingEvent.contentIndex !== undefined && streamingEvent.delta) {
        ctx.messageStore.updateContentBlock(currentId, streamingEvent.contentIndex, streamingEvent.delta);
      }
      break;
    }

    case 'text_end': {
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.finalizeContentBlock(currentId, streamingEvent.contentIndex);
      }
      break;
    }

    case 'thinking_start': {
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.addContentBlock(currentId, {
          type: 'thinking',
          content: '',
          contentIndex: streamingEvent.contentIndex,
          isStreaming: true,
        });
      }
      break;
    }

    case 'thinking_delta': {
      if (streamingEvent.contentIndex !== undefined && streamingEvent.delta) {
        ctx.messageStore.updateContentBlock(currentId, streamingEvent.contentIndex, streamingEvent.delta);
      }
      break;
    }

    case 'thinking_end': {
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.finalizeContentBlock(currentId, streamingEvent.contentIndex);
      }
      break;
    }

    case 'toolcall_start': {
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.addContentBlock(currentId, {
          type: 'tool_call',
          id: '',
          name: '',
          arguments: {},
          contentIndex: streamingEvent.contentIndex,
          isStreaming: true,
        });
      }
      break;
    }

    case 'toolcall_delta': {
      if (streamingEvent.contentIndex !== undefined && streamingEvent.delta) {
        ctx.messageStore.updateContentBlock(currentId, streamingEvent.contentIndex, streamingEvent.delta);
      }
      break;
    }

    case 'toolcall_end': {
      if (streamingEvent.contentIndex !== undefined && streamingEvent.toolCall) {
        const { id, name, arguments: args } = streamingEvent.toolCall;
        ctx.messageStore.addContentBlock(currentId, {
          type: 'tool_call',
          id,
          name,
          arguments: args,
          contentIndex: streamingEvent.contentIndex,
          isStreaming: false,
        });
      }
      break;
    }

    case 'done': {
      const doneCurrentId = ctx.messageStore.getCurrentMessageId();
      if (doneCurrentId) {
        ctx.messageStore.completeMessage(doneCurrentId);
      }
      break;
    }

    case 'error': {
      break;
    }

    default:
  }
}

function handleToolExecutionEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  const toolEvent = event.event as {
    type: string;
    toolCallId: string;
    toolName: string;
    args?: unknown;
    partialResult?: unknown;
    result?: unknown;
    isError?: boolean;
  };

  switch (toolEvent.type) {
    case 'tool_execution_start': {
      setToolExecuting(ctx.sessionId, true);
      ctx.messageStore.addToolExecution(
        toolEvent.toolCallId,
        toolEvent.toolName,
        toolEvent.args
      );
      break;
    }

    case 'tool_execution_update': {
      ctx.messageStore.updateToolExecution(
        toolEvent.toolCallId,
        toolEvent.partialResult
      );
      break;
    }

    case 'tool_execution_end': {
      setToolExecuting(ctx.sessionId, false);
      ctx.messageStore.completeToolExecution(
        toolEvent.toolCallId,
        toolEvent.result,
        toolEvent.isError || false
      );
      break;
    }
  }
}

function handleSessionEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  const sessionEvent = event.event as { type: string; steering?: readonly string[]; followUp?: readonly string[] };

  switch (sessionEvent.type) {
    case 'queue_update': {
      const queueState = {
        steering: sessionEvent.steering ?? [],
        followUp: sessionEvent.followUp ?? [],
        totalCount: (sessionEvent.steering?.length ?? 0) + (sessionEvent.followUp?.length ?? 0),
      };
      if (ctx.onQueueUpdate) {
        ctx.onQueueUpdate(queueState);
      }
      break;
    }

    case 'compaction_start': {
      break;
    }

    case 'compaction_end': {
      break;
    }

    case 'auto_retry_start': {
      break;
    }

    case 'auto_retry_end': {
      break;
    }

    default:
  }
}

export function createEventHandler(ctx: EventHandlerContext) {
  const router = createEventRouter();

  return (event: AgentSessionEvent): void => {
    ctx.onActivity();

    const routed = router.route(event);

    let messageWasUpdated = false;

    try {
      switch (routed.category) {
        case 'lifecycle':
          handleLifecycleEvent(routed, ctx);
          break;

        case 'turn':
          handleTurnEvent(routed, ctx);
          break;

        case 'message':
          handleMessageEvent(routed, ctx);
          messageWasUpdated = true;
          break;

        case 'streaming':
          handleStreamingEvent(routed, ctx);
          messageWasUpdated = true;
          break;

        case 'tool_execution':
          handleToolExecutionEvent(routed, ctx);
          messageWasUpdated = true;
          break;

        case 'session':
          handleSessionEvent(routed, ctx);
          break;

        case 'unknown':
        default:
      }
    } catch (err) {
    }

    if (messageWasUpdated && ctx.onMessageUpdate) {
      ctx.onMessageUpdate();
    }
  };
}

export type { RoutedEvent, EventCategory, EventHandlerContext } from './types.ts';