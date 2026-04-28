import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type {
  RoutedEvent,
  EventCategory,
  AssistantMessageEvent,
  StreamingContentEvent,
} from './types.ts';
import { hasAssistantMessageEvent } from './types.ts';

export function classifyEvent(event: AgentSessionEvent): EventCategory {
  switch (event.type) {
    case 'agent_start':
    case 'agent_end':
      return 'lifecycle';

    case 'turn_start':
    case 'turn_end':
      return 'turn';

    case 'message_start':
    case 'message_update':
    case 'message_end':
      return 'message';

    case 'tool_execution_start':
    case 'tool_execution_update':
    case 'tool_execution_end':
      return 'tool_execution';

    case 'queue_update':
    case 'compaction_start':
    case 'compaction_end':
    case 'auto_retry_start':
    case 'auto_retry_end':
      return 'session';

    default:
      return 'unknown';
  }
}

function isStreamingDelta(event: AssistantMessageEvent): boolean {
  return (
    event.type === 'text_delta' ||
    event.type === 'thinking_delta' ||
    event.type === 'toolcall_delta'
  );
}

function isStreamingLifecycle(event: AssistantMessageEvent): boolean {
  return (
    event.type === 'text_start' ||
    event.type === 'text_end' ||
    event.type === 'thinking_start' ||
    event.type === 'thinking_end' ||
    event.type === 'toolcall_start' ||
    event.type === 'toolcall_end' ||
    event.type === 'done' ||
    event.type === 'error'
  );
}

function isStreamingEvent(event: AssistantMessageEvent): boolean {
  return isStreamingDelta(event) || isStreamingLifecycle(event);
}

export function routeEvent(event: AgentSessionEvent): RoutedEvent {
  const category = classifyEvent(event);

  if (category === 'message' && event.type === 'message_update' && hasAssistantMessageEvent(event)) {
    const assistantEvent = event.assistantMessageEvent as unknown as AssistantMessageEvent;

    if (isStreamingEvent(assistantEvent)) {
      return {
        category: 'streaming',
        event: assistantEvent as unknown as AgentSessionEvent,
        parentEvent: event,
      };
    }
  }

  return {
    category,
    event,
  };
}

export interface EventRouter {
  route(event: AgentSessionEvent): RoutedEvent;
}

export function createEventRouter(): EventRouter {
  return {
    route: routeEvent,
  };
}
