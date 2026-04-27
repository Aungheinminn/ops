/**
 * Session Lifecycle - Updated with new event handling system
 */

import type { AgentSession, AgentSessionEvent, AgentSessionServices } from '@mariozechner/pi-coding-agent';
import type { SessionData } from '../types.js';
import { authStorage, modelRegistry, agentDir, configManager } from '../config.js';
import { ulid } from 'ulid';
import { log, logError } from '../logger.js';
import { createEventHandler as createNewEventHandler } from '../events/handlers.ts';
import type { EventHandlerContext } from '../events/types.ts';
import { getOrCreateMessageStore } from '../messages/store.ts';
import type { MessageStore } from '../messages/store.ts';

export interface CreateSessionOptions {
  cwd: string;
  name?: string;
  existingSessions?: Record<string, SessionData>;
  defaultModel?: string;
}

export async function createSession(
  cwd: string,
  name?: string,
  existingSessions: Record<string, SessionData> = {},
  defaultModel?: string
): Promise<SessionData> {
  log(`createSession called: ${cwd} ${name || ''}`);

  try {
    const {
      createAgentSessionServices,
      createAgentSessionFromServices,
      SettingsManager,
      SessionManager,
      readTool,
      bashTool,
      editTool,
      writeTool,
      grepTool,
      findTool,
      lsTool
    } = await import('@mariozechner/pi-coding-agent');

    log('pi-coding-agent imported');

    // Create settings manager
    const settingsManager = SettingsManager.create(cwd);
    log('SettingsManager created');

    // Use shared authStorage and modelRegistry from config module
    log('Creating AgentSessionServices...');
    const services = await createAgentSessionServices({
      cwd,
      authStorage,   // Shared instance from config
      settingsManager,
      modelRegistry, // Shared instance from config
      agentDir,      // Pass agentDir for extensions/themes
    });
    log('AgentSessionServices created');

    // Create session with services and all coding tools
    log('Creating SessionManager...');
    const sm = SessionManager.create(cwd);
    log('SessionManager created');

    // Use all tools for full coding capabilities
    const tools = [
      readTool,    // Read file contents
      bashTool,    // Execute bash commands
      editTool,    // Edit files (search/replace)
      writeTool,   // Write new files
      grepTool,    // Search file contents
      findTool,    // Find files by pattern
      lsTool,      // List directory contents
    ];

    log('Creating AgentSession from services...');
    const { session } = await createAgentSessionFromServices({
      services,
      sessionManager: sm,
      tools, // Enable all coding tools
    });
    log('AgentSession created');

    // Select model with priority: CLI option > saved config > first available
    const availableModels = modelRegistry.getAvailable();
    let selectedModel = null;

    // Priority 1: CLI --model option
    if (defaultModel) {
      selectedModel = availableModels.find(m => m.id === defaultModel);
      if (selectedModel) {
        log(`Using CLI-specified model: ${selectedModel.id}`);
      }
    }

    // Priority 2: Saved config preference
    if (!selectedModel) {
      const savedModelId = configManager.get<string>('defaultModel');
      if (savedModelId) {
        selectedModel = availableModels.find(m => m.id === savedModelId);
        if (selectedModel) {
          log(`Using saved model preference: ${selectedModel.id}`);
        }
      }
    }

    // Priority 3: First available model
    if (!selectedModel && availableModels.length > 0) {
      selectedModel = availableModels[0];
      log(`Auto-selected first available model: ${selectedModel.id}`);
    }

    if (selectedModel) {
      await session.setModel(selectedModel);
      log(`Model set: ${selectedModel.provider}/${selectedModel.id}`);
    } else {
      log('No models available - check API keys in ~/.pi/agent/auth.json');
      log(`Available providers: ${authStorage.list().join(', ')}`);
      log(`All models count: ${modelRegistry.getAll().length}`);
    }

    const sessionId = ulid();
    
    // Use "New Session" as the default name for all new sessions
    const sessionName = name || 'New Session';

    // Create message store for this session (uses registry to ensure same instance everywhere)
    const messageStore = getOrCreateMessageStore(sessionId);

    const data: SessionData & { messageStore: MessageStore } = {
      id: sessionId,
      session,
      services,
      name: sessionName,
      cwd,
      lastActivity: Date.now(),
      messages: [],
      unsubscribe: () => {},
      isLoading: false,
      messageStore,
    };

    log('Session data created, returning');
    return data;
  } catch (err) {
    logError('createSession error', err);
    throw err;
  }
}

export interface EventHandlerCallbacks {
  onLoadingChange: (loading: boolean) => void;
  onActivity: () => void;
  onMessageStoreUpdate?: (messageStore: MessageStore) => void;
  onMessageUpdate?: () => void; // Called when messages are updated (for auto-save)
}

export function createSessionEventHandler(
  sessionId: string,
  callbacks: EventHandlerCallbacks
): (event: AgentSessionEvent) => void {
  // Get or create message store for this session
  const messageStore = getOrCreateMessageStore(sessionId);

  // Create the event handler context
  const context: EventHandlerContext = {
    onLoadingChange: callbacks.onLoadingChange,
    onActivity: callbacks.onActivity,
    onMessageUpdate: callbacks.onMessageUpdate,
    messageStore: {
      startMessage: (msgId: string, role: 'assistant', timestamp: number) => messageStore.startMessage(msgId, role, timestamp),
      addContentBlock: (msgId: string, block: unknown) => messageStore.addContentBlock(msgId, block as import('../messages/types.ts').ContentBlock),
      updateContentBlock: (msgId: string, idx: number, delta: string) => messageStore.updateContentBlock(msgId, idx, delta),
      finalizeContentBlock: (msgId: string, idx: number) => messageStore.finalizeContentBlock(msgId, idx),
      completeMessage: (msgId: string) => messageStore.completeMessage(msgId),
      addToolExecution: (toolId: string, name: string, args: unknown) => messageStore.addToolExecution(toolId, name, args),
      updateToolExecution: (toolId: string, result: unknown) => messageStore.updateToolExecution(toolId, result),
      completeToolExecution: (toolId: string, result: unknown, isError: boolean) => messageStore.completeToolExecution(toolId, result, isError),
      getCurrentMessageId: () => messageStore.getCurrentMessageId(),
      getMessageByContentIndex: (_contentIndex: number) => undefined, // Not implemented in store
    },
  };

  // Notify about initial store
  if (callbacks.onMessageStoreUpdate) {
    callbacks.onMessageStoreUpdate(messageStore);
  }

  // Create and return the event handler
  return createNewEventHandler(context);
}

/**
 * @deprecated Use createSessionEventHandler instead
 */
export function createEventHandler(
  _sessionId: string,
  callbacks: {
    onLoadingChange: (loading: boolean) => void;
    onMessageAdd: (message: import('../types.js').Message) => void;
    onMessageUpdate: (result: { content: string; isDelta: boolean }) => void;
    onMessageComplete: () => void;
    onActivity: () => void;
  }
): (event: AgentSessionEvent) => void {
  // Legacy handler - wraps new system for backwards compatibility
  return (event: AgentSessionEvent) => {
    callbacks.onActivity();

    // Simple mapping for backwards compatibility
    switch (event.type) {
      case 'agent_start':
        callbacks.onLoadingChange(true);
        break;
      case 'agent_end':
        callbacks.onLoadingChange(false);
        break;
      // Other events handled by new system
    }
  };
}

export function cleanupSession(session: SessionData): void {
  try {
    session.unsubscribe();
  } catch {
    // Ignore
  }
  // Clean up message store
  const sessionWithStore = session as SessionData & { messageStore?: MessageStore };
  if (sessionWithStore.messageStore) {
    // Keep store for now (allows viewing history after close)
    // Could be cleaned up here if memory is a concern
  }
}
