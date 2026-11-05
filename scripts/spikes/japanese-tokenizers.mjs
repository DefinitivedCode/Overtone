// M4 spike (ADR 0002): kuromoji.js (IPADIC) vs lindera-wasm (IPADIC) in Node.
// Browser (WebKit/Chromium) integration is checked separately: scripts/spikes/japanese-browser.md.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const base = path.join(root, '.cache', 'spikes');
const req = createRequire(path.join(base, 'package.json'));
const fixtures = JSON.parse(
  readFileSync(path.join(root, 'fixtures/linguistic/ja/starter.json'), 'utf8'),
);

const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const mem = () => (process.memoryUsage().rss / 1048576).toFixed(0);

function score(name, loadMs, rssBefore, tokenize) {
  let lineOk = 0;
  const misses = [];
  const t0 = performance.now();
  for (const f of fixtures) {
    const toks = tokenize(f.text); // [{surface, reading(hira)}]
    const got = toks.map((t) => t.reading ?? t.surface).join('');
    if (got === f.expected.reading) lineOk++;
    else misses.push(`${f.text} → ${got} (expected ${f.expected.reading})`);
  }
  const ms = performance.now() - t0;
  console.log(
    `${name.padEnd(22)} load ${loadMs.toFixed(0)} ms  rss +${mem() - rssBefore} MB  lines ${lineOk}/${fixtures.length}  tokenise 50 lines ${ms.toFixed(1)} ms`,
  );
  if (process.argv.includes('--misses')) console.log('  ' + misses.slice(0, 15).join('\n  '));
}

// ---- kuromoji ----
{
  const kuromoji = req('kuromoji');
  const rss0 = Number(mem());
  const t0 = performance.now();
  const tokenizer = await new Promise((res, rej) =>
    kuromoji
      .builder({ dicPath: path.join(base, 'node_modules/kuromoji/dict') })
      .build((e, t) => (e ? rej(e) : res(t))),
  );
  const load = performance.now() - t0;
  score('kuromoji (IPADIC)', load, rss0, (text) =>
    tokenizer
      .tokenize(text)
      .map((t) => ({ surface: t.surface_form, reading: t.reading ? kata2hira(t.reading) : null })),
  );
}

// ---- lindera (nodejs build) ----
{
  const rss0 = Number(mem());
  const t0 = performance.now();
  const L = req('lindera-wasm-nodejs-ipadic');
  const b = new L.TokenizerBuilder();
  b.setDictionary('embedded://ipadic');
  b.setMode('normal');
  const tk = b.build();
  const load = performance.now() - t0;
  const sample = tk.tokenize('君の名前を呼んでいた');
  if (process.argv.includes('--shape')) console.log(JSON.stringify(sample).slice(0, 600));
  score('lindera-wasm (IPADIC)', load, rss0, (text) =>
    tk.tokenize(text).map((t) => {
      const reading = t.reading && t.reading !== '*' ? kata2hira(t.reading) : null;
      return { surface: t.surface ?? '', reading };
    }),
  );
}
