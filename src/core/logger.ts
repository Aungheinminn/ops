import { appendFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const logFile = join(homedir(), '.pi', 'ops', 'debug.log');

// Clear log at startup
if (existsSync(logFile)) {
  try {
    unlinkSync(logFile);
  } catch {
    // Ignore
  }
}

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(logFile, line);
  } catch {
    // Ignore write errors
  }
}

export function logError(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] ERROR: ${message}`;
  if (error) {
    line += ` - ${error instanceof Error ? error.stack || error.message : String(error)}`;
  }
  line += '\n';
  try {
    appendFileSync(logFile, line);
  } catch {
    // Ignore write errors
  }
}

export function logObject(label: string, obj: unknown): void {
  try {
    const str = JSON.stringify(obj, null, 2);
    log(`${label}: ${str.slice(0, 500)}`);
  } catch {
    log(`${label}: [Error stringifying object]`);
  }
}
