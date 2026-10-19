import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// handles.json at the root of the data branch: who takes part, and on shared machines which
// accounts are theirs (docs/data-format.md).
export interface Handles {
  schema: 1;
  people: Record<string, { mirasim?: string[] }>;
}

export function loadHandles(dir: string): Handles {
  const file = join(dir, 'handles.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { schema: 1, people: {} };
}

export function saveHandles(dir: string, handles: Handles): void {
  writeFileSync(join(dir, 'handles.json'), JSON.stringify(handles, null, 2) + '\n');
}

// Adds `email` as one of `handle`'s Mirasim accounts; returns false when it was already there.
export function addMirasim(handles: Handles, handle: string, email: string): boolean {
  const person = (handles.people[handle] ??= {});
  const list = (person.mirasim ??= []);
  if (list.includes(email.toLowerCase())) return false;
  list.push(email.toLowerCase());
  return true;
}

export function handleByMirasim(handles: Handles): Map<string, string> {
  const map = new Map<string, string>();
  for (const [handle, p] of Object.entries(handles.people)) {
    for (const email of p.mirasim ?? []) map.set(email.toLowerCase(), handle);
  }
  return map;
}
