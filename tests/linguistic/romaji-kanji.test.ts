/**
 * Kanji options for romanised Japanese (issue #10) against the REAL ja pack. Each case is a common JMdict kanji word
 * whose reading is romanised, converted back to kana, and looked up. Caveats: dictionary forms only (conjugations are
 * not covered), the sample is uniform over common words rather than weighted by lyric frequency, and words that are
 * normally written in kana are not tested for "should not be offered". The kana default is never changed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { PackManifest, PackRow } from '../../src/engine/dict/types';
import { convertLyrics } from '../../src/lyrics/reverse/convert';
import { romajiToKana } from '../../src/lyrics/reverse/japanese';
import { MAX_KANJI, buildKanjiIndex, kanjiFor } from '../../src/lyrics/reverse/kanji';

const root = path.resolve(import.meta.dirname, '..', '..');
const m = JSON.parse(
  readFileSync(path.join(root, 'public/packs/manifest.json'), 'utf8'),
) as PackManifest;
const ja = m.packs.find((p) => p.lang === 'ja')!;
const text = gunzipSync(
  readFileSync(
    path.join(root, 'public/packs', ja.files.find((f) => f.role === 'dictionary')!.path),
  ),
).toString('utf8');
const rows = text
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as PackRow);
const HAN = /[一-鿿々]/u;

// hiragana -> Hepburn ("ou" style long vowels)
const BASE: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  を: 'o',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
};
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
function toRomaji(k: string): string | null {
  const c = [...k];
  let out = '';
  for (let i = 0; i < c.length; i++) {
    const ch = c[i]!;
    if (ch === 'っ') {
      const n = c[i + 1];
      const nb = n && (BASE[n] ?? '');
      if (!nb) return null;
      out += nb.startsWith('ch') ? 't' : nb[0];
      continue;
    }
    if (ch === 'ー') return null;
    const b = BASE[ch];
    if (!b) return null;
    const y = c[i + 1] && YOON[c[i + 1]!];
    if (y) {
      const stem = b.endsWith('i') ? b.slice(0, -1) : b;
      out += b === 'shi' || b === 'chi' || b === 'ji' ? b.slice(0, -1) + y : stem + 'y' + y;
      i++;
    } else out += b;
  }
  return out;
}

/** Seeded sample (no Math.random in tests). */
function sample<T>(items: T[], n: number): T[] {
  let seed = 20261106;
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length)
    out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]!);
  return out;
}

describe('romaji → kanji options (real ja pack)', () => {
  it('measures how often the original kanji is offered, and enforces floors', () => {
    const kanjiRows = rows.filter((r) => HAN.test(r.f));
    const index = buildKanjiIndex(kanjiRows);
    const common = [
      ...new Map(
        kanjiRows.filter((r) => r.q === 1 && [...r.f].length <= 4).map((r) => [r.f, r]),
      ).values(),
    ];
    let n = 0,
      top1 = 0,
      anyOffered = 0,
      offered = 0;
    for (const r of sample(common, 3000)) {
      const rom = toRomaji(r.r);
      const kana = rom && romajiToKana(rom)[0];
      if (!kana) continue;
      n++;
      const options = kanjiFor(kana, index);
      if (options.length) offered++;
      if (options[0] === r.f) top1++;
      if (options.includes(r.f)) anyOffered++;
    }
    const pct = (a: number) => `${((100 * a) / n).toFixed(1)}%`;
    console.log(
      `[kanji] n=${n} offered=${pct(offered)} first=${pct(top1)} in-top-${MAX_KANJI}=${pct(anyOffered)}`,
    );
    expect(n).toBeGreaterThan(2500);
    // Floors sit under the measured values; they are regression guards for common dictionary-form words only
    // (conjugated verbs, names and slang are not covered, and the sample is uniform, not weighted by lyric frequency).
    expect(top1 / n).toBeGreaterThanOrEqual(0.7);
    expect(anyOffered / n).toBeGreaterThanOrEqual(0.9);
  });

  it('adds options without changing the kana default or dropping anything', () => {
    const index = buildKanjiIndex(rows.filter((r) => HAN.test(r.f)));
    const plain = convertLyrics('sora wo mite', 'ja')[0]!.segments;
    const withKanji = convertLyrics('sora wo mite', 'ja', { kanji: index })[0]!.segments;
    for (const [i, seg] of withKanji.entries()) {
      const base = plain[i]!;
      if (seg.type !== 'word' || base.type !== 'word') continue;
      expect(seg.candidates[0]).toBe(base.candidates[0]);
      for (const c of base.candidates) expect(seg.candidates).toContain(c);
    }
    const sora = withKanji.find((s) => s.type === 'word' && s.source === 'sora');
    expect(sora?.type === 'word' && sora.candidates).toContain('空');
  });
});
