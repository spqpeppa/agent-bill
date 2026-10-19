import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ~/.agentbill/config.json: this device's id, and the handle and repo `share` remembers.
export interface Config {
  device: string;            // 'd-' + 8 hex, never the hostname
  handle?: string;
  repo?: string;
}

export const stateDir = () => process.env.AGENTBILL_HOME ?? join(homedir(), '.agentbill');
const file = () => join(stateDir(), 'config.json');

export function loadConfig(): Config {
  const config: Partial<Config> = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {};
  if (!config.device) {
    config.device = `d-${randomBytes(4).toString('hex')}`;
    saveConfig(config as Config);
  }
  return config as Config;
}

export function saveConfig(config: Config): void {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(file(), JSON.stringify(config, null, 2) + '\n');
}

export const HANDLE = /^[a-z0-9-]{1,32}$/;
