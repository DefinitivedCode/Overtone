// M4 spike (ADR 0002): lindera-wasm (IPADIC, web build) inside a module Worker in WebKit and Chromium.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..', '..');
const dir = path.join(root, '.cache', 'spikes', 'web');
const fixtures = JSON.parse(
  readFileSync(path.join(root, 'fixtures/linguistic/ja/starter.json'), 'utf8'),
);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const f = path.join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!existsSync(f)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(4181);

for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await type.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:4181/');
  await page.waitForFunction(() => window.ready);
  try {
    const t0 = Date.now();
    const r = await page.evaluate(
      (lines) => window.run(lines),
      fixtures.map((f) => f.text),
    );
    const ok = r.out.filter((o, i) => o === fixtures[i].expected.reading).length;
    console.log(
      `${name.padEnd(9)} worker OK  wall ${Date.now() - t0} ms | wasm init ${r.initMs.toFixed(0)} ms, dict build ${r.buildMs.toFixed(0)} ms, tokenise 50 lines ${r.tokenizeMs.toFixed(1)} ms | lines ${ok}/${fixtures.length} | heap ${r.heap ? (r.heap / 1048576).toFixed(0) + ' MB' : 'n/a'}`,
    );
  } catch (e) {
    console.log(`${name.padEnd(9)} FAILED: ${e.message}`);
  }
  if (errors.length) console.log('  errors:', errors.slice(0, 3));
  await browser.close();
}
server.close();
