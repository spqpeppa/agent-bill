import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './config.ts';

export const BRANCH = 'agent-bill-data';

// A local clone of the team repo's data branch, kept under ~/.agentbill/data/. It is a cache:
// every run resets it to the remote branch first, so nothing is ever kept only here.
export class DataBranch {
  readonly repo: string;
  readonly dir: string;

  constructor(repo: string) {
    this.repo = repo;
    this.dir = join(stateDir(), 'data', createHash('sha256').update(repo).digest('hex').slice(0, 12));
  }

  // Brings the clone up to date with the remote branch; creates the branch when the repo has none.
  sync(): void {
    if (!existsSync(join(this.dir, '.git'))) {
      mkdirSync(this.dir, { recursive: true });
      this.git('init', '-q');
      this.git('remote', 'add', 'origin', this.repo);
    }
    if (this.fetch()) {
      this.git('checkout', '-q', '-B', BRANCH, `origin/${BRANCH}`);
      this.git('reset', '-q', '--hard', `origin/${BRANCH}`);
      this.git('clean', '-qfd');
    } else if (!this.hasCommits()) {
      // Push the new branch right away, so the next person fetches it instead of starting another.
      this.git('checkout', '-q', '--orphan', BRANCH);
      writeFileSync(join(this.dir, 'README.md'), DATA_README);
      this.git('add', 'README.md');
      this.commit('Start the agent-bill data branch');
      try {
        this.git('push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`);
      } catch (e) {
        // Someone else started it at the same moment: use theirs.
        if (!this.fetch()) throw e;
        this.git('reset', '-q', '--hard', `origin/${BRANCH}`);
      }
    }
  }

  // Commits everything under `paths` and pushes; rebases and retries when someone pushed first.
  publish(paths: string[], message: string): 'pushed' | 'unchanged' {
    this.git('add', '--', ...paths);
    const staged = this.git('diff', '--cached', '--name-only').trim();
    if (!staged && !this.ahead()) return 'unchanged';
    if (staged) this.commit(message);
    for (let attempt = 1; ; attempt++) {
      try {
        this.git('push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`);
        return 'pushed';
      } catch (e) {
        if (attempt === 3) throw e;
        this.fetch();
        this.git('rebase', '-q', `origin/${BRANCH}`);
      }
    }
  }

  private fetch(): boolean {
    try {
      this.git('fetch', '-q', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`);
      return true;
    } catch (e) {
      // The repo has no data branch yet (fetch fails with "couldn't find remote ref").
      if (/couldn't find remote ref/i.test(String((e as any).stderr ?? e))) return false;
      throw e;
    }
  }

  private hasCommits(): boolean {
    try {
      this.git('rev-parse', '-q', '--verify', 'HEAD');
      return true;
    } catch {
      return false;
    }
  }

  private ahead(): boolean {
    try {
      return this.git('rev-list', '--count', `origin/${BRANCH}..HEAD`).trim() !== '0';
    } catch {
      return this.hasCommits(); // no remote branch yet
    }
  }

  // Commits as agent-bill, so the data branch history shows no one's git identity. Set through the
  // environment because GIT_AUTHOR_* / GIT_COMMITTER_* variables, when present, override user.name.
  private commit(message: string): void {
    this.run(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message], IDENTITY);
  }

  git(...args: string[]): string {
    return this.run(args);
  }

  private run(args: string[], env: Record<string, string> = {}): string {
    return execFileSync('git', ['-C', this.dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: process.stdin.isTTY ? '1' : '0', ...env },
    });
  }
}

const IDENTITY = {
  GIT_AUTHOR_NAME: 'agent-bill',
  GIT_AUTHOR_EMAIL: 'agent-bill@users.noreply.invalid',
  GIT_COMMITTER_NAME: 'agent-bill',
  GIT_COMMITTER_EMAIL: 'agent-bill@users.noreply.invalid',
};

const DATA_README = `# agent-bill data

This branch holds the daily usage totals people share with \`agent-bill share\`, and nothing else.
It is written by the tool; don't merge it into other branches.

Format: https://github.com/spqpeppa/agent-bill/blob/main/docs/data-format.md
`;
