import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { log, logError } from '../logger.js';

export interface OpsConfig {
  defaultModel?: string;
  [key: string]: unknown;
}

// OPS-specific config directory: ~/.pi/ops/
const opsConfigDir = join(homedir(), '.pi', 'ops');

// Ensure OPS config dir exists
if (!existsSync(opsConfigDir)) {
  mkdirSync(opsConfigDir, { recursive: true, mode: 0o700 });
}

const CONFIG_FILE = join(opsConfigDir, 'config.json');

class ConfigManagerClass {
  private config: OpsConfig = {};
  private loaded = false;

  private load(): void {
    if (this.loaded) return;

    try {
      if (existsSync(CONFIG_FILE)) {
        const content = readFileSync(CONFIG_FILE, 'utf-8');
        this.config = JSON.parse(content) as OpsConfig;
        log(`Config loaded from ${CONFIG_FILE}`);
      } else {
        this.config = {};
        log(`No config file found at ${CONFIG_FILE}, using defaults`);
      }
    } catch (err) {
      logError('Failed to load config', err);
      this.config = {};
    }

    this.loaded = true;
  }

  get<T = unknown>(key: string): T | undefined {
    this.load();
    return this.config[key] as T | undefined;
  }

  set<T = unknown>(key: string, value: T): void {
    this.load();
    this.config[key] = value;
  }

  async save(): Promise<void> {
    try {
      const content = JSON.stringify(this.config, null, 2);
      writeFileSync(CONFIG_FILE, content, 'utf-8');
      log(`Config saved to ${CONFIG_FILE}`);
    } catch (err) {
      logError('Failed to save config', err);
      throw err;
    }
  }

  getAll(): OpsConfig {
    this.load();
    return { ...this.config };
  }

  clear(): void {
    this.config = {};
    this.loaded = true;
  }
}

export const configManager = new ConfigManagerClass();
export default configManager;
