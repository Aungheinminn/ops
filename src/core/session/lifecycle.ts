import type { AgentSession, AgentSessionEvent, AgentSessionServices } from '@mariozechner/pi-coding-agent';
import type { SessionData } from '../types.js';
import { authStorage, modelRegistry, agentDir, configManager } from '../config.js';
import { ulid } from 'ulid';
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

async function createSessionInternal(
  cwd: string,
  name: string | undefined,
  existingSessions: Record<string, SessionData>,
  defaultModel: string | undefined,
  sessionId: string
): Promise<SessionData> {
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

    const settingsManager = SettingsManager.create(cwd);

    const services = await createAgentSessionServices({
      cwd,
      authStorage,
      settingsManager,
      modelRegistry,
      agentDir,
    });

    const sm = SessionManager.create(cwd);

    const tools = [
      readTool,
      bashTool,
      editTool,
      writeTool,
      grepTool,
      findTool,
      lsTool,
    ];

    const { session } = await createAgentSessionFromServices({
      services,
      sessionManager: sm,
      tools,
    });

    const availableModels = modelRegistry.getAvailable();
    let selectedModel = null;

    if (defaultModel) {
      selectedModel = availableModels.find(m => m.id === defaultModel);
    }

    if (!selectedModel) {
      const savedModelId = configManager.get<string>('defaultModel');
      if (savedModelId) {
        selectedModel = availableModels.find(m => m.id === savedModelId);
      }
    }

    if (!selectedModel && availableModels.length > 0) {
      selectedModel = availableModels[0];
    }

    if (selectedModel) {
      await session.setModel(selectedModel);
    }

    const sessionName = name || 'New Session';

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

    return data;
  } catch (err) {
    throw err;
  }
}

export async function createSession(
  cwd: string,
  name?: string,
  existingSessions: Record<string, SessionData> = {},
  defaultModel?: string
): Promise<SessionData> {
  const sessionId = ulid();
  return createSessionInternal(cwd, name, existingSessions, defaultModel, sessionId);
}

export async function createSessionWithId(
  sessionId: string,
  cwd: string,
  name?: string,
  existingSessions: Record<string, SessionData> = {},
  defaultModel?: string
): Promise<SessionData> {
  return createSessionInternal(cwd, name, existingSessions, defaultModel, sessionId);
}

export interface EventHandlerCallbacks {
  onLoadingChange: (loading: boolean) => void;
  onActivity: () => void;
  onMessageStoreUpdate?: (messageStore: MessageStore) => void;
  onMessageUpdate?: () => void;
  onQueueUpdate?: (queueState: { steering: readonly string[]; followUp: readonly string[]; totalCount: number }) => void;
}

export function createSessionEventHandler(
  sessionId: string,
  callbacks: EventHandlerCallbacks
): (event: AgentSessionEvent) => void {
  const messageStore = getOrCreateMessageStore(sessionId);

  const context: EventHandlerContext = {
    sessionId,
    onLoadingChange: callbacks.onLoadingChange,
    onActivity: callbacks.onActivity,
    onMessageUpdate: callbacks.onMessageUpdate,
    onQueueUpdate: callbacks.onQueueUpdate,
    messageStore: {
      startMessage: (msgId: string, role: 'assistant', timestamp: number) => messageStore.startMessage(msgId, role, timestamp),
      addUserMessage: (content: string) => messageStore.addUserMessage(content),
      addContentBlock: (msgId: string, block: unknown) => messageStore.addContentBlock(msgId, block as import('../messages/types.ts').ContentBlock),
      updateContentBlock: (msgId: string, idx: number, delta: string) => messageStore.updateContentBlock(msgId, idx, delta),
      finalizeContentBlock: (msgId: string, idx: number) => messageStore.finalizeContentBlock(msgId, idx),
      completeMessage: (msgId: string) => messageStore.completeMessage(msgId),
      addToolExecution: (toolId: string, name: string, args: unknown) => messageStore.addToolExecution(toolId, name, args),
      updateToolExecution: (toolId: string, result: unknown) => messageStore.updateToolExecution(toolId, result),
      completeToolExecution: (toolId: string, result: unknown, isError: boolean) => messageStore.completeToolExecution(toolId, result, isError),
      getCurrentMessageId: () => messageStore.getCurrentMessageId(),
      getLastMessage: () => messageStore.getLastMessage(),
      getMessageByContentIndex: (_contentIndex: number) => undefined,
    },
  };

  if (callbacks.onMessageStoreUpdate) {
    callbacks.onMessageStoreUpdate(messageStore);
  }

  return createNewEventHandler(context);
}

export function cleanupSession(session: SessionData): void {
  try {
    session.unsubscribe();
  } catch {
  }
}
