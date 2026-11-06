/**
 * Common English words that also happen to parse as romanisation ("you" → yo-u, "me" → me, "in" → in).
 * Used to keep English spans as written when converting romanised lyrics (ADR 0016).
 */

/** Almost always English in a romanised lyric, so the original spelling is offered first. */
export const ALWAYS_ENGLISH: ReadonlySet<string> = new Set([
  'i',
  'you',
  'my',
  'we',
  'he',
  'oh',
  'yeah',
  'hey',
  'one',
  'be',
  'baby',
]);

/** Real romanisation too (Japanese "no", "to", "me"); English first only when the line has other English in it. */
export const CONTEXTUAL_ENGLISH: ReadonlySet<string> = new Set([
  'a',
  'an',
  'in',
  'on',
  'no',
  'so',
  'to',
  'me',
  'do',
  'go',
  'hi',
  'ok',
  'is',
  'it',
  'up',
  'man',
  'can',
  'get',
  'let',
  'not',
  'now',
  'may',
  'day',
  'say',
  'she',
  'the',
  'time',
  'more',
  'gone',
  'done',
  'name',
  'game',
  'same',
  'rain',
  'again',
]);

export const isAlwaysEnglish = (word: string): boolean => ALWAYS_ENGLISH.has(word.toLowerCase());
/** Everyday Japanese words that are also English: never demoted to "English first" in Japanese lyrics. */
const REAL_JAPANESE: ReadonlySet<string> = new Set(['no', 'so', 'to', 'me', 'do', 'go', 'hi', 'a']);

export const isContextualEnglish = (word: string, lang: 'ko' | 'ja' = 'ko'): boolean => {
  const w = word.toLowerCase();
  return CONTEXTUAL_ENGLISH.has(w) && !(lang === 'ja' && REAL_JAPANESE.has(w));
};
