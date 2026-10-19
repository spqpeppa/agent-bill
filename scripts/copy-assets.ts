// tsc only emits .js; the price table and the report template are read at runtime, so they go
// next to the compiled code.
import { copyFileSync, mkdirSync } from 'node:fs';

const from = (p: string) => new URL(`../src/${p}`, import.meta.url);
const to = (p: string) => new URL(`../dist/${p}`, import.meta.url);
mkdirSync(to('report'), { recursive: true });
for (const p of ['prices.json', 'report/template.html']) copyFileSync(from(p), to(p));
