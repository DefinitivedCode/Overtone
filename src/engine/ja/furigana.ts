import type { RubyUnit } from '../model';
import { hasKanji, toHiragana } from './kana';

export interface Furigana {
  units: RubyUnit[];
  uncertain: boolean;
}

/** Align whole kanji runs to intervening literal kana. Jukujikun stay as one unit. */
export function alignFurigana(surface: string, reading: string): Furigana {
  if (!hasKanji(surface)) return { units: [], uncertain: false };
  const groups = surface.match(/[\p{Script=Han}々〆ヶ]+|[^\p{Script=Han}々〆ヶ]+/gu) ?? [];
  const kana = toHiragana(reading);
  if (groups.length === 1) return { units: [{ base: surface, reading: kana }], uncertain: false };
  const matches: RubyUnit[][] = [];
  const path: RubyUnit[] = [];
  let attempts = 0;
  function visit(i: number, start: number, preferLong: boolean) {
    if (++attempts > 1_000 || matches.length > 1) return;
    const base = groups[i];
    if (!base) {
      if (start === kana.length) matches.push([...path]);
      return;
    }
    if (!hasKanji(base)) {
      const literal = toHiragana(base);
      if (!kana.startsWith(literal, start)) return;
      path.push({ base, reading: null });
      visit(i + 1, start + literal.length, preferLong);
      path.pop();
      return;
    }
    const min = preferLong ? [...base].length : 1;
    const endAt = groups[i + 1] === undefined ? kana.length : start + min;
    for (let end = endAt; end <= kana.length && matches.length < 2 && attempts <= 1_000; end++) {
      if (end - start < min) continue;
      path.push({ base, reading: kana.slice(start, end) });
      visit(i + 1, end, preferLong);
      path.pop();
    }
  }
  visit(0, 0, true);
  if (!matches.length) visit(0, 0, false);
  return matches[0]
    ? { units: matches[0], uncertain: matches.length > 1 || attempts > 1_000 }
    : { units: [{ base: surface, reading: kana }], uncertain: true };
}
