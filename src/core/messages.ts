import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type { Message } from './types.ts';
import { extractMessageContent } from './types.ts';
import { ulid } from 'ulid';

export function formatToolMessage(toolName: string): string {
  return `Using tool: ${toolName}`;
}

export function createSystemMessage(content: string): Omit<Message, 'id'> {
  return {
    role: 'agent',
    content,
    timestamp: Date.now(),
    isStreaming: false,
  };
}

export function createUserMessage(content: string): Message {
  return {
    id: ulid(),
    role: 'user',
    content,
    timestamp: Date.now(),
    isStreaming: false,
  };
}

export function createAgentMessage(content: string, isStreaming = false): Message {
  return {
    id: ulid(),
    role: 'agent',
    content,
    timestamp: Date.now(),
    isStreaming,
  };
}

export function parseMessageStart(event: AgentSessionEvent): Message | null {
  const msg = 'message' in event ? (event as { message: unknown }).message : undefined;
  
  // Check if this is an assistant message (not user message)
  if (msg && typeof msg === 'object' && 'role' in msg) {
    const role = (msg as { role: string }).role;
    // Skip user messages (we already added them when sending)
    if (role === 'user') {
      return null;
    }
  }
  
  const content = extractMessageContent(msg);
  return createAgentMessage(content, true);
}

export interface MessageUpdateResult {
  content: string;
  isDelta: boolean;
}

export function parseMessageUpdate(event: AgentSessionEvent): MessageUpdateResult {
  // Handle assistantMessageEvent format (thinking updates, delta updates)
  if ('assistantMessageEvent' in event) {
    const assistantEvent = (event as { assistantMessageEvent: unknown }).assistantMessageEvent;
    if (assistantEvent && typeof assistantEvent === 'object') {
      // Handle delta updates (incremental content) - these should be appended
      if ('delta' in assistantEvent && typeof assistantEvent.delta === 'string') {
        return { content: assistantEvent.delta, isDelta: true };
      }
      
      // Handle partial message updates - these are full replacements
      if ('partial' in assistantEvent) {
        return { content: extractMessageContent(assistantEvent.partial), isDelta: false };
      }
      
      // Try to extract content directly from assistantMessageEvent - full replacements
      const content = extractMessageContent(assistantEvent);
      if (content) {
        return { content, isDelta: false };
      }
    }
  }
  
  // Fallback to old logic - extract from message field - full replacements
  const msg = 'message' in event ? (event as { message: unknown }).message : undefined;
  return { content: extractMessageContent(msg), isDelta: false };
}

export function parseToolExecution(event: AgentSessionEvent): Message | null {
  if (!('toolName' in event) || typeof event.toolName !== 'string') {
    return null;
  }
  return createAgentMessage(formatToolMessage(event.toolName), false);
}

export function isHandledEventType(type: string): type is HandledEventType {
  return HANDLED_EVENT_TYPES.includes(type as HandledEventType);
}

export const HANDLED_EVENT_TYPES = [
  'agent_start',
  'agent_end',
  'message_start',
  'message_update',
  'message_end',
  'tool_execution_start',
];

export type HandledEventType = typeof HANDLED_EVENT_TYPES[number];
