// M4 spike (ADR 0003): Korean romanisation candidates on the 60-line starter set.
// Candidates are installed in .cache/spikes (see scripts/spikes/README.md), not in package.json.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const req = createRequire(path.join(root, '.cache', 'spikes', 'package.json'));
const load = async (name) => {
  const m = await import(pathToFileURL(req.resolve(name)).href);
  return m.default && Object.keys(m).length === 1 ? m.default : m;
};
const fixtures = JSON.parse(
  readFileSync(path.join(root, 'fixtures/linguistic/ko/starter.json'), 'utf8'),
);

const { romaniseKorean } = await import(
  pathToFileURL(path.join(root, 'scripts/spikes/.own-ko.mjs')).href
).catch(() => ({}));

const hu = await load('hangul-util');
const aromanize = (await import(pathToFileURL(req.resolve('aromanize')).href)).default;
const rk = (await import(pathToFileURL(req.resolve('@romanize/korean')).href)).default;
const hr = await import(pathToFileURL(req.resolve('hangul-romanization')).href);
const kp = (await import(pathToFileURL(req.resolve('korean-pronunciation')).href)).default;
const g2p = new kp.G2p();

const norm = (s) => s.toLowerCase().replace(/[-'’]/g, '').replace(/\s+/g, ' ').trim();
const candidates = {
  'own (src/engine/ko)': romaniseKorean,
  'hangul-util romanize': (t) => hu.romanize(t),
  'hangul-util romanize(pronounce)': (t) => hu.romanize(hu.pronounce(t)),
  aromanize: (t) => aromanize.romanize(t),
  '@romanize/korean (RR)': (t) => rk.romanize(t, rk.RomanizationSystem.REVISED),
  'hangul-romanization': (t) => hr.convert(t),
  'korean-pronunciation → aromanize': (t) => aromanize.romanize(g2p.convert(t)),
};

const rows = [];
for (const [name, fn] of Object.entries(candidates)) {
  if (!fn) continue;
  let lineOk = 0,
    eojeolOk = 0,
    eojeolTotal = 0,
    errors = 0;
  const misses = [];
  const t0 = performance.now();
  for (const f of fixtures) {
    let out;
    try {
      out = norm(String(fn(f.text)));
    } catch {
      errors++;
      out = '';
    }
    const exp = norm(f.expected.romanLine);
    if (out === exp) lineOk++;
    else misses.push(`${f.text} → ${out} (expected ${exp})`);
    const e = exp.split(' '),
      o = out.split(' ');
    eojeolTotal += e.length;
    e.forEach((w, i) => {
      if (o[i] === w) eojeolOk++;
    });
  }
  rows.push({
    name,
    lineOk,
    lines: fixtures.length,
    eojeolOk,
    eojeolTotal,
    errors,
    ms: (performance.now() - t0).toFixed(1),
    misses,
  });
}
for (const r of rows) {
  console.log(
    `${r.name.padEnd(36)} lines ${r.lineOk}/${r.lines}  eojeol ${r.eojeolOk}/${r.eojeolTotal} (${((100 * r.eojeolOk) / r.eojeolTotal).toFixed(1)}%)  errors ${r.errors}  ${r.ms} ms`,
  );
}
if (process.argv.includes('--misses'))
  for (const r of rows) console.log(`\n${r.name} misses:\n  ` + r.misses.slice(0, 12).join('\n  '));
