import type { AgentSession, AgentSessionEvent, AgentSessionServices } from '@mariozechner/pi-coding-agent';
import type { SessionData } from '../types.js';
import { parseMessageStart, parseMessageUpdate, parseToolExecution, isHandledEventType } from '../messages.js';
import { authStorage, modelRegistry, agentDir } from '../config.js';
import { ulid } from 'ulid';
import { log, logError, logObject } from '../logger.js';

export async function createSession(
  cwd: string,
  name?: string,
  existingSessions: Record<string, SessionData> = {}
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
    
    // Auto-select first available model
    const availableModels = modelRegistry.getAvailable();
    if (availableModels.length > 0) {
      const firstModel = availableModels[0];
      await session.setModel(firstModel);
      log(`Auto-selected model: ${firstModel.provider}/${firstModel.id}`);
    } else {
      log('No models available - check API keys in ~/.pi/agent/auth.json');
      log(`Available providers: ${authStorage.list().join(', ')}`);
      log(`All models count: ${modelRegistry.getAll().length}`);
    }
    
    const sessionId = ulid();
    const sessionName = name || `Session ${Object.keys(existingSessions).length + 1}`;
    
    const data: SessionData = {
      id: sessionId,
      session,
      services,
      name: sessionName,
      cwd,
      lastActivity: Date.now(),
      messages: [],
      unsubscribe: () => {},
      isLoading: false,
    };
    
    log('Session data created, returning');
    return data;
  } catch (err) {
    logError('createSession error', err);
    throw err;
  }
}

export function createEventHandler(
  _sessionId: string,
  callbacks: {
    onLoadingChange: (loading: boolean) => void;
    onMessageAdd: (message: import('../types.js').Message) => void;
    onMessageUpdate: (content: string) => void;
    onMessageComplete: () => void;
    onActivity: () => void;
  }
): (event: AgentSessionEvent) => void {
  return (event: AgentSessionEvent) => {
    log(`Agent event: ${event.type} ${JSON.stringify(event).slice(0, 300)}`);
    callbacks.onActivity();
    
    if (!isHandledEventType(event.type)) {
      log(`Event type not handled: ${event.type}`);
      return;
    }
    
    switch (event.type) {
      case 'agent_start':
        log('Agent started');
        callbacks.onLoadingChange(true);
        break;
      case 'agent_end':
        log('Agent ended');
        callbacks.onLoadingChange(false);
        break;
      case 'message_start': {
        log('Message started');
        const message = parseMessageStart(event);
        if (message) {
          log(`Parsed message: ${JSON.stringify(message).slice(0, 200)}`);
          callbacks.onMessageAdd(message);
        } else {
          log('Skipping user message (already in store)');
        }
        break;
      }
      case 'message_update': {
        const content = parseMessageUpdate(event);
        log(`Message update, content length: ${content.length}`);
        callbacks.onMessageUpdate(content);
        break;
      }
      case 'message_end':
        log('Message ended');
        callbacks.onMessageComplete();
        break;
      case 'tool_execution_start': {
        log('Tool execution started');
        const message = parseToolExecution(event);
        if (message) {
          callbacks.onMessageAdd(message);
        }
        break;
      }
      default:
        log(`Unhandled event type: ${event.type}`);
    }
  };
}

export function cleanupSession(session: SessionData): void {
  try {
    session.unsubscribe();
  } catch {
    // Ignore
  }
}
