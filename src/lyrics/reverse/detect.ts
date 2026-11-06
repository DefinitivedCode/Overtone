/**
 * Detects pasted lyrics that look like romanised Korean or Japanese (ADR 0016). Heuristic by design: the user always
 * confirms or corrects the language, and a null language still reports `romanised` so the choice can be offered.
 */
import { detectKind } from '../parse';
import { isAlwaysEnglish, isContextualEnglish } from './english';
import { isLatinWord, tokenise, type ReverseLang } from './convert';
import { romanToHangul, normaliseRoman, KOREAN_MARKER } from './korean';
import { romajiToKana, JAPANESE_MARKER } from './japanese';

export interface RomanisedDetection {
  romanised: boolean;
  /** Best guess; null when both fit equally well and the user must choose. */
  language: ReverseLang | null;
  confidence: 'high' | 'medium' | 'low';
}

const NO: RomanisedDetection = { romanised: false, language: null, confidence: 'low' };
const SAMPLE_WORDS = 80;
const MIN_WORDS = 3;
const MIN_PARSE_RATE = 0.75;

const LETTER = /\p{L}/u;
const LATIN = /\p{Script=Latin}/u;

/** Share of letters that are Latin, over lyric lines only (0 when there are none). */
export function latinShare(text: string): number {
  let latin = 0;
  let total = 0;
  for (const line of text.split('\n')) {
    if (detectKind(line) !== 'lyric') continue;
    for (const ch of line) {
      if (!LETTER.test(ch)) continue;
      total++;
      if (LATIN.test(ch)) latin++;
    }
  }
  return total === 0 ? 0 : latin / total;
}

export function detectRomanised(text: string): RomanisedDetection {
  if (latinShare(text) < 0.9) return NO;
  const seen = new Set<string>();
  const words: string[] = [];
  for (const line of text.split('\n')) {
    if (detectKind(line) !== 'lyric') continue;
    for (const token of tokenise(line)) {
      if (!isLatinWord(token)) continue;
      const key = normaliseRoman(token);
      // Words that are probably English prove nothing either way.
      if (key === '' || isAlwaysEnglish(key) || isContextualEnglish(key) || seen.has(key)) continue;
      seen.add(key);
      words.push(key);
      if (words.length >= SAMPLE_WORDS) break;
    }
    if (words.length >= SAMPLE_WORDS) break;
  }
  if (words.length < MIN_WORDS) return NO;

  const rate = (convert: (w: string) => string[]) =>
    words.filter((w) => convert(w).length > 0).length / words.length;
  const koRate = rate(romanToHangul);
  const jaRate = rate(romajiToKana);
  const koOk = koRate >= MIN_PARSE_RATE;
  const jaOk = jaRate >= MIN_PARSE_RATE;
  if (!koOk && !jaOk) return NO;
  if (koOk && !jaOk) return { romanised: true, language: 'ko', confidence: 'high' };
  if (jaOk && !koOk) return { romanised: true, language: 'ja', confidence: 'high' };

  const koScore = words.filter((w) => KOREAN_MARKER.test(w)).length;
  const jaScore = words.filter((w) => JAPANESE_MARKER.test(w)).length;
  if (koScore === jaScore) return { romanised: true, language: null, confidence: 'low' };
  return {
    romanised: true,
    language: koScore > jaScore ? 'ko' : 'ja',
    confidence: Math.abs(koScore - jaScore) >= 3 ? 'medium' : 'low',
  };
}
