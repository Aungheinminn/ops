import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';

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
  data: string;
  mimeType: string;
}

export type ContentItem = TextContent | ThinkingContent | ToolCall | ImageContent;

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

export type StreamingContentEvent = AssistantMessageEvent;

export interface AgentStartEvent {
  type: 'agent_start';
}

export interface AgentEndEvent {
  type: 'agent_end';
  messages: AgentMessage[];
}

export type AgentLifecycleEvent = AgentStartEvent | AgentEndEvent;

export interface TurnStartEvent {
  type: 'turn_start';
}

export interface TurnEndEvent {
  type: 'turn_end';
  message: AgentMessage;
  toolResults: ToolResultMessage[];
}

export type TurnLifecycleEvent = TurnStartEvent | TurnEndEvent;

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

export interface QueueState {
  steering: readonly string[];
  followUp: readonly string[];
  totalCount: number;
}

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

export interface EventHandlerContext {
  sessionId: string;
  onLoadingChange: (loading: boolean) => void;
  onActivity: () => void;
  onMessageUpdate?: () => void;
  onQueueUpdate?: (queueState: QueueState) => void;
  messageStore: {
    startMessage(messageId: string, role: 'assistant', timestamp: number): void;
    addUserMessage(content: string): void;
    addContentBlock(messageId: string, block: unknown): void;
    updateContentBlock(messageId: string, contentIndex: number, delta: string): void;
    finalizeContentBlock(messageId: string, contentIndex: number): void;
    completeMessage(messageId: string): void;
    addToolExecution(toolCallId: string, toolName: string, args: unknown): void;
    updateToolExecution(toolCallId: string, partialResult: unknown): void;
    completeToolExecution(toolCallId: string, result: unknown, isError: boolean): void;
    getCurrentMessageId(): string | undefined;
    getLastMessage(): unknown | undefined;
    getMessageByContentIndex(contentIndex: number): string | undefined;
  };
}

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
