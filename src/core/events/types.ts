/**
 * Event type definitions for pi-coding-agent integration
 * Based on @mariozechner/pi-coding-agent event system
 */

import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';

// ============================================================================
// Content Block Types (from pi-ai)
// ============================================================================

export interface TextContent {
  type: 'text';
  text: string;
  textSignature?: string;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

export interface ToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface ImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string;
}

export type ContentItem = TextContent | ThinkingContent | ToolCall | ImageContent;

// ============================================================================
// Agent Message Types
// ============================================================================

export interface AgentMessage {
  role: 'assistant';
  content: ContentItem[];
  api?: string;
  provider?: string;
  model?: string;
  responseId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  stopReason?: 'stop' | 'length' | 'tool_use' | 'error';
  errorMessage?: string;
  timestamp: number;
}

export interface UserMessage {
  role: 'user';
  content: string | ContentItem[];
  timestamp: number;
}

export interface ToolResultMessage {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError: boolean;
  timestamp: number;
}

export type Message = AgentMessage | UserMessage | ToolResultMessage;

// ============================================================================
// Streaming Content Events (AssistantMessageEvent)
// ============================================================================

export interface TextStartEvent {
  type: 'text_start';
  contentIndex: number;
  partial: AgentMessage;
}

export interface TextDeltaEvent {
  type: 'text_delta';
  contentIndex: number;
  delta: string;
  partial: AgentMessage;
}

export interface TextEndEvent {
  type: 'text_end';
  contentIndex: number;
  content: string;
  partial: AgentMessage;
}

export interface ThinkingStartEvent {
  type: 'thinking_start';
  contentIndex: number;
  partial: AgentMessage;
}

export interface ThinkingDeltaEvent {
  type: 'thinking_delta';
  contentIndex: number;
  delta: string;
  partial: AgentMessage;
}

export interface ThinkingEndEvent {
  type: 'thinking_end';
  contentIndex: number;
  content: string;
  partial: AgentMessage;
}

export interface ToolCallStartEvent {
  type: 'toolcall_start';
  contentIndex: number;
  partial: AgentMessage;
}

export interface ToolCallDeltaEvent {
  type: 'toolcall_delta';
  contentIndex: number;
  delta: string;
  partial: AgentMessage;
}

export interface ToolCallEndEvent {
  type: 'toolcall_end';
  contentIndex: number;
  toolCall: ToolCall;
  partial: AgentMessage;
}

export interface DoneEvent {
  type: 'done';
  reason: 'stop' | 'length' | 'toolUse';
  message: AgentMessage;
}

export interface ErrorEvent {
  type: 'error';
  reason: 'aborted' | 'error';
  error: AgentMessage;
}

export type AssistantMessageEvent =
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ThinkingStartEvent
  | ThinkingDeltaEvent
  | ThinkingEndEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent
  | DoneEvent
  | ErrorEvent;

// Streaming content events alias for convenience
export type StreamingContentEvent = AssistantMessageEvent;

// ============================================================================
// Agent Lifecycle Events
// ============================================================================

export interface AgentStartEvent {
  type: 'agent_start';
}

export interface AgentEndEvent {
  type: 'agent_end';
  messages: AgentMessage[];
}

export type AgentLifecycleEvent = AgentStartEvent | AgentEndEvent;

// ============================================================================
// Turn Lifecycle Events
// ============================================================================

export interface TurnStartEvent {
  type: 'turn_start';
}

export interface TurnEndEvent {
  type: 'turn_end';
  message: AgentMessage;
  toolResults: ToolResultMessage[];
}

export type TurnLifecycleEvent = TurnStartEvent | TurnEndEvent;

// ============================================================================
// Message Lifecycle Events
// ============================================================================

export interface MessageStartEvent {
  type: 'message_start';
  message: AgentMessage;
}

export interface MessageUpdateEvent {
  type: 'message_update';
  message: AgentMessage;
  assistantMessageEvent: AssistantMessageEvent;
}

export interface MessageEndEvent {
  type: 'message_end';
  message: AgentMessage;
}

export type MessageLifecycleEvent = MessageStartEvent | MessageUpdateEvent | MessageEndEvent;

// ============================================================================
// Tool Execution Events
// ============================================================================

export interface ToolExecutionStartEvent {
  type: 'tool_execution_start';
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolExecutionUpdateEvent {
  type: 'tool_execution_update';
  toolCallId: string;
  toolName: string;
  args: unknown;
  partialResult: unknown;
}

export interface ToolExecutionEndEvent {
  type: 'tool_execution_end';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

export type ToolExecutionEvent =
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent;

// ============================================================================
// Session Events
// ============================================================================

export interface QueueUpdateEvent {
  type: 'queue_update';
  steering: readonly string[];
  followUp: readonly string[];
}

export interface CompactionStartEvent {
  type: 'compaction_start';
  reason: 'manual' | 'threshold' | 'overflow';
}

export interface CompactionEndEvent {
  type: 'compaction_end';
  reason: 'manual' | 'threshold' | 'overflow';
  result?: {
    summary: string;
    tokensBefore: number;
    tokensAfter: number;
  };
  aborted: boolean;
  willRetry: boolean;
  errorMessage?: string;
}

export interface AutoRetryStartEvent {
  type: 'auto_retry_start';
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
}

export interface AutoRetryEndEvent {
  type: 'auto_retry_end';
  success: boolean;
  attempt: number;
  finalError?: string;
}

export type SessionEvent =
  | QueueUpdateEvent
  | CompactionStartEvent
  | CompactionEndEvent
  | AutoRetryStartEvent
  | AutoRetryEndEvent;

// ============================================================================
// Event Categories and Routing
// ============================================================================

export type EventCategory =
  | 'lifecycle'
  | 'turn'
  | 'message'
  | 'streaming'
  | 'tool_execution'
  | 'session'
  | 'unknown';

export interface RoutedEvent {
  category: EventCategory;
  event: AgentSessionEvent;
  parentEvent?: AgentSessionEvent;
}

// ============================================================================
// Event Handler Context
// ============================================================================

export interface EventHandlerContext {
  // Callbacks for UI updates
  onLoadingChange: (loading: boolean) => void;
  onActivity: () => void;

  // Message store operations (will be injected from message store)
  messageStore: {
    startMessage(messageId: string, role: 'assistant', timestamp: number): void;
    addContentBlock(messageId: string, block: unknown): void;
    updateContentBlock(messageId: string, contentIndex: number, delta: string): void;
    finalizeContentBlock(messageId: string, contentIndex: number): void;
    completeMessage(messageId: string): void;
    addToolExecution(toolCallId: string, toolName: string, args: unknown): void;
    updateToolExecution(toolCallId: string, partialResult: unknown): void;
    completeToolExecution(toolCallId: string, result: unknown, isError: boolean): void;
    getCurrentMessageId(): string | undefined;
    getMessageByContentIndex(contentIndex: number): string | undefined;
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isTextDeltaEvent(event: AssistantMessageEvent): event is TextDeltaEvent {
  return event.type === 'text_delta';
}

export function isThinkingDeltaEvent(event: AssistantMessageEvent): event is ThinkingDeltaEvent {
  return event.type === 'thinking_delta';
}

export function isToolCallDeltaEvent(event: AssistantMessageEvent): event is ToolCallDeltaEvent {
  return event.type === 'toolcall_delta';
}

export function isDeltaEvent(event: AssistantMessageEvent): boolean {
  return (
    event.type === 'text_delta' ||
    event.type === 'thinking_delta' ||
    event.type === 'toolcall_delta'
  );
}

export function hasAssistantMessageEvent(
  event: AgentSessionEvent
): event is Extract<AgentSessionEvent, { assistantMessageEvent: unknown }> {
  return 'assistantMessageEvent' in event && event.assistantMessageEvent !== undefined;
}
