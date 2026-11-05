/** Render-time projections of analysed tokens (ARCHITECTURE §4.4): romanisation preferences never need re-analysis. */
import { romaniseEojeol } from './ko/romanise';
import type { KoMode } from './ko/romanise';
import type { Token } from './model';

export interface RomanPrefs {
  ko: { mode: KoMode };
}

export const DEFAULT_ROMAN_PREFS: RomanPrefs = { ko: { mode: 'pronunciation' } };

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

/** Joins token romanisations; whitespace tokens are single spaces, punctuation is ASCII-fied. */
export function romaniseLine(
  tokens: readonly Token[],
  prefs: RomanPrefs = DEFAULT_ROMAN_PREFS,
): string {
  let out = '';
  for (const t of tokens) {
    const r = tokenRoman(t, prefs);
    out += r === ' ' && out.endsWith(' ') ? '' : r;
  }
  return out.trim();
}
