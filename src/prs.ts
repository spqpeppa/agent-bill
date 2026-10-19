// A merged pull request, matched to usage by repo and head branch.
export interface PullRequest {
  repo: string;              // 'github.com/org/repo'
  number: number;
  title: string;
  branch: string;
  mergedAt: string;          // ISO
  url: string;
}
