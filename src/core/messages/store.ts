/**
 * Message Store - SolidJS store for rich messages with content blocks
 * Provides operations for creating, updating, and managing messages
 */

import { createStore, produce } from 'solid-js/store';
import { ulid } from 'ulid';
import type {
  RichMessage,
  UserRichMessage,
  AssistantRichMessage,
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
  ToolResultBlock,
} from './types.ts';
import { log, logError } from '../logger.ts';

// ============================================================================
// Store State
// ============================================================================

interface MessageStoreState {
  messages: RichMessage[];
  currentMessageId: string | undefined;
  toolExecutions: Map<string, ToolExecutionState>;
}

interface ToolExecutionState {
  toolCallId: string;
  toolName: string;
  args: unknown;
  partialResult?: unknown;
  result?: unknown;
  isError: boolean;
  isComplete: boolean;
}

// ============================================================================
// Message Store Interface
// ============================================================================

export interface MessageStore {
  // Core operations
  messages: RichMessage[];
  
  // Message lifecycle
  startMessage(messageId: string, role: 'assistant', timestamp: number): void;
  completeMessage(messageId: string): void;
  
  // Content block operations
  addContentBlock(messageId: string, block: ContentBlock): void;
  updateContentBlock(messageId: string, contentIndex: number, delta: string): void;
  finalizeContentBlock(messageId: string, contentIndex: number): void;
  
  // User messages
  addUserMessage(content: string): void;
  
  // Tool execution operations
  addToolExecution(toolCallId: string, toolName: string, args: unknown): void;
  updateToolExecution(toolCallId: string, partialResult: unknown): void;
  completeToolExecution(toolCallId: string, result: unknown, isError: boolean): void;
  
  // Query operations
  getCurrentMessageId(): string | undefined;
  getMessageById(messageId: string): RichMessage | undefined;
  getLastAssistantMessage(): AssistantRichMessage | undefined;
  getLastMessage(): RichMessage | undefined;
  getToolExecution(toolCallId: string): ToolExecutionState | undefined;
  
  // Utility
  clear(): void;
}

// ============================================================================
// Message Store Implementation
// ============================================================================

export function createMessageStore(): MessageStore {
  const [state, setState] = createStore<MessageStoreState>({
    messages: [],
    currentMessageId: undefined,
    toolExecutions: new Map(),
  });

  const store: MessageStore = {
    get messages() {
      return state.messages;
    },

    // -------------------------------------------------------------------------
    // Message Lifecycle
    // -------------------------------------------------------------------------

    startMessage(messageId: string, role: 'assistant', timestamp: number): void {
      log(`Starting message: ${messageId}`);
      
      const message: AssistantRichMessage = {
        id: messageId,
        role,
        content: [],
        timestamp,
        isStreaming: true,
      };

      setState('messages', (messages) => [...messages, message]);
      setState('currentMessageId', messageId);
    },

    completeMessage(messageId: string): void {
      log(`Completing message: ${messageId}`);
      
      setState('messages', produce((messages: RichMessage[]) => {
        const message = messages.find(m => m.id === messageId);
        if (message) {
          message.isStreaming = false;
          // Mark all content blocks as not streaming
          message.content.forEach(block => {
            block.isStreaming = false;
          });
        }
      }));

      // Clear current message if it's the one being completed
      if (state.currentMessageId === messageId) {
        setState('currentMessageId', undefined);
      }
    },

    // -------------------------------------------------------------------------
    // Content Block Operations
    // -------------------------------------------------------------------------

    addContentBlock(messageId: string, block: ContentBlock): void {
      setState('messages', produce((messages: RichMessage[]) => {
        const message = messages.find(m => m.id === messageId);
        if (message) {
          // If a block with this contentIndex already exists, replace it
          // This handles the toolcall_end case where we replace the streaming block
          const existingIndex = message.content.findIndex(
            b => b.contentIndex === block.contentIndex
          );
          
          if (existingIndex >= 0) {
            message.content[existingIndex] = block;
          } else {
            message.content.push(block);
          }
          
          log(`Added ${block.type} block to message ${messageId}`);
        }
      }));
    },

    updateContentBlock(messageId: string, contentIndex: number, delta: string): void {
      setState('messages', produce((messages: RichMessage[]) => {
        const message = messages.find(m => m.id === messageId);
        if (!message) return;

        const block = message.content.find(b => b.contentIndex === contentIndex);
        if (!block) {
          log(`Warning: No block found at contentIndex ${contentIndex} for message ${messageId}`);
          return;
        }

        switch (block.type) {
          case 'text': {
            (block as TextBlock).content += delta;
            break;
          }
          case 'thinking': {
            (block as ThinkingBlock).content += delta;
            break;
          }
          case 'tool_call': {
            // For tool calls during streaming, accumulate the JSON
            const toolBlock = block as ToolCallBlock;
            if (!toolBlock.argumentsBuffer) {
              toolBlock.argumentsBuffer = '';
            }
            toolBlock.argumentsBuffer += delta;
            
            // Try to parse partial JSON for display
            try {
              // Only parse if it looks like valid JSON so far
              if (toolBlock.argumentsBuffer.trim().startsWith('{')) {
                toolBlock.arguments = JSON.parse(toolBlock.argumentsBuffer);
              }
            } catch {
              // Partial JSON, ignore parse errors
            }
            break;
          }
          default:
            log(`Warning: Cannot update block type ${block.type} with delta`);
        }
      }));
    },

    finalizeContentBlock(messageId: string, contentIndex: number): void {
      setState('messages', produce((messages: RichMessage[]) => {
        const message = messages.find(m => m.id === messageId);
        if (!message) return;

        const block = message.content.find(b => b.contentIndex === contentIndex);
        if (block) {
          block.isStreaming = false;
          log(`Finalized ${block.type} block at contentIndex ${contentIndex}`);
        }
      }));
    },

    // -------------------------------------------------------------------------
    // User Messages
    // -------------------------------------------------------------------------

    addUserMessage(content: string): void {
      const message: UserRichMessage = {
        id: ulid(),
        role: 'user',
        content: [{
          type: 'text',
          content,
          isStreaming: false,
        }],
        timestamp: Date.now(),
        isStreaming: false,
      };

      setState('messages', (messages) => [...messages, message]);
      log(`Added user message: ${content.slice(0, 50)}...`);
    },

    // -------------------------------------------------------------------------
    // Tool Execution Operations
    // -------------------------------------------------------------------------

    addToolExecution(toolCallId: string, toolName: string, args: unknown): void {
      log(`Adding tool execution: ${toolName} (${toolCallId})`);
      
      const execution: ToolExecutionState = {
        toolCallId,
        toolName,
        args,
        isError: false,
        isComplete: false,
      };

      setState('toolExecutions', (map) => {
        const newMap = new Map(map);
        newMap.set(toolCallId, execution);
        return newMap;
      });
    },

    updateToolExecution(toolCallId: string, partialResult: unknown): void {
      setState('toolExecutions', (map) => {
        const newMap = new Map(map);
        const execution = newMap.get(toolCallId);
        if (execution) {
          execution.partialResult = partialResult;
        }
        return newMap;
      });
    },

    completeToolExecution(toolCallId: string, result: unknown, isError: boolean): void {
      log(`Tool execution complete: ${toolCallId} (${isError ? 'error' : 'success'})`);
      
      setState('toolExecutions', (map) => {
        const newMap = new Map(map);
        const execution = newMap.get(toolCallId);
        if (execution) {
          execution.result = result;
          execution.isError = isError;
          execution.isComplete = true;
        }
        return newMap;
      });

      // Also add as a content block to the current message if there is one
      if (state.currentMessageId) {
        const execution = state.toolExecutions.get(toolCallId);
        if (execution) {
          const resultContent = typeof result === 'string' 
            ? result 
            : JSON.stringify(result, null, 2);

          this.addContentBlock(state.currentMessageId, {
            type: 'tool_result',
            toolCallId,
            toolName: execution.toolName,
            content: resultContent,
            isError,
            isStreaming: false,
          });
        }
      }
    },

    // -------------------------------------------------------------------------
    // Query Operations
    // -------------------------------------------------------------------------

    getCurrentMessageId(): string | undefined {
      return state.currentMessageId;
    },

    getMessageById(messageId: string): RichMessage | undefined {
      return state.messages.find(m => m.id === messageId);
    },

    getLastAssistantMessage(): AssistantRichMessage | undefined {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        const msg = state.messages[i];
        if (msg.role === 'assistant') {
          return msg as AssistantRichMessage;
        }
      }
      return undefined;
    },

    getLastMessage(): RichMessage | undefined {
      return state.messages[state.messages.length - 1];
    },

    getToolExecution(toolCallId: string): ToolExecutionState | undefined {
      return state.toolExecutions.get(toolCallId);
    },

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    clear(): void {
      setState({
        messages: [],
        currentMessageId: undefined,
        toolExecutions: new Map(),
      });
    },
  };

  return store;
}

// ============================================================================
// Global Store Registry
// ============================================================================

const storeRegistry = new Map<string, MessageStore>();

export function getOrCreateMessageStore(sessionId: string): MessageStore {
  if (!storeRegistry.has(sessionId)) {
    storeRegistry.set(sessionId, createMessageStore());
  }
  return storeRegistry.get(sessionId)!;
}

export function removeMessageStore(sessionId: string): void {
  storeRegistry.delete(sessionId);
}

export function clearAllMessageStores(): void {
  storeRegistry.clear();
}
