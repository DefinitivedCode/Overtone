import type { PackRow } from '../../src/engine/dict/types';

const HANGUL = /[가-힣]/u;
const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s).trim();

interface KaikkiSense {
  glosses?: string[];
  tags?: string[];
}
interface KaikkiEntry {
  word: string;
  pos: string;
  senses?: KaikkiSense[];
}

/** Wiktionary (via kaikki.org JSON Lines): Hangul headwords, skipping inflection/alternative-form senses. */
export function parseWiktionaryKo(text: string): PackRow[] {
  const byWord = new Map<string, PackRow>();
  let e = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const entry = JSON.parse(line) as KaikkiEntry;
    if (['character', 'romanization', 'syllable', 'punct', 'symbol'].includes(entry.pos)) continue;
    if (!HANGUL.test(entry.word) || /\s/u.test(entry.word)) continue;
    const senses = (entry.senses ?? [])
      .filter((s) => !s.tags?.some((t) => t === 'form-of' || t === 'alt-of' || t === 'no-gloss'))
      .map((s) => s.glosses?.at(-1))
      .filter((g): g is string => !!g && !/^(hanja form of|romanization of)/iu.test(g))
      .slice(0, 3)
      .map((g) => ({ g: [clip(g)], p: entry.pos }));
    if (!senses.length) continue;
    const row = byWord.get(entry.word);
    if (row) row.s = [...row.s, ...senses].slice(0, 5);
    else
      byWord.set(entry.word, {
        f: entry.word,
        e: ++e,
        r: '',
        s: senses,
        q: entry.pos === 'name' ? 0 : 1,
        x: 'w',
      });
  }
  return [...byWord.values()];
}

/** kengdic TSV: `id surface hanja gloss level created source`. Ids start after Wiktionary's so they rank second. */
export function parseKengdic(text: string, firstId = 1_000_000): PackRow[] {
  const byWord = new Map<string, PackRow>();
  let e = firstId;
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const surface = cols[1]?.trim();
    const gloss = cols[3]?.trim();
    if (!surface || !gloss || !HANGUL.test(surface) || /\s/u.test(surface)) continue;
    const glosses = gloss
      .split(/\s*;\s*/u)
      .map((g) => clip(g))
      .filter(Boolean)
      .slice(0, 3);
    if (!glosses.length) continue;
    const row = byWord.get(surface);
    if (row) {
      if (row.s.length < 4) row.s.push({ g: glosses.slice(0, 2) });
    } else byWord.set(surface, { f: surface, e: ++e, r: '', s: [{ g: glosses }], q: 1, x: 'k' });
  }
  return [...byWord.values()];
}
