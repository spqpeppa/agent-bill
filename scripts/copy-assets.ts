// tsc only emits .js; the price table is read at runtime, so it goes next to the compiled code.
import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../src/prices.json', import.meta.url), new URL('../dist/prices.json', import.meta.url));
