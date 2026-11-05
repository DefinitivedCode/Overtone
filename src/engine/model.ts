/** Engine data model (LANGUAGE_ENGINE §3). Shared by the worker and the UI; contains no DOM or DB types. */

export type LangCode = 'ko' | 'ja' | 'zh' | 'yue';
export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface ReadingSpan {
  /** UTF-16 offsets into the displayed lyric line. */
  start: number;
  end: number;
  reading: string;
}

export interface RubyUnit {
  base: string;
  reading: string | null;
  tone?: number;
  syllable?: string;
}

export type TokenKind = 'word' | 'particle' | 'punct' | 'space' | 'latin' | 'number' | 'symbol';
export type TokenLang = LangCode | 'en' | 'other';

export interface Token {
  /** UTF-16 offsets into the line text. */
  start: number;
  end: number;
  surface: string;
  kind: TokenKind;
  lang: TokenLang;
  ruby: RubyUnit[];
  reading: string | null;
  /** Whole-token romanisation before display preferences. */
  roman: string | null;
  lemma: string | null;
  pos: string | null;
  dict: { entryIds: string[] } | null;
  attachToPrev: boolean;
  confidence: Confidence;
  /** Machine-readable reasons, e.g. 'particle:를', 'needs-language-data'. */
  notes: string[];
  userReading?: boolean;
  /** Romanisation typed by the user (corrections overlay); wins over every derived romanisation. */
  userRoman?: string;
  /** Meaning typed by the user; shown in the Word sheet before (or instead of) dictionary senses. */
  userGloss?: { text: string; mode: 'replace' | 'prepend' };
  /** True when a correction changed this token (shows the edited marker). */
  corrected?: boolean;
  /** Ids of the corrections that produced or changed this token (so the sheet can edit or revert them). */
  correctionIds?: string[];
  /** Japanese pronunciation from the tokenizer, used for long vowels at render time. */
  pronunciation?: string;
  particleGloss?: string;
  /** Candidate dictionary forms for lookup (Korean lemma heuristics; validated against the dictionary in M9). */
  lemmaCandidates?: string[];
}

export interface LineAnalysis {
  lineKey: string;
  lang: LangCode;
  engineVersion: number;
  status: 'ok' | 'partial' | 'failed';
  tokens: Token[];
}

/** Kinds that never carry annotation (invariant 3). */
const PLAIN_KINDS = new Set<TokenKind>(['punct', 'space', 'latin', 'number', 'symbol']);

/**
 * Checks the token invariants of LANGUAGE_ENGINE §3. Returns human-readable violations; empty = valid.
 * Property-tested for every analyser.
 */
export function checkInvariants(text: string, analysis: Pick<LineAnalysis, 'tokens'>): string[] {
  const v: string[] = [];
  const { tokens } = analysis;
  let cursor = 0;
  for (const [i, t] of tokens.entries()) {
    if (t.start !== cursor) v.push(`token ${i} starts at ${t.start}, expected ${cursor}`);
    if (t.end - t.start !== t.surface.length) v.push(`token ${i} offsets do not match its surface`);
    if (text.slice(t.start, t.end) !== t.surface)
      v.push(`token ${i} surface differs from the text`);
    cursor = t.end;
    if (t.ruby.length > 0 && t.ruby.map((u) => u.base).join('') !== t.surface)
      v.push(`token ${i} ruby bases do not rebuild the surface`);
    if (PLAIN_KINDS.has(t.kind)) {
      if (t.ruby.length > 0) v.push(`token ${i} (${t.kind}) has ruby`);
      if (t.kind !== 'space' && t.roman !== null && t.roman !== t.surface)
        v.push(`token ${i} (${t.kind}) roman differs from surface`);
    }
    if (
      t.confidence === 'high' &&
      t.reading === null &&
      t.roman === null &&
      t.kind === 'word' &&
      t.lang === 'ko'
    )
      v.push(`token ${i} is high confidence without a reading`);
  }
  if (cursor !== text.length) v.push(`tokens end at ${cursor}, text length is ${text.length}`);
  return v;
}

export function plainToken(
  partial: Pick<Token, 'start' | 'end' | 'surface'> & Partial<Token>,
): Token {
  return {
    kind: 'word',
    lang: 'other',
    ruby: [],
    reading: null,
    roman: null,
    lemma: null,
    pos: null,
    dict: null,
    attachToPrev: false,
    confidence: 'none',
    notes: [],
    ...partial,
  };
}

/** Rendering never breaks: a failed line becomes one unannotated token. */
export function failedAnalysis(
  lineKey: string,
  lang: LangCode,
  engineVersion: number,
  text: string,
): LineAnalysis {
  const safe = typeof text === 'string' ? text : '';
  return {
    lineKey,
    lang,
    engineVersion,
    status: 'failed',
    tokens:
      safe === ''
        ? []
        : [plainToken({ start: 0, end: safe.length, surface: safe, notes: ['analysis-failed'] })],
  };
}
