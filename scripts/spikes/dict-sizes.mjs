// M4 spike (ADR 0006): trimmed pack-size estimates and Korean coverage, from the official source files in .cache/dicts.
// Row format follows LANGUAGE_ENGINE §9: {"f":form,"e":id,"r":reading,"s":[{"p":pos,"g":[glosses]}],"q":freq}; ≤5 senses, ≤3 glosses, glosses ≤80 chars.
import { readFileSync, createReadStream, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', '..', '.cache', 'dicts');
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const trimG = (gs) => gs.slice(0, 3).map((g) => g.slice(0, 80));
const pack = (rows) => {
  const t = rows.map((r) => JSON.stringify(r)).join('\n');
  return { rows: rows.length, raw: Buffer.byteLength(t), gz: gzipSync(t, { level: 9 }).length };
};
const report = (name, p) =>
  console.log(
    `${name.padEnd(34)} rows ${String(p.rows).padStart(7)}  raw ${mb(p.raw).padStart(10)}  gzip ${mb(p.gz).padStart(10)}`,
  );

// CC-CEDICT
{
  const rows = [];
  for (const line of readFileSync(path.join(dir, 'x-cedict/cedict_ts.u8'), 'utf8').split(/\r?\n/)) {
    const m = /^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/\s*$/.exec(line);
    if (!m) continue;
    const [, trad, simp, py, defs] = m;
    const s = [{ g: trimG(defs.split('/')) }];
    rows.push({ f: trad, r: py, s });
    if (simp !== trad) rows.push({ f: simp, r: py, s });
  }
  report('zh: CC-CEDICT (trad+simp rows)', pack(rows));
}
// CC-Canto + readings
{
  const rows = [];
  for (const file of ['x-cccanto/cccanto-webdist.txt']) {
    for (const line of readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      const m = /^(\S+) (\S+) \[([^\]]+)\] \{([^}]+)\} \/(.+)\/$/.exec(line);
      if (!m) continue;
      rows.push({ f: m[1], r: m[4], s: [{ g: trimG(m[5].split('/')) }] });
    }
  }
  const canto = pack(rows);
  const readings = [];
  for (const line of readFileSync(
    path.join(dir, 'x-cccedict-canto-readings/cccedict-canto-readings-150923.txt'),
    'utf8',
  ).split('\n')) {
    const m = /^(\S+) (\S+) \[([^\]]+)\] \{([^}]+)\}/.exec(line);
    if (m) readings.push({ f: m[1], r: m[4] });
  }
  report('yue: CC-Canto', canto);
  report('yue: CEDICT Cantonese readings', pack(readings));
}
// JMdict
{
  const j = JSON.parse(readFileSync(path.join(dir, 'x-jmdict-eng/jmdict-eng-3.6.2.json'), 'utf8'));
  const rows = [];
  let withCommon = 0;
  for (const w of j.words) {
    const s = w.sense
      .slice(0, 5)
      .map((x) => ({ p: x.partOfSpeech?.[0], g: trimG(x.gloss.map((g) => g.text)) }));
    const kana = w.kana[0]?.text;
    const common = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);
    if (common) withCommon++;
    for (const k of w.kanji) rows.push({ f: k.text, e: w.id, r: kana, s, q: k.common ? 1 : 0 });
    for (const k of w.kana) rows.push({ f: k.text, e: w.id, r: k.text, s, q: k.common ? 1 : 0 });
  }
  console.log(`JMdict entries ${j.words.length}, common ${withCommon}`);
  report('ja: JMdict eng (all forms)', pack(rows));
  report('ja: JMdict eng (common entries only)', pack(rows.filter((r) => r.q === 1)));
}
// Korean: kengdic and Wiktionary (kaikki)
const lemmas =
  '사랑하다 보다 싶다 괜찮다 좋다 가다 먹다 앉다 많다 없다 꽃 피다 밖 읽다 닭 국물 학교 한국어 이별 하늘 구름 바다 바람 눈물 나 사랑 밤 꿈 웃다 돌아오다 기다리다 행복하다 축하하다 놓다 어떻게 입 앞 부엌 값 넓다 맑다 삶 흙 낮 옷 막내 독립 정리 설날 별 영원히 노래하다 알다 같다 오늘 주다 분다 불다 분 이'.split(
    ' ',
  );
{
  const heads = new Set();
  const rows = [];
  for (const line of readFileSync(path.join(dir, 'kengdic.tsv'), 'utf8').split('\n').slice(1)) {
    const c = line.split('\t');
    if (c.length < 4 || !c[1]) continue;
    heads.add(c[1].trim());
    rows.push({
      f: c[1].trim(),
      s: [
        {
          g: trimG(
            c[3]
              .split(/[;,]/)
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        },
      ],
    });
  }
  report('ko: kengdic', pack(rows));
  console.log(
    `  kengdic lemma coverage: ${lemmas.filter((l) => heads.has(l)).length}/${lemmas.length}  missing: ${lemmas.filter((l) => !heads.has(l)).join(' ')}`,
  );
}
const kk = path.join(dir, 'kaikki-ko.jsonl');
if (existsSync(kk)) {
  const heads = new Set();
  const rows = [];
  const rl = createInterface({ input: createReadStream(kk, 'utf8') });
  let n = 0;
  for await (const line of rl) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.lang_code !== 'ko') continue;
    n++;
    heads.add(o.word);
    const s = (o.senses ?? [])
      .slice(0, 5)
      .map((x) => ({ p: o.pos, g: trimG(x.glosses ?? []) }))
      .filter((x) => x.g.length);
    if (s.length) rows.push({ f: o.word, s });
  }
  console.log(`Wiktionary-KO entries read: ${n}`);
  report('ko: Wiktionary (kaikki, trimmed)', pack(rows));
  console.log(
    `  Wiktionary lemma coverage: ${lemmas.filter((l) => heads.has(l)).length}/${lemmas.length}  missing: ${lemmas.filter((l) => !heads.has(l)).join(' ')}`,
  );
} else console.log('kaikki-ko.jsonl not present (download incomplete)');
