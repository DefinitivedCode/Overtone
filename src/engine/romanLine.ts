/** Render-time projections of analysed tokens (ARCHITECTURE §4.4): romanisation preferences never need re-analysis. */
import { romaniseEojeol } from './ko/romanise';
import type { KoMode } from './ko/romanise';
import type { Token } from './model';
import { zhDisplay } from './zh/pinyin';
import type { ZhPrefs } from './zh/pinyin';

export interface RomanPrefs {
  ko: { mode: KoMode };
  zh: ZhPrefs;
}

export const DEFAULT_ROMAN_PREFS: RomanPrefs = {
  ko: { mode: 'pronunciation' },
  zh: { tones: 'marks', sandhi: false },
};

const ASCII_PUNCT: Readonly<Record<string, string>> = {
  '、': ',',
  '，': ',',
  '。': '.',
  '．': '.',
  '！': '!',
  '？': '?',
  '～': '~',
  '：': ':',
  '；': ';',
  '（': '(',
  '）': ')',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '…': '...',
  '・': ' ',
  '　': ' ',
};

const toAscii = (s: string) => Array.from(s, (c) => ASCII_PUNCT[c] ?? c).join('');

/** Romanisation of one token under the user's preferences; falls back to the original text (never blank, J5.4). */
export function tokenRoman(t: Token, prefs: RomanPrefs = DEFAULT_ROMAN_PREFS): string {
  if (t.kind === 'space') return ' ';
  if (t.kind === 'punct') return toAscii(t.surface);
  if (t.kind === 'word' && t.lang === 'ko' && t.roman !== null)
    return romaniseEojeol(t.surface, prefs.ko.mode);
  return t.roman ?? t.surface;
}

/**
 * Per-unit display syllables for Mandarin/Cantonese tokens (tone style and sandhi applied across the line);
 * null for tokens that are not annotated per character.
 */
export function tokenUnits(
  tokens: readonly Token[],
  prefs: RomanPrefs = DEFAULT_ROMAN_PREFS,
): (string[] | null)[] {
  const zh = tokens.some((t) => t.lang === 'zh' && t.kind === 'word')
    ? zhDisplay(tokens, prefs.zh)
    : null;
  return tokens.map((t, i) => {
    if (t.kind !== 'word') return null;
    if (t.lang === 'zh') return zh?.[i] ?? null;
    if (t.lang === 'yue') return t.ruby.map((u) => u.reading ?? u.base);
    return null;
  });
}

/** Joins token romanisations; whitespace tokens are single spaces, punctuation is ASCII-fied. */
export function romaniseLine(
  tokens: readonly Token[],
  prefs: RomanPrefs = DEFAULT_ROMAN_PREFS,
): string {
  const units = tokenUnits(tokens, prefs);
  let out = '';
  let prevUnits = false;
  tokens.forEach((t, i) => {
    const u = units[i];
    const annotated = !!u && t.ruby.length > 0;
    const r = annotated ? u.join(' ') : tokenRoman(t, prefs);
    // Chinese words follow each other without spaces in the text; keep their syllables apart.
    if (annotated && prevUnits && !out.endsWith(' ')) out += ' ';
    out += r === ' ' && out.endsWith(' ') ? '' : r;
    prevUnits = annotated;
  });
  return out.trim();
}
