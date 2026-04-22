/**
 * Rich Message Types - Structured content blocks for messages
 * Replaces the simple string content with an array of typed content blocks
 */

// ============================================================================
// Content Block Types
// ============================================================================

export interface TextBlock {
  type: 'text';
  content: string;
  contentIndex?: number;
  isStreaming?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  content: string;
  contentIndex?: number;
  isStreaming?: boolean;
  isRedacted?: boolean;
}

export interface ToolCallBlock {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  contentIndex?: number;
  isStreaming?: boolean;
  argumentsBuffer?: string; // Accumulated JSON string during streaming
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  isStreaming?: boolean;
  contentIndex?: number;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock | ToolResultBlock;

// ============================================================================
// Rich Message Types
// ============================================================================

export interface BaseRichMessage {
  id: string;
  timestamp: number;
  isStreaming?: boolean;
  metadata?: {
    model?: string;
    provider?: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens?: number;
      cacheReadInputTokens?: number;
    };
    stopReason?: string;
  };
}

export interface UserRichMessage extends BaseRichMessage {
  role: 'user';
  content: ContentBlock[];
}

export interface AssistantRichMessage extends BaseRichMessage {
  role: 'assistant';
  content: ContentBlock[];
}

export type RichMessage = UserRichMessage | AssistantRichMessage;

// ============================================================================
// Utility Types
// ============================================================================

export type ContentBlockType = ContentBlock['type'];

// ============================================================================
// Type Guards
// ============================================================================

export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

export function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === 'thinking';
}

export function isToolCallBlock(block: ContentBlock): block is ToolCallBlock {
  return block.type === 'tool_call';
}

export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

export function isUserMessage(message: RichMessage): message is UserRichMessage {
  return message.role === 'user';
}

export function isAssistantMessage(message: RichMessage): message is AssistantRichMessage {
  return message.role === 'assistant';
}

// ============================================================================
// Content Block Helpers
// ============================================================================

export function createTextBlock(content: string, contentIndex?: number): TextBlock {
  return {
    type: 'text',
    content,
    contentIndex,
    isStreaming: false,
  };
}

export function createThinkingBlock(content: string, contentIndex?: number): ThinkingBlock {
  return {
    type: 'thinking',
    content,
    contentIndex,
    isStreaming: false,
    isRedacted: false,
  };
}

export function createToolCallBlock(
  id: string,
  name: string,
  args: Record<string, unknown>,
  contentIndex?: number
): ToolCallBlock {
  return {
    type: 'tool_call',
    id,
    name,
    arguments: args,
    contentIndex,
    isStreaming: false,
  };
}

export function createToolResultBlock(
  toolCallId: string,
  toolName: string,
  content: string,
  isError: boolean
): ToolResultBlock {
  return {
    type: 'tool_result',
    toolCallId,
    toolName,
    content,
    isError,
    isStreaming: false,
  };
}

// ============================================================================
// Content Extraction Helpers
// ============================================================================

/**
 * Get all text content from a message (concatenated)
 */
export function getTextContent(message: RichMessage): string {
  return message.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map(block => block.content)
    .join('');
}

/**
 * Get thinking content from a message (if any)
 */
export function getThinkingContent(message: RichMessage): string {
  return message.content
    .filter((block): block is ThinkingBlock => block.type === 'thinking')
    .map(block => block.content)
    .join('');
}

/**
 * Check if message has thinking content
 */
export function hasThinkingContent(message: RichMessage): boolean {
  return message.content.some(block => block.type === 'thinking');
}

/**
 * Check if message has tool calls
 */
export function hasToolCalls(message: RichMessage): boolean {
  return message.content.some(block => block.type === 'tool_call');
}

/**
 * Get all tool calls from a message
 */
export function getToolCalls(message: RichMessage): ToolCallBlock[] {
  return message.content.filter((block): block is ToolCallBlock => block.type === 'tool_call');
}

/**
 * Get all tool results from a message
 */
export function getToolResults(message: RichMessage): ToolResultBlock[] {
  return message.content.filter((block): block is ToolResultBlock => block.type === 'tool_result');
}

/**
 * Convert rich message content to a simple string (for backwards compatibility)
 */
export function messageContentToString(message: RichMessage): string {
  return message.content
    .map(block => {
      switch (block.type) {
        case 'text':
          return block.content;
        case 'thinking':
          return `[Thinking: ${block.content}]`;
        case 'tool_call':
          return `[Tool call: ${block.name}(${JSON.stringify(block.arguments)})]`;
        case 'tool_result':
          return `[Tool result: ${block.toolName} - ${block.content.slice(0, 100)}...]`;
        default:
          return '';
      }
    })
    .join('\n');
}
