/**
 * Event Handlers - Process routed events and update state
 */

import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type { RoutedEvent, EventCategory, EventHandlerContext } from './types.ts';
import { createEventRouter, routeEvent } from './router.ts';
import { log, logError } from '../logger.ts';

// EventHandlerContext is now defined in types.ts

/**
 * Event handler function type
 */
export type EventHandler = (event: RoutedEvent, ctx: EventHandlerContext) => void;

/**
 * Extract content from an AgentMessage
 */
function extractContentFromMessage(event: AgentSessionEvent): { messageId?: string; role?: string; content?: unknown } {
  if ('message' in event && event.message) {
    const msg = event.message as { id?: string; role?: string; content?: unknown };
    // Generate a unique ID if not provided by the agent
    const messageId = msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      messageId,
      role: msg.role,
      content: msg.content,
    };
  }
  return {};
}

/**
 * Handle agent lifecycle events (agent_start, agent_end)
 */
function handleLifecycleEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  if (event.event.type === 'agent_start') {
    log('Agent started');
    ctx.onLoadingChange(true);
  } else if (event.event.type === 'agent_end') {
    log('Agent ended');
    ctx.onLoadingChange(false);
  }
}

/**
 * Handle turn lifecycle events (turn_start, turn_end)
 */
function handleTurnEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  if (event.event.type === 'turn_start') {
    log('Turn started');
  } else if (event.event.type === 'turn_end') {
    log('Turn ended');
    // Tool results are included in turn_end, could display them here
  }
}

/**
 * Handle message lifecycle events (message_start, message_end)
 * Note: message_update is handled as streaming events
 */
function handleMessageEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  const msgEvent = event.event as { type: string; message?: { id?: string; role?: string; timestamp?: number } };

  if (msgEvent.type === 'message_start') {
    log('Message started');
    const { messageId, role, content } = extractContentFromMessage(msgEvent as AgentSessionEvent);

    // Skip user messages - they are already added when the user sends them
    if (role === 'user') {
      log('Skipping user message (already in store)');
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
    log('Message ended');
    const currentId = ctx.messageStore.getCurrentMessageId();
    if (currentId) {
      ctx.messageStore.completeMessage(currentId);
    }
  }
}

/**
 * Handle streaming content events (text_delta, thinking_delta, toolcall_delta, etc.)
 */
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
    log('Warning: streaming event received but no current message');
    return;
  }

  switch (streamingEvent.type) {
    case 'text_start': {
      log(`Text block started at index ${streamingEvent.contentIndex}`);
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
      log(`Text block ended at index ${streamingEvent.contentIndex}`);
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.finalizeContentBlock(currentId, streamingEvent.contentIndex);
      }
      break;
    }

    case 'thinking_start': {
      log(`Thinking block started at index ${streamingEvent.contentIndex}`);
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
      log(`Thinking block ended at index ${streamingEvent.contentIndex}`);
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.finalizeContentBlock(currentId, streamingEvent.contentIndex);
      }
      break;
    }

    case 'toolcall_start': {
      log(`Tool call started at index ${streamingEvent.contentIndex}`);
      if (streamingEvent.contentIndex !== undefined) {
        ctx.messageStore.addContentBlock(currentId, {
          type: 'tool_call',
          id: '', // Will be filled in on toolcall_end
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
      log(`Tool call ended at index ${streamingEvent.contentIndex}`);
      if (streamingEvent.contentIndex !== undefined && streamingEvent.toolCall) {
        // Replace the streaming block with the final tool call
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
      log('Message streaming completed successfully');
      // Mark the current message as complete
      const doneCurrentId = ctx.messageStore.getCurrentMessageId();
      if (doneCurrentId) {
        ctx.messageStore.completeMessage(doneCurrentId);
      }
      break;
    }

    case 'error': {
      logError('Message streaming error', streamingEvent);
      break;
    }

    default:
      log(`Unhandled streaming event type: ${streamingEvent.type}`);
  }
}

/**
 * Handle tool execution events
 */
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
      log(`Tool execution started: ${toolEvent.toolName}`);
      ctx.messageStore.addToolExecution(
        toolEvent.toolCallId,
        toolEvent.toolName,
        toolEvent.args
      );
      break;
    }

    case 'tool_execution_update': {
      log(`Tool execution update: ${toolEvent.toolName}`);
      ctx.messageStore.updateToolExecution(
        toolEvent.toolCallId,
        toolEvent.partialResult
      );
      break;
    }

    case 'tool_execution_end': {
      log(`Tool execution ended: ${toolEvent.toolName} (${toolEvent.isError ? 'error' : 'success'})`);
      ctx.messageStore.completeToolExecution(
        toolEvent.toolCallId,
        toolEvent.result,
        toolEvent.isError || false
      );
      break;
    }
  }
}

/**
 * Handle session events (queue_update, compaction, auto_retry)
 */
function handleSessionEvent(event: RoutedEvent, ctx: EventHandlerContext): void {
  const sessionEvent = event.event as { type: string };

  switch (sessionEvent.type) {
    case 'queue_update': {
      log('Queue updated');
      // Could show steering/follow-up queue in UI
      break;
    }

    case 'compaction_start': {
      log('Compaction started');
      // Could show compaction indicator
      break;
    }

    case 'compaction_end': {
      log('Compaction ended');
      break;
    }

    case 'auto_retry_start': {
      const retryEvent = sessionEvent as { type: 'auto_retry_start'; attempt: number; maxAttempts: number; errorMessage: string };
      log(`Auto-retry started: attempt ${retryEvent.attempt}/${retryEvent.maxAttempts}`);
      break;
    }

    case 'auto_retry_end': {
      const retryEvent = sessionEvent as { type: 'auto_retry_end'; success: boolean; attempt: number };
      log(`Auto-retry ended: ${retryEvent.success ? 'success' : 'failed'}`);
      break;
    }

    default:
      log(`Unhandled session event type: ${sessionEvent.type}`);
  }
}

/**
 * Create the main event handler that routes to appropriate sub-handlers
 */
export function createEventHandler(ctx: EventHandlerContext) {
  const router = createEventRouter();

  return (event: AgentSessionEvent): void => {
    ctx.onActivity();

    const routed = router.route(event);

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
          break;

        case 'streaming':
          handleStreamingEvent(routed, ctx);
          break;

        case 'tool_execution':
          handleToolExecutionEvent(routed, ctx);
          break;

        case 'session':
          handleSessionEvent(routed, ctx);
          break;

        case 'unknown':
        default:
          log(`Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      logError(`Error handling event ${event.type}`, err);
    }
  };
}

// Export types for convenience
export type { RoutedEvent, EventCategory, EventHandlerContext } from './types.ts';
