import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergedPrs } from '../src/prs.ts';

test('merged PRs: looked up by head branch, unmerged and mainline skipped, no-access repos noted', async () => {
  const urls: string[] = [];
  const fake = (async (url: string, init: any) => {
    urls.push(url);
    assert.equal(init.headers.authorization, 'Bearer t0ken');
    if (url.includes('/repos/acme/secret/')) return new Response('{}', { status: 404 });
    const head = decodeURIComponent(new URL(url).searchParams.get('head')!);
    const body = head === 'acme:feat/cart'
      ? [
          { number: 7, title: 'Cart', merged_at: '2026-10-17T10:00:00Z', html_url: 'https://github.com/acme/shop/pull/7' },
          { number: 5, title: 'Closed, not merged', merged_at: null, html_url: 'x' },
        ]
      : [];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  const r = await mergedPrs([
    { repo: 'github.com/acme/shop', branch: 'feat/cart' },
    { repo: 'github.com/acme/shop', branch: 'feat/cart' },       // same branch again: one lookup
    { repo: 'github.com/acme/shop', branch: 'main' },            // mainline: not looked up
    { repo: 'gitlab.com/acme/shop', branch: 'feat/x' },          // not GitHub
    { repo: 'local:scratch', branch: 'feat/y' },
    { repo: 'github.com/acme/secret', branch: 'feat/z' },
  ], 't0ken', fake);

  assert.equal(urls.length, 2);
  assert.ok(urls[0].startsWith('https://api.github.com/repos/acme/shop/pulls?state=closed'));
  assert.deepEqual(r.prs, [{ repo: 'github.com/acme/shop', number: 7, title: 'Cart', branch: 'feat/cart', mergedAt: '2026-10-17T10:00:00Z', url: 'https://github.com/acme/shop/pull/7' }]);
  assert.deepEqual(r.failed, ['acme/secret']);
  assert.equal(r.looked, 2);
});
