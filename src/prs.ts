import { execFileSync } from 'node:child_process';

// A merged pull request, matched to usage by repo and head branch.
export interface PullRequest {
  repo: string;              // 'github.com/org/repo'
  number: number;
  title: string;
  branch: string;
  mergedAt: string;          // ISO
  url: string;
}

// Branches that are a repo's mainline rather than a PR's head; not looked up.
const MAINLINE = new Set(['main', 'master', 'develop', 'dev', 'trunk']);
const MAX_LOOKUPS = 300;

// $GITHUB_TOKEN, else the GitHub CLI's token when it is signed in.
export function githubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface Lookup {
  prs: PullRequest[];
  looked: number;
  skipped: number;           // branches not looked up: over the limit
  failed: string[];          // 'org/repo': not found or no access
}

// Finds merged PRs whose head is one of the given github.com branches (one API call per branch).
export async function mergedPrs(
  branches: { repo: string; branch: string }[],
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Lookup> {
  const wanted = [...new Map(branches
    .filter((b) => b.repo.startsWith('github.com/') && b.repo.split('/').length === 3 && !MAINLINE.has(b.branch))
    .map((b) => [`${b.repo}\u0000${b.branch}`, b])).values()];
  const todo = wanted.slice(0, MAX_LOOKUPS);
  const prs: PullRequest[] = [];
  const failed = new Set<string>();

  const lookup = async ({ repo, branch }: { repo: string; branch: string }) => {
    const [, owner, name] = repo.split('/');
    if (failed.has(`${owner}/${name}`)) return;
    const url = `https://api.github.com/repos/${owner}/${name}/pulls?state=closed&per_page=100&head=${encodeURIComponent(`${owner}:${branch}`)}`;
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    });
    if (!res.ok) {
      failed.add(`${owner}/${name}`);
      return;
    }
    for (const p of (await res.json()) as any[]) {
      if (!p.merged_at) continue;
      prs.push({ repo, number: p.number, title: p.title, branch, mergedAt: p.merged_at, url: p.html_url });
    }
  };

  // A few at a time, to stay well inside GitHub's secondary rate limits.
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(lookup));
  return { prs: prs.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt)), looked: todo.length, skipped: wanted.length - todo.length, failed: [...failed].sort() };
}
