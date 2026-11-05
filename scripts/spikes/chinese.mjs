// M4 spikes (ADR 0004, 0005): pinyin-pro, opencc-js and to-jyutping behaviour probes.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const base = path.join(root, '.cache', 'spikes');
const req = createRequire(path.join(base, 'package.json'));
const imp = async (n) => import(pathToFileURL(req.resolve(n)).href);
const gz = (f) =>
  `${(statSync(f).size / 1024).toFixed(0)} KB raw, ${(gzipSync(readFileSync(f)).length / 1024).toFixed(0)} KB gzip`;

const ppNs = await imp('pinyin-pro');
const { pinyin, polyphonic } = ppNs.pinyin ? ppNs : ppNs.default;
const check = (name, got, want) => ({ name, ok: got === want, got, want });

// ---- Mandarin ----
const py = (t, o = {}) => pinyin(t, { toneType: 'symbol', type: 'array', ...o }).join(' ');
const zhCases = JSON.parse(
  readFileSync(path.join(root, 'fixtures/linguistic/zh/starter.json'), 'utf8'),
).map((f) => [f.text, f.expected.reading]);
const zhRaw = zhCases.map(([t, w]) => check(t, py(t, { toneSandhi: false }), w));
console.log(
  `pinyin-pro (toneSandhi:false) exact: ${zhRaw.filter((r) => r.ok).length}/${zhRaw.length}`,
);
for (const r of zhRaw.filter((x) => !x.ok))
  console.log(`  MISS ${r.name}: got "${r.got}" want "${r.want}"`);

console.log('\ntone sandhi option (一/不):');
for (const t of ['一个', '不是', '一天', '第一', '不对']) {
  console.log(
    `  ${t}: default="${py(t)}"  toneSandhi:false="${py(t, { toneSandhi: false })}"  toneSandhi:true="${py(t, { toneSandhi: true })}"`,
  );
}
console.log('\nneutral tone / erhua / mixed:');
for (const t of ['一点儿', '哪儿', 'I love 你', '你好, world!', '妈妈'])
  console.log(
    `  ${t}: "${py(t, { toneSandhi: false })}"  num="${pinyin(t, { toneType: 'num', type: 'array', toneSandhi: false }).join(' ')}"`,
  );
console.log(
  '  nonZh handling →',
  JSON.stringify(
    pinyin('I love 你', { type: 'all', toneSandhi: false })
      .slice(0, 4)
      .map((x) => x.origin + ':' + x.pinyin),
  ),
);
console.log('  polyphonic("行") →', polyphonic('行'));

// opencc-js length preservation
const OpenCC = await imp('opencc-js');
const OC = OpenCC.default ?? OpenCC;
const conv = OC.Converter({ from: 'hk', to: 'cn' });
const trad = [
  '我愛你',
  '對不起',
  '銀行裡面',
  '頭髮很長',
  '軟體工程師',
  '滑鼠游標',
  '著名的歌曲',
  '後面的人',
  '發現了秘密',
  '聽見風聲',
  '網路世界',
  '計程車司機',
  '資訊與傳播',
  '週末的演唱會',
  '麵包和餅乾',
  '乾杯吧朋友',
];
const mism = trad.filter((t) => [...conv(t)].length !== [...t].length);
console.log(`\nopencc-js hk→cn length preserved: ${trad.length - mism.length}/${trad.length}`);
for (const t of mism) console.log(`  length changed: ${t} → ${conv(t)}`);
console.log(
  '  sample:',
  trad
    .slice(0, 5)
    .map((t) => conv(t))
    .join(' | '),
);

// sizes
const pp = path.join(base, 'node_modules', 'pinyin-pro');
console.log('\nsizes:');
console.log('  pinyin-pro dist/index.js :', gz(path.join(pp, 'dist/index.js')));
const occ = path.join(base, 'node_modules', 'opencc-js');
for (const f of [
  'dist/umd/full.js',
  'dist/umd/cn2t.js',
  'dist/umd/t2cn.js',
  'dist/umd/hk2cn.js',
  'dist/umd/cn.js',
]) {
  try {
    console.log(`  opencc-js ${f}:`, gz(path.join(occ, f)));
  } catch {
    /* file not present in this build */
  }
}

// ---- Cantonese ----
const tjNs = await imp('to-jyutping');
const TJ = tjNs.getJyutpingList ? tjNs : (tjNs.default ?? tjNs);
const list = (t) =>
  TJ.getJyutpingList(t)
    .map(([, j]) => j ?? '?')
    .join(' ');
const yueCases = JSON.parse(
  readFileSync(path.join(root, 'fixtures/linguistic/yue/starter.json'), 'utf8'),
).map((f) => [f.text, f.expected.reading]);
const yue = yueCases.map(([t, w]) => check(t, list(t), w));
console.log(`\nto-jyutping exact: ${yue.filter((r) => r.ok).length}/${yue.length}`);
for (const r of yue.filter((x) => !x.ok))
  console.log(`  MISS ${r.name}: got "${r.got}" want "${r.want}"`);
console.log('  Simplified input 我哋喺度/学校:', list('学校'), '|', list('我们'));
const tj = path.join(base, 'node_modules', 'to-jyutping');
const tjPkg = JSON.parse(readFileSync(path.join(tj, 'package.json'), 'utf8'));
console.log(
  '  to-jyutping version',
  tjPkg.version,
  'main',
  tjPkg.main,
  'module',
  tjPkg.module,
  'exports',
  JSON.stringify(tjPkg.exports ?? null).slice(0, 120),
);
for (const f of ['dist/index.mjs', 'dist/index.cjs']) {
  try {
    console.log(`  to-jyutping ${f}:`, gz(path.join(tj, f)));
  } catch {
    /* file not present in this build */
  }
}
