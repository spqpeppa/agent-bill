#!/bin/sh
# Builds site/: the online demo (agent-bill report on agent-bill demo's made-up team) and its cover.
set -eu
cd "$(dirname "$0")/../.."
rm -rf site /tmp/agent-bill-site-data
mkdir -p site
node src/cli.ts demo --out /tmp/agent-bill-site-data --end 2026-10-19
node src/cli.ts report --data /tmp/agent-bill-site-data --as-of 2026-10-19 --out site/index.html \
  --label "a made-up team (demo data, not real usage)"
for chrome in google-chrome chromium chromium-browser; do
  if command -v "$chrome" >/dev/null; then
    "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1200,630 \
      --screenshot="$PWD/site/cover.png" "file://$PWD/scripts/site/cover.html" 2>/dev/null
    break
  fi
done
