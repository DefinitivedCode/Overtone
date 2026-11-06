/**
 * Dictionary ranking of romanised-import candidates (issue #11, ADR 0016) against the REAL Korean pack.
 *
 * What this does and does not show. Each case is a Hangul word that is romanised with the app's own romaniser and
 * converted back. The dictionary-ranked order is compared with the converter's own order.
 *  - "starter": the 73 words of the self-authored starter fixtures (the closest thing to lyric vocabulary here).
 *  - "headwords": a seeded sample of ordinary pack headwords. Uniform over the dictionary, so it is much harder (and
 *    rarer-word-heavy) than lyrics: a pessimistic stand-in for words the dictionary knows.
 *  - "하다 forms": colloquial forms (X해, X합니다) of 하다 verbs, which exercises the lemma heuristics.
 * The dictionary always contains the true word here, so these numbers are for in-vocabulary words; words missing from
 * the dictionary (names, slang) fall back to the converter's order and are not measured. Fixtures are self-authored.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { romaniseEojeol } from '../../src/engine/ko/romanise';
import type { PackManifest, PackRow } from '../../src/engine/dict/types';
import { convertLyrics } from '../../src/lyrics/reverse/convert';
import { RANKING_POOL, romanToHangul } from '../../src/lyrics/reverse/korean';
import { lexiconFromHeadwords, rankByLexicon } from '../../src/lyrics/reverse/rank';

const root = path.resolve(import.meta.dirname, '..', '..');
const manifest = JSON.parse(
  readFileSync(path.join(root, 'public/packs/manifest.json'), 'utf8'),
) as PackManifest;
const pack = manifest.packs.find((p) => p.lang === 'ko')!;
const rows = gunzipSync(readFileSync(path.join(root, 'public/packs', pack.files[0]!.path)))
  .toString('utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as PackRow);

const headwords = new Map<string, PackRow[]>();
for (const r of rows) (headwords.get(r.f) ?? headwords.set(r.f, []).get(r.f)!).push(r);
const lexicon = lexiconFromHeadwords(headwords);

/** Deterministic pseudo-random sampling (no Math.random in tests). */
function sample<T>(items: T[], n: number): T[] {
  let seed = 20261106;
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length)
    out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]!);
  return out;
}

interface Score {
  n: number;
  anyBase: number;
  top1Base: number;
  top1Ranked: number;
}
function measure(words: string[]): Score {
  const s: Score = { n: 0, anyBase: 0, top1Base: 0, top1Ranked: 0 };
  for (const truth of words) {
    const roman = romaniseEojeol(truth);
    if (!/^[a-z]+$/.test(roman)) continue;
    const base = romanToHangul(roman, RANKING_POOL);
    if (base.length === 0) continue;
    s.n++;
    if (base.includes(truth)) s.anyBase++;
    if (base[0] === truth) s.top1Base++;
    if (rankByLexicon(base, lexicon)[0] === truth) s.top1Ranked++;
  }
  return s;
}
const pct = (a: number, n: number) => `${((100 * a) / n).toFixed(1)}%`;
const report = (name: string, s: Score) =>
  console.log(
    `[ranking] ${name}: n=${s.n} any=${pct(s.anyBase, s.n)} top1 base=${pct(s.top1Base, s.n)} ranked=${pct(s.top1Ranked, s.n)}`,
  );

const starter = (
  JSON.parse(
    readFileSync(path.join(root, 'fixtures/linguistic/ko/starter.json'), 'utf8'),
  ) as Array<{ text: string }>
).flatMap(({ text }) => text.split(/\s+/).filter((w) => /^[가-힣]+$/.test(w)));

const common = [...headwords.entries()]
  .filter(([f, r]) => /^[가-힣]{2,4}$/.test(f) && !f.endsWith('다') && r.some((x) => x.q === 1))
  .map(([f]) => f);
const hada = [...headwords.keys()]
  .filter((f) => /^[가-힣]{2,3}하다$/.test(f))
  .flatMap((f) => [`${f.slice(0, -2)}해`, `${f.slice(0, -2)}합니다`]);

describe('dictionary ranking of romanised-import candidates (real ko pack)', () => {
  const results = {
    starter: measure(starter),
    headwords: measure(sample(common, 3000)),
    hada: measure(sample(hada, 1500)),
  };
  it('reports measurements and enforces floors', () => {
    report('starter', results.starter);
    report('headwords', results.headwords);
    report('하다 forms', results.hada);
    const rate = (s: Score) => s.top1Ranked / s.n;
    const base = (s: Score) => s.top1Base / s.n;
    expect(results.starter.n).toBeGreaterThan(40);
    // Floors sit a little under the measured values (starter 60 %, headwords 93 %, 하다 forms 85 %); they are
    // regression guards for in-vocabulary words, not promises about arbitrary lyrics.
    expect(rate(results.starter)).toBeGreaterThanOrEqual(0.55);
    expect(rate(results.headwords)).toBeGreaterThanOrEqual(0.88);
    expect(rate(results.hada)).toBeGreaterThanOrEqual(0.8);
    // Ranking must be a real improvement over the converter's own order, not noise.
    expect(rate(results.starter)).toBeGreaterThan(base(results.starter) + 0.2);
    expect(rate(results.hada)).toBeGreaterThan(base(results.hada) + 0.3);
    // And it can never be better than "the true spelling is among the candidates".
    for (const s of Object.values(results)) expect(s.top1Ranked).toBeLessThanOrEqual(s.anyBase);
  });
  it('never hides a candidate: ranking only reorders', () => {
    const lines = convertLyrics('saranghae neoreul meogeo', 'ko', { lexicon });
    const plain = convertLyrics('saranghae neoreul meogeo', 'ko');
    for (const [i, l] of lines.entries())
      for (const [j, seg] of l.segments.entries()) {
        const other = plain[i]!.segments[j]!;
        if (seg.type === 'word' && other.type === 'word')
          expect([...seg.candidates].sort()).toEqual([...other.candidates].sort());
      }
  });
});
