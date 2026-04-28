import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { InputMode } from '../types.js';

export interface QueueState {
  steering: readonly string[];
  followUp: readonly string[];
  totalCount: number;
}

export interface QueueRouterOptions {
  mode: InputMode;
  autoQueueWhenStreaming: boolean;
}

const turnState = new Map<string, boolean>();
const toolExecutionState = new Map<string, boolean>();

export function setTurnActive(sessionId: string, active: boolean): void {
  turnState.set(sessionId, active);
}

export function isTurnActive(sessionId: string): boolean {
  return turnState.get(sessionId) ?? false;
}

export function setToolExecuting(sessionId: string, executing: boolean): void {
  toolExecutionState.set(sessionId, executing);
}

export function isToolExecuting(sessionId: string): boolean {
  return toolExecutionState.get(sessionId) ?? false;
}

export function isAgentBusy(session: AgentSession, sessionId: string): boolean {
  const inTurn = isTurnActive(sessionId);
  const toolRunning = isToolExecuting(sessionId);
  return session.isStreaming || session.pendingMessageCount > 0 || inTurn || toolRunning;
}

export function getQueueState(session: AgentSession): QueueState {
  return {
    steering: session.getSteeringMessages(),
    followUp: session.getFollowUpMessages(),
    totalCount: session.pendingMessageCount,
  };
}

export async function routeMessage(
  session: AgentSession,
  sessionId: string,
  text: string,
  mode: InputMode,
  options?: {
    forceSteer?: boolean;
    forceFollowUp?: boolean;
  }
): Promise<void> {
  if (!isAgentBusy(session, sessionId)) {
    await session.sendUserMessage(text);
    return;
  }

  const shouldSteer = options?.forceSteer || (!options?.forceFollowUp && mode === 'build');

  if (shouldSteer) {
    await session.steer(text);
  } else {
    await session.followUp(text);
  }
}

export function clearQueue(session: AgentSession): { steering: string[]; followUp: string[] } {
  return session.clearQueue();
}

export function getDeliveryMode(mode: InputMode): string {
  return mode === 'build' ? 'steer' : 'follow-up';
}