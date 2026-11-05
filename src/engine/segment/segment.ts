/** Script-run segmentation and language routing (LANGUAGE_ENGINE §4.1–4.2). Pure; iterates code points. */
import type { LangCode, TokenKind, TokenLang } from '../model';

export type ScriptClass =
  'hangul' | 'kana' | 'han' | 'latin' | 'number' | 'space' | 'punct' | 'symbol';

// Named (not literal) so the invisible characters stay visible in source.
const ZWJ = String.fromCharCode(0x200d);
const VS16 = String.fromCharCode(0xfe0f);

const HANGUL = /\p{Script=Hangul}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}ーゝゞヽヾ]/u;
const HAN = /[\p{Script=Han}々〆〇]/u; // 々 〆 〇 are Script=Common but belong with Han
const LATIN = /\p{Script=Latin}/u;
const DIGIT = /\p{Nd}/u;
const SPACE = /\s/u;
const PUNCT = /\p{P}/u;

export function classifyChar(ch: string): ScriptClass {
  if (SPACE.test(ch)) return 'space';
  if (HANGUL.test(ch)) return 'hangul';
  if (KANA.test(ch)) return 'kana';
  if (HAN.test(ch)) return 'han';
  if (LATIN.test(ch)) return 'latin';
  if (DIGIT.test(ch)) return 'number';
  if (PUNCT.test(ch)) return 'punct';
  return 'symbol'; // emoji, symbols, joiners, variation selectors
}

export interface Run {
  /** UTF-16 offsets. */
  start: number;
  end: number;
  text: string;
  cls: ScriptClass;
}

/**
 * Splits text into maximal runs of one script class. Apostrophes/hyphens between Latin letters and
 * ZWJ/variation selectors inside emoji sequences stay in their surrounding run.
 */
export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  const chars = Array.from(text);
  let offset = 0;
  let current: Run | null = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    let cls = classifyChar(ch);
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (
      cls === 'punct' &&
      (ch === "'" || ch === '’' || ch === '-') &&
      prev &&
      next &&
      classifyChar(prev) === 'latin' &&
      classifyChar(next) === 'latin'
    )
      cls = 'latin';
    if ((ch === ZWJ || ch === VS16) && current && current.cls === 'symbol') cls = 'symbol';
    if (current && current.cls === cls && cls !== 'punct') {
      current.text += ch;
      current.end += ch.length;
    } else if (current && current.cls === 'punct' && cls === 'punct') {
      current.text += ch;
      current.end += ch.length;
    } else {
      current = { start: offset, end: offset + ch.length, text: ch, cls };
      runs.push(current);
    }
    offset += ch.length;
  }
  return runs;
}

/**
 * A Han run adjacent to a kana run belongs to the same Japanese segment (LANGUAGE_ENGINE §4.2), e.g.
 * 君が好き or 三ヶ月. Han runs with no adjacent kana keep the song's language. Returns new runs.
 */
export function mergeJapanese(runs: Run[]): Run[] {
  const out: Run[] = [];
  let i = 0;
  while (i < runs.length) {
    const r = runs[i]!;
    if (r.cls !== 'han' && r.cls !== 'kana') {
      out.push(r);
      i++;
      continue;
    }
    let j = i;
    let hasKana = false;
    while (j < runs.length && (runs[j]!.cls === 'han' || runs[j]!.cls === 'kana')) {
      if (runs[j]!.cls === 'kana') hasKana = true;
      j++;
    }
    const group = runs.slice(i, j);
    if (hasKana && group.length > 1) {
      out.push({
        start: group[0]!.start,
        end: group[group.length - 1]!.end,
        text: group.map((g) => g.text).join(''),
        cls: 'kana',
      });
    } else out.push(...group);
    i = j;
  }
  return out;
}

export interface Routed {
  kind: TokenKind;
  lang: TokenLang;
  /** Why the run cannot be annotated yet, if so. */
  note?: string;
}

/** Routes a run to a language (LANGUAGE_ENGINE §4.2). `songLang` decides how Han text is read. */
export function routeRun(cls: ScriptClass, songLang: LangCode): Routed {
  switch (cls) {
    case 'hangul':
      return { kind: 'word', lang: 'ko' };
    case 'kana':
      return { kind: 'word', lang: 'ja' };
    case 'han':
      // Han in a Korean song is Hanja: shown without a reading in v0.1 (documented limitation).
      return songLang === 'ko'
        ? { kind: 'word', lang: 'other', note: 'hanja' }
        : { kind: 'word', lang: songLang };
    case 'latin':
      return { kind: 'latin', lang: 'en' };
    case 'number':
      return { kind: 'number', lang: 'other' };
    case 'space':
      return { kind: 'space', lang: 'other' };
    case 'punct':
      return { kind: 'punct', lang: 'other' };
    case 'symbol':
      return { kind: 'symbol', lang: 'other' };
  }
}
