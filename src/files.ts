import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export function* walk(dir: string, match: (name: string) => boolean): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path, match);
    else if (entry.isFile() && match(entry.name)) yield path;
  }
}

// Yields parsed JSON lines; a half-written last line (the agent is still running) is skipped.
export async function* jsonLines(file: string): AsyncGenerator<any> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // ignore
    }
  }
}

export const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
