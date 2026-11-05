import type { PackRow } from '../../src/engine/dict/types';

interface Form {
  text: string;
  common: boolean;
}
interface Kana extends Form {
  appliesToKanji: string[];
}
interface Sense {
  appliesToKanji: string[];
  appliesToKana: string[];
  partOfSpeech: string[];
  gloss: { text: string }[];
}
interface Word {
  id: string;
  kanji: Form[];
  kana: Kana[];
  sense: Sense[];
}

const applies = (list: string[], form: string) => list.includes('*') || list.includes(form);

/** One row per written form, with kana restrictions and enough sense data for later lookup. */
export function parseJMdict(text: string): PackRow[] {
  const { words } = JSON.parse(text) as { words: Word[] };
  const rows: PackRow[] = [];
  for (const { id, kanji, kana, sense } of words) {
    const glosses = (filter: (s: Sense) => boolean) =>
      sense
        .filter(filter)
        .slice(0, 3)
        .map((s) => ({
          p: s.partOfSpeech[0],
          g: s.gloss
            .slice(0, 2)
            .map(({ text }) => text.trim().slice(0, 72))
            .filter(Boolean),
        }));
    const e = Number(id);
    for (const form of kanji) {
      const readings = kana.filter((k) => applies(k.appliesToKanji, form.text));
      const [r, ...a] = [
        ...new Set(readings.sort((x, y) => Number(y.common) - Number(x.common)).map((k) => k.text)),
      ];
      if (r)
        rows.push({
          f: form.text,
          e,
          r,
          a: a.length ? a : undefined,
          q: Number(form.common),
          s: glosses(
            (s) =>
              applies(s.appliesToKanji, form.text) &&
              readings.some((k) => applies(s.appliesToKana, k.text)),
          ),
        });
    }
    for (const form of kana)
      rows.push({
        f: form.text,
        e,
        r: form.text,
        q: Number(form.common),
        s: glosses((s) => applies(s.appliesToKana, form.text)),
      });
  }
  return rows;
}
