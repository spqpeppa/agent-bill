#!/usr/bin/env node
// agent-bill: what your team's coding agents cost, from the logs they already keep.
import { scan } from './commands/scan.ts';
import { VERSION } from './version.ts';

const USAGE = `usage: agent-bill <command> [options]

  scan     your own usage from local Claude Code and Codex logs
           --by day|model|repo|branch|agent   --since YYYY-MM-DD   --until YYYY-MM-DD   --json

  agent-bill <command> --help    more about one command
  agent-bill --version`;

const [command, ...args] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<number>> = { scan };

if (command === '--version' || command === '-v') {
  console.log(VERSION);
} else if (!command || command === 'help' || command === '--help' || command === '-h') {
  console.log(USAGE);
} else if (commands[command]) {
  process.exitCode = await commands[command](args);
} else {
  console.error(`agent-bill: unknown command '${command}'\n\n${USAGE}`);
  process.exitCode = 64;
}
