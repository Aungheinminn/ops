import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { log, logError, logObject } from './logger.js';
import { configManager } from './config/manager.js';

// OPS-specific config directory: ~/.pi/ops/
export const opsConfigDir = join(homedir(), '.pi', 'ops');

// Ensure OPS config dir exists
if (!existsSync(opsConfigDir)) {
  mkdirSync(opsConfigDir, { recursive: true, mode: 0o700 });
}

// Shared pi agent directory: ~/.pi/agent/ (or OPS_AGENT_DIR override)
const agentDir = process.env.OPS_AGENT_DIR ?? join(homedir(), '.pi', 'agent');

// Shared auth storage: ~/.pi/agent/auth.json
export const authStorage = AuthStorage.create(join(agentDir, 'auth.json'));

// Shared model registry: ~/.pi/agent/models.json
export const modelRegistry = ModelRegistry.create(
  authStorage,
  join(agentDir, 'models.json'),
);

// Set runtime API keys from environment variables
if (process.env.ANTHROPIC_API_KEY) {
  authStorage.setRuntimeApiKey('anthropic', process.env.ANTHROPIC_API_KEY);
}
if (process.env.OPENAI_API_KEY) {
  authStorage.setRuntimeApiKey('openai', process.env.OPENAI_API_KEY);
}
if (process.env.GOOGLE_API_KEY) {
  authStorage.setRuntimeApiKey('google', process.env.GOOGLE_API_KEY);
}
if (process.env.GROQ_API_KEY) {
  authStorage.setRuntimeApiKey('groq', process.env.GROQ_API_KEY);
}
if (process.env.OPENCODEGO_API_KEY) {
  authStorage.setRuntimeApiKey('opencode', process.env.OPENCODEGO_API_KEY);
}

// Debug logging
log('Config loaded');
log(`Agent dir: ${agentDir}`);
log(`All models: ${modelRegistry.getAll().length}`);
log(`Available models: ${modelRegistry.getAvailable().length}`);
log(`Auth providers: ${authStorage.list().join(', ')}`);

export { agentDir };
export { configManager };
export type { OpsConfig } from './config/manager.js';
