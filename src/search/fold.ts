/**
 * Search folding (ARCHITECTURE §8, PRODUCT_SPEC J10.1): NFKC → lowercase → strip Latin combining
 * marks (ài → ai, tōkyō → tokyo) → katakana → hiragana → collapse whitespace.
 * Only U+0300–U+036F are stripped, so kana voicing marks and Hangul jamo are preserved.
 */
export function fold(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Separator between the static search text and the romanised text added after analysis. */
const ROMAN_SEP = '\u0001';

export function buildSearchText(
  title: string,
  artist: string | null,
  raw: string,
  romanised = '',
): string {
  const base = fold(`${title}\n${artist ?? ''}\n${raw}`);
  return romanised ? `${base}${ROMAN_SEP}${fold(romanised)}` : base;
}

/** Replaces the romanised suffix of an existing search text. */
export function withRomanised(searchText: string, romanised: string): string {
  const base = searchText.split(ROMAN_SEP)[0] ?? '';
  return romanised ? `${base}${ROMAN_SEP}${fold(romanised)}` : base;
}

/** True when the stored search text already carries exactly this (folded) romanised suffix. */
export function romanisedMatches(searchText: string, romanised: string): boolean {
  return (searchText.split(ROMAN_SEP)[1] ?? '') === (romanised ? fold(romanised) : '');
}

/** AND semantics over whitespace-separated, folded query tokens. */
export function matchesQuery(searchText: string, query: string): boolean {
  const q = fold(query);
  if (q === '') return true;
  return q.split(' ').every((token) => searchText.includes(token));
}
