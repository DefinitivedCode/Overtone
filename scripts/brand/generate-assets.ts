import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildAssets } from './build';

const root = path.resolve(import.meta.dirname, '..', '..');
const MAX_PNG = 200 * 1024;

const { assets } = buildAssets();
const rows: string[] = [];
let failed = false;
for (const a of assets) {
  const full = path.join(root, a.path);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, a.data);
  const bytes = typeof a.data === 'string' ? Buffer.byteLength(a.data) : a.data.length;
  if (a.path.endsWith('.png') && bytes > MAX_PNG) {
    failed = true;
    rows.push(`${a.path.padEnd(70)} ${String(bytes).padStart(8)} B  TOO LARGE (> 200 KB)`);
  } else {
    rows.push(`${a.path.padEnd(70)} ${String(bytes).padStart(8)} B`);
  }
}
console.log(rows.join('\n'));
if (failed) process.exit(1);
