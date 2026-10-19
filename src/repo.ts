import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const cache = new Map<string, string>();

// The same repo sits at a different path on every machine, so rows are keyed by the remote:
// 'git@github.com:Org/Repo.git' and 'https://github.com/org/repo' both become 'github.com/org/repo'.
// Without a remote (or once the directory is gone) only the folder name is kept, never the path.
export function repoOf(cwd: string | undefined): string {
  if (!cwd) return 'local:unknown';
  let repo = cache.get(cwd);
  if (repo) return repo;
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    repo = normalizeRemote(url);
  } catch {
    repo = `local:${basename(cwd) || 'root'}`;
  }
  cache.set(cwd, repo);
  return repo;
}

export function normalizeRemote(url: string): string {
  return url
    .replace(/^[a-z+]+:\/\//, '')
    .replace(/^[^@/]+@/, '')
    .replace(/^([^/:]+):(?!\d+\/)/, '$1/')
    .replace(/:\d+\//, '/')
    .replace(/\.git\/?$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}
