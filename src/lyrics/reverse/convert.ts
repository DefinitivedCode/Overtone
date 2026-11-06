/**
 * Reviewable conversion of romanised lyrics into original script (ADR 0016). Pure and synchronous.
 *
 * Nothing here decides for the user: every word carries its ranked candidates, text that is not convertible
 * (English, punctuation, numbers, section labels, blank lines) passes through untouched, and the pasted source is
 * never modified.
 */
import { detectKind, type LineKind } from '../parse';
import { isAlwaysEnglish, isContextualEnglish } from './english';
import { MAX_CANDIDATES, RANKING_POOL, romanToHangul } from './korean';
import { romajiToKana } from './japanese';
import { rankByLexicon, type Lexicon } from './rank';

export type ReverseLang = 'ko' | 'ja';

export type Segment =
  | { type: 'text'; text: string }
  | {
      type: 'word';
      /** As pasted. */
      source: string;
      /** Ranked options; candidates[0] is what the draft uses until the user picks another. */
      candidates: string[];
      /** False when the first option is the pasted word itself (probably English). */
      converted: boolean;
    };

export interface ReverseLine {
  index: number;
  source: string;
  kind: LineKind;
  segments: Segment[];
}

const TOKEN = /[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu;
const LATIN_WORD = /^[\p{Script=Latin}\p{M}'’ʼ-]+$/u;

export const isLatinWord = (token: string): boolean => LATIN_WORD.test(token);

export function convertWord(word: string, lang: ReverseLang): string[] {
  return lang === 'ko' ? romanToHangul(word) : romajiToKana(word);
}

/** Splits text into words and everything between them (concatenating the pieces gives the text back). */
export function tokenise(line: string): string[] {
  return line.match(TOKEN) ?? [];
}

export interface ConvertOptions {
  /** Dictionary evidence used to put real words first among a word's candidates (Korean only today). */
  lexicon?: Lexicon | null;
}

export function convertLyrics(
  text: string,
  lang: ReverseLang,
  options: ConvertOptions = {},
): ReverseLine[] {
  const cache = new Map<string, string[]>();
  const candidatesFor = (word: string): string[] => {
    const key = word.toLowerCase();
    let hit = cache.get(key);
    if (!hit) {
      // With dictionary evidence, rank a wider pool first so a real word is not cut off before it can move up.
      const lex = lang === 'ko' ? options.lexicon : null;
      hit = lex
        ? rankByLexicon(romanToHangul(word, RANKING_POOL), lex).slice(0, MAX_CANDIDATES)
        : convertWord(word, lang);
      cache.set(key, hit);
    }
    return hit;
  };
  return text.split('\n').map((source, index): ReverseLine => {
    const kind = detectKind(source);
    if (kind !== 'lyric')
      return { index, source, kind, segments: [{ type: 'text', text: source }] };
    const tokens = tokenise(source);
    const options = tokens.map((t) => (isLatinWord(t) ? candidatesFor(t) : []));
    const hasOtherEnglish = tokens.some((t, i) => isLatinWord(t) && options[i]!.length === 0);
    const segments: Segment[] = [];
    tokens.forEach((token, i) => {
      const candidates = options[i]!;
      if (candidates.length === 0) {
        const last = segments.at(-1);
        if (last?.type === 'text') last.text += token;
        else segments.push({ type: 'text', text: token });
        return;
      }
      const english =
        isAlwaysEnglish(token) || (hasOtherEnglish && isContextualEnglish(token, lang));
      segments.push(
        english
          ? { type: 'word', source: token, candidates: [token, ...candidates], converted: false }
          : { type: 'word', source: token, candidates, converted: true },
      );
    });
    return { index, source, kind, segments };
  });
}

/** Choice per `${line}:${segment}`; missing means the first candidate. */
export type Choices = Readonly<Record<string, number>>;
export const choiceKey = (line: number, segment: number): string => `${line}:${segment}`;

export function lineText(line: ReverseLine, choices: Choices = {}): string {
  return line.segments
    .map((seg, i) =>
      seg.type === 'text'
        ? seg.text
        : (seg.candidates[choices[choiceKey(line.index, i)] ?? 0] ?? seg.candidates[0]!),
    )
    .join('');
}

/** Words with more than one option, or kept as English with a conversion on offer. */
export const reviewCount = (line: ReverseLine): number =>
  line.segments.filter((s) => s.type === 'word' && s.candidates.length > 1).length;

/** The final lyrics: manual line edits win over word choices; every other line is as pasted. */
export function assemble(
  lines: readonly ReverseLine[],
  choices: Choices = {},
  edits: Readonly<Record<number, string>> = {},
): string {
  return lines.map((l) => edits[l.index] ?? lineText(l, choices)).join('\n');
}

export const convertibleCount = (lines: readonly ReverseLine[]): number =>
  lines.reduce((n, l) => n + l.segments.filter((s) => s.type === 'word' && s.converted).length, 0);
