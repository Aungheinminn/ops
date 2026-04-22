/**
 * Event Router - Classifies and routes AgentSessionEvents to appropriate handlers
 */

import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type {
  RoutedEvent,
  EventCategory,
  AssistantMessageEvent,
  StreamingContentEvent,
} from './types.ts';
import { hasAssistantMessageEvent } from './types.ts';

/**
 * Determine the category of an AgentSessionEvent
 */
export function classifyEvent(event: AgentSessionEvent): EventCategory {
  switch (event.type) {
    // Agent lifecycle
    case 'agent_start':
    case 'agent_end':
      return 'lifecycle';

    // Turn lifecycle
    case 'turn_start':
    case 'turn_end':
      return 'turn';

    // Message lifecycle
    case 'message_start':
    case 'message_update':
    case 'message_end':
      return 'message';

    // Tool execution
    case 'tool_execution_start':
    case 'tool_execution_update':
    case 'tool_execution_end':
      return 'tool_execution';

    // Session events
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

/**
 * Check if an AssistantMessageEvent is a streaming delta event
 */
function isStreamingDelta(event: AssistantMessageEvent): boolean {
  return (
    event.type === 'text_delta' ||
    event.type === 'thinking_delta' ||
    event.type === 'toolcall_delta'
  );
}

/**
 * Check if an AssistantMessageEvent is a streaming lifecycle event
 */
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

/**
 * Check if an AssistantMessageEvent is a streaming event
 */
function isStreamingEvent(event: AssistantMessageEvent): boolean {
  return isStreamingDelta(event) || isStreamingLifecycle(event);
}

/**
 * Route an AgentSessionEvent to its appropriate category
 * For message_update events, extracts the streaming content event if present
 */
export function routeEvent(event: AgentSessionEvent): RoutedEvent {
  const category = classifyEvent(event);

  // For message_update events, check if they contain streaming content events
  if (category === 'message' && event.type === 'message_update' && hasAssistantMessageEvent(event)) {
    // Cast to our AssistantMessageEvent type - these are compatible at runtime
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

/**
 * Event Router interface for dependency injection and testing
 */
export interface EventRouter {
  route(event: AgentSessionEvent): RoutedEvent;
}

/**
 * Create a default event router
 */
export function createEventRouter(): EventRouter {
  return {
    route: routeEvent,
  };
}
