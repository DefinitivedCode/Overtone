/**
 * Kanji suggestions for romanised Japanese (issue #10, ADR 0016).
 *
 * Romaji records sound only, so every word has many possible kanji. These are *options* behind the kana default, drawn
 * from ordinary (common) JMdict entries whose reading matches exactly. Nothing is chosen automatically.
 * v1 covers dictionary forms; conjugated verbs and adjectives (歩い, 走っ) stay kana.
 */
import { toHiragana } from '@/engine/ja/kana';

/** The part of a JMdict pack row this needs. */
export interface KanjiRow {
  /** Written form (contains kanji). */
  f: string;
  /** Primary kana reading. */
  r: string;
  /** Other readings of the same form. */
  a?: string[];
  /** 1 = ordinary entry. */
  q: number;
  /** JMdict entry id (older entries first among homophones). */
  e: number;
}

/** Hiragana reading → kanji forms, best first. */
export type KanjiIndex = ReadonlyMap<string, readonly string[]>;

const HAN = /[㐀-鿿]/u;
const HIRAGANA = /^[ぁ-ゖー]+$/u;
/** Kanji options offered per word. */
export const MAX_KANJI = 3;

/** Words that are almost always written in kana in lyrics; a kanji option would only be noise. */
const KANA_WORDS = new Set(
  (
    'ある いる する なる ない こと もの これ それ あれ どれ ここ そこ あそこ どこ だれ なに いつ もう まだ でも だけ ' +
    'から まで より ので のに けど けれど でも そして しかし だから ように ような ために いま ずっと きっと ' +
    'もし たぶん さあ ああ ねえ ほら あなた わたし ぼく おれ きみ'
  ).split(' '),
);

export function buildKanjiIndex(rows: Iterable<KanjiRow>): KanjiIndex {
  const byReading = new Map<string, KanjiRow[]>();
  for (const row of rows) {
    if (row.q !== 1 || !HAN.test(row.f)) continue;
    for (const raw of [row.r, ...(row.a ?? [])]) {
      const reading = toHiragana(raw);
      if (!HIRAGANA.test(reading)) continue;
      const list = byReading.get(reading);
      if (list) list.push(row);
      else byReading.set(reading, [row]);
    }
  }
  const index = new Map<string, string[]>();
  for (const [reading, list] of byReading)
    index.set(reading, [...new Set(list.sort((a, b) => a.e - b.e).map((r) => r.f))]);
  return index;
}

/** Up to `MAX_KANJI` kanji options for a hiragana word; none for one-kana words and everyday kana words. */
export function kanjiFor(kana: string, index: KanjiIndex): string[] {
  if ([...kana].length < 2 || KANA_WORDS.has(kana)) return [];
  return (index.get(kana) ?? []).slice(0, MAX_KANJI);
}
