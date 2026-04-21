import type { AgentSession, AgentSessionEvent, AgentSessionServices } from '@mariozechner/pi-coding-agent';
import type { SessionData } from '../types.js';
import { parseMessageStart, parseMessageUpdate, parseToolExecution, isHandledEventType } from '../messages.js';
import { ulid } from 'ulid';

export async function createSession(
  cwd: string,
  name?: string,
  existingSessions: Record<string, SessionData> = {}
): Promise<SessionData> {
  const { 
    createAgentSessionServices, 
    createAgentSessionFromServices,
    AuthStorage,
    SettingsManager,
    ModelRegistry,
    readTool,
    bashTool,
    editTool,
    writeTool,
    grepTool,
    findTool,
    lsTool
  } = await import('@mariozechner/pi-coding-agent');
  
  // Create services first
  const authStorage = AuthStorage.create();
  const settingsManager = SettingsManager.create(cwd);
  const modelRegistry = ModelRegistry.create(authStorage);
  
  const services = await createAgentSessionServices({
    cwd,
    authStorage,
    settingsManager,
    modelRegistry,
  });
  
  // Create session with services and all coding tools
  const { SessionManager } = await import('@mariozechner/pi-coding-agent');
  const sm = SessionManager.create(cwd);
  
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
  
  const { session } = await createAgentSessionFromServices({
    services,
    sessionManager: sm,
    tools, // Enable all coding tools
  });
  
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
  
  return data;
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
    callbacks.onActivity();
    
    if (!isHandledEventType(event.type)) {
      return;
    }
    
    switch (event.type) {
      case 'agent_start':
        callbacks.onLoadingChange(true);
        break;
      case 'agent_end':
        callbacks.onLoadingChange(false);
        break;
      case 'message_start': {
        const message = parseMessageStart(event);
        callbacks.onMessageAdd(message);
        break;
      }
      case 'message_update': {
        const content = parseMessageUpdate(event);
        callbacks.onMessageUpdate(content);
        break;
      }
      case 'message_end':
        callbacks.onMessageComplete();
        break;
      case 'tool_execution_start': {
        const message = parseToolExecution(event);
        if (message) {
          callbacks.onMessageAdd(message);
        }
        break;
      }
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
