/** Render-time projections of analysed tokens (ARCHITECTURE §4.4): romanisation preferences never need re-analysis. */
import { romaniseEojeol, romaniseEojeolSyllables } from './ko/romanise';
import type { KoMode } from './ko/romanise';
import type { Token } from './model';
import { zhDisplay } from './zh/pinyin';
import type { ZhPrefs } from './zh/pinyin';
import { hepburn, particleKana } from './ja/hepburn';
import type { LongVowels } from './ja/hepburn';

export interface RomanPrefs {
  ko: { mode: KoMode };
  zh: ZhPrefs;
  ja: { longVowels: LongVowels; showRomajiLine: boolean; furiganaForKanaWords: boolean };
}

export const DEFAULT_ROMAN_PREFS: RomanPrefs = {
  ko: { mode: 'pronunciation' },
  zh: { tones: 'marks', sandhi: false },
  ja: { longVowels: 'macron', showRomajiLine: true, furiganaForKanaWords: false },
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

/** Joins the pieces of a syllable-separated Korean word. */
export const SYLLABLE_SEPARATOR = '-';

/** Display options that are not romanisation preferences (Karaoke only). */
export interface RomanOptions {
  /** Korean: separate romanised syllables, e.g. sa-rang-hae. Mandarin and Cantonese are always per syllable. */
  syllables?: boolean;
}

/** Romanisation of one token under the user's preferences; falls back to the original text (never blank, J5.4). */
export function tokenRoman(
  t: Token,
  prefs: RomanPrefs = DEFAULT_ROMAN_PREFS,
  opts: RomanOptions = {},
): string {
  if (t.kind === 'space') return ' ';
  if (t.kind === 'punct') return toAscii(t.surface);
  if (t.userRoman !== undefined && t.kind === 'word') return t.userRoman;
  if (t.kind === 'word' && t.lang === 'ko' && t.roman !== null)
    return opts.syllables
      ? romaniseEojeolSyllables(t.surface, prefs.ko.mode).join(SYLLABLE_SEPARATOR)
      : romaniseEojeol(t.surface, prefs.ko.mode);
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
  opts: RomanOptions = {},
): string {
  if (tokens.some((token) => token.lang === 'ja' && token.reading !== null))
    return japaneseRomanRuns(tokens, prefs, opts)
      .map((run) => run.text)
      .join('')
      .trim();
  const units = tokenUnits(tokens, prefs);
  let out = '';
  let prevUnits = false;
  tokens.forEach((t, i) => {
    const u = units[i];
    const annotated = !!u && t.ruby.length > 0;
    const r = annotated ? u.join(' ') : tokenRoman(t, prefs, opts);
    // Chinese words follow each other without spaces in the text; keep their syllables apart.
    if (annotated && prevUnits && !out.endsWith(' ')) out += ' ';
    out += r === ' ' && out.endsWith(' ') ? '' : r;
    prevUnits = annotated;
  });
  return out.trim();
}

/** Japanese reading groups keep conjugation boundaries inside Hepburn, e.g. しまっ + た. */
export function japaneseRomanRuns(
  tokens: readonly Token[],
  prefs: RomanPrefs,
  opts: RomanOptions = {},
) {
  const runs: { text: string; lang?: string }[] = [];
  let prior: Token | undefined;
  const word = (token: Token) => !['space', 'punct', 'symbol'].includes(token.kind);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const isJapanese = token.lang === 'ja';
    if (
      prior &&
      word(token) &&
      ((word(prior) && (isJapanese || prior.lang === 'ja')) ||
        (prior.kind === 'punct' && /[,.;:!?]$/u.test(toAscii(prior.surface))))
    )
      runs.push({ text: ' ' });
    if (isJapanese && token.reading !== null && token.userRoman === undefined) {
      const group = [token];
      while (
        tokens[i + 1]?.lang === 'ja' &&
        tokens[i + 1]?.attachToPrev &&
        tokens[i + 1]?.reading !== null
      ) {
        group.push(tokens[++i]!);
      }
      const parts = group.map((t) => particleKana(t.surface, t.pos) ?? t.reading!);
      const pronounced = group.some((t) => t.pronunciation)
        ? group.map((t, j) => t.pronunciation ?? parts[j]).join('')
        : undefined;
      const roman = hepburn(parts.join(''), pronounced, prefs.ja.longVowels);
      runs.push(
        roman
          ? { text: roman, lang: 'ja-Latn' }
          : { text: group.map((t) => t.surface).join(''), lang: 'ja' },
      );
    } else {
      runs.push({
        text: tokenRoman(token, prefs, opts),
        lang: token.lang === 'en' ? 'en' : isJapanese ? 'ja' : undefined,
      });
    }
    prior = token;
  }
  return runs;
}
