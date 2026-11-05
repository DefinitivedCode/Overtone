/**
 * Lyrics parsing (ARCHITECTURE §3.1): normalisation, line kinds and content keys.
 * The line-key function is part of the BACKUP FORMAT CONTRACT: changing it needs a backup
 * schemaVersion bump and a migration that remaps keys (ARCHITECTURE §7).
 */

import type { ReadingSpan } from '../engine/model';
import { parseAozora } from './aozora';

export type LineKind = 'lyric' | 'section' | 'blank';

export interface ParsedLine {
  index: number;
  /** Exact display text (NFC, no trailing newline). */
  text: string;
  kind: LineKind;
  /** Stable content key; '' for blank lines. */
  key: string;
  readings?: ReadingSpan[];
}

export const LIMITS = {
  title: 200,
  artist: 200,
  lyricsChars: 20_000,
  lyricsLines: 1_000,
} as const;

// Zero-width characters stripped everywhere except ZWJ inside emoji sequences.
const ZERO_WIDTH = new RegExp('[\u200B\u200C\u2060\uFEFF]', 'g');
// C0 and C1 control characters except \n and \t (\r is normalised to \n before this runs).
// eslint-disable-next-line no-control-regex -- intentionally matching control characters
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Normalises user/fetched text for storage. Display-affecting content is otherwise preserved. */
export function normaliseLyrics(raw: string): string {
  let t = raw.normalize('NFC');
  t = t.replace(/\r\n?/g, '\n');
  t = t.replace(CONTROL, '');
  t = t.replace(ZERO_WIDTH, '');
  // Keep ZWJ only when it joins pictographs (emoji sequences); drop stray ones.
  t = t.replace(/‍/gu, (_m, offset: number, whole: string) => {
    const before = [...whole.slice(Math.max(0, offset - 2), offset)].pop() ?? '';
    const after = [...whole.slice(offset + 1, offset + 3)][0] ?? '';
    return /\p{Extended_Pictographic}|️/u.test(before) && /\p{Extended_Pictographic}/u.test(after)
      ? '‍'
      : '';
  });
  // Trailing whitespace is trimmed at the end of the file only.
  return t.replace(/\s+$/u, '');
}

const SECTION_LABEL =
  '(?:pre[- ]?chorus|post[- ]?chorus|chorus|verse|hook|bridge|intro|outro|rap|repeat|interlude|instrumental|refrain|break|spoken|ad[- ]?lib|후렴|브릿지|간주|サビ|[ABC]メロ|イントロ|アウトロ|間奏|副歌|主歌|前奏|间奏|桥段|橋段)';
const REPEAT = '(?:\\s*[x×]\\s*\\d+)';
const NUMBER = '(?:\\s*\\d+)';
const ARTIST = '(?:\\s*[:：\\-–—]\\s*.+)';
const LABEL_BODY = `${SECTION_LABEL}${NUMBER}?${REPEAT}?${ARTIST}?`;

const BRACKETED = /^[[【［].{1,40}[\]】］]$/u;
const PAREN_LABEL = new RegExp(`^[(（]\\s*${LABEL_BODY}\\s*[)）]$`, 'iu');
const BARE_LABEL = new RegExp(`^${LABEL_BODY}$`, 'iu');
const REPEAT_ONLY = /^[(（]?\s*[x×]\s*\d+\s*[)）]?$/iu;
// "Jungkook:" — a short name followed by a colon and nothing else.
const SPEAKER = /^[^\s:：()（）[\]]{1,24}(?:\s[^\s:：()（）[\]]{1,24}){0,2}\s*[:：]$/u;

/** Classifies a stored line. Parenthesised lyrics such as "(I love you)" stay lyrics. */
export function detectKind(line: string): LineKind {
  const t = line.trim();
  if (t === '') return 'blank';
  if (BRACKETED.test(t) || PAREN_LABEL.test(t) || BARE_LABEL.test(t)) return 'section';
  if (REPEAT_ONLY.test(t) || SPEAKER.test(t)) return 'section';
  return 'lyric';
}

/** Content key: sha1 of the folded line text, first 16 hex chars. '' for blank lines. */
export async function lineKey(text: string): Promise<string> {
  if (text.trim() === '') return '';
  const collapsed = text.toLowerCase().normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const stripped = collapsed.replace(/[\p{P}\s]+$/u, '');
  const basis = stripped === '' ? collapsed : stripped;
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(basis));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** Splits already-normalised text into lines with kinds (no keys). */
export function splitLines(normalised: string): Omit<ParsedLine, 'key'>[] {
  return normalised.split('\n').map((text, index) => ({ index, text, kind: detectKind(text) }));
}

/** Normalises then parses raw lyrics into keyed lines. */
export async function parseLyrics(raw: string, usePastedReadings = false): Promise<ParsedLine[]> {
  const lines = splitLines(normaliseLyrics(raw));
  const cache = new Map<string, string>();
  return Promise.all(
    lines.map(async (original) => {
      const { text, readings } = usePastedReadings
        ? parseAozora(original.text)
        : { text: original.text, readings: [] };
      const l = readings.length
        ? { ...original, text, kind: detectKind(text), readings }
        : original;
      let key = cache.get(l.text);
      if (key === undefined) {
        key = await lineKey(l.text);
        cache.set(l.text, key);
      }
      return { ...l, key };
    }),
  );
}

export interface SongInputErrors {
  title?: string;
  artist?: string;
  lyrics?: string;
}

/** Validates user input against PRODUCT_SPEC J2.2/J2.5. Messages are user-facing. */
export function validateSongInput(input: {
  title: string;
  artist: string | null;
  lyrics: string;
}): SongInputErrors {
  const errors: SongInputErrors = {};
  if (input.title.trim() === '') errors.title = 'Enter a title.';
  else if (input.title.length > LIMITS.title)
    errors.title = `Title is too long (${input.title.length} of ${LIMITS.title} characters).`;
  if (input.artist && input.artist.length > LIMITS.artist)
    errors.artist = `Artist is too long (${input.artist.length} of ${LIMITS.artist} characters).`;
  const normalised = normaliseLyrics(input.lyrics);
  if (normalised.trim() === '') errors.lyrics = 'Paste or type some lyrics.';
  else if (normalised.length > LIMITS.lyricsChars)
    errors.lyrics = `Lyrics are too long (${normalised.length.toLocaleString('en')} of ${LIMITS.lyricsChars.toLocaleString('en')} characters). Split the song or remove repeated sections.`;
  else {
    const lines = normalised.split('\n').length;
    if (lines > LIMITS.lyricsLines)
      errors.lyrics = `Lyrics have too many lines (${lines.toLocaleString('en')} of ${LIMITS.lyricsLines.toLocaleString('en')}).`;
  }
  return errors;
}
