import type { Source } from '../types.ts';
import { claudeCode } from './claude-code.ts';
import { codex } from './codex.ts';

// One adapter per agent. To add one: read its local logs, yield UsageEvents, list it here.
export const sources: Source[] = [claudeCode, codex];
