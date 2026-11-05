/**
 * Correction overlay (LANGUAGE_ENGINE §12, ADR 0013). Applied to an analysed line before rendering.
 *
 * Deviation from the plan: structural corrections (split, merge, "don't annotate", "this is English") are applied
 * here on the main thread rather than sent to the worker, because each one is a deterministic edit of the analysed
 * tokens that needs no further linguistic analysis. Re-analysing a span as a different language is not offered.
 */
import { romaniseEojeol } from './ko/romanise';
import type { LineAnalysis, RubyUnit, Token } from './model';
import { formatPinyin } from './zh/pinyin';
import { parseJyutping, parsePinyin, romajiToKana } from './input';

/** The parts of a stored correction the overlay needs (matches `Correction` in the db layer). */
export interface OverlayCorrection {
  id: string;
  lineKey: string | null;
  surface: string;
  occurrence: number | null;
  language: string;
  patch: {
    reading?: string;
    romanisation?: string;
    gloss?: string;
    glossMode?: 'replace' | 'prepend';
    segLang?: string;
    split?: number[];
    mergeWithNext?: number;
  };
}

export interface OverlayResult {
  analysis: LineAnalysis;
  /** Ids of the corrections that found a token on this line. */
  applied: ReadonlySet<string>;
}

const isWord = (t: Token) => t.kind === 'word' || t.kind === 'particle';

function reindex(tokens: Token[]): Token[] {
  let at = 0;
  return tokens.map((t) => {
    const next = { ...t, start: at, end: at + t.surface.length };
    at = next.end;
    return next;
  });
}

/** Indices of the tokens a correction targets: all matching, or the nth occurrence. */
function targets(tokens: readonly Token[], c: OverlayCorrection): number[] {
  const hits: number[] = [];
  tokens.forEach((t, i) => {
    if (isWord(t) && t.surface === c.surface) hits.push(i);
  });
  if (c.occurrence === null) return hits;
  const nth = hits[c.occurrence];
  return nth === undefined ? [] : [nth];
}

/** Applies a typed reading to one token (per language rules, J8). Returns the token unchanged if the text is not usable. */
export function withReading(t: Token, language: string, reading: string): Token {
  if (language === 'ja') {
    const kana = romajiToKana(reading);
    if (!kana) return t;
    return {
      ...t,
      reading: kana,
      ruby: [{ base: t.surface, reading: kana }],
      pronunciation: undefined,
      userReading: true,
      confidence: 'high',
      notes: t.notes.filter((n) => n !== 'needs-language-data'),
    };
  }
  if (language === 'zh') {
    const syllables = parsePinyin(reading);
    const chars = [...t.surface];
    if (!syllables || syllables.length !== chars.length) return t;
    const ruby: RubyUnit[] = chars.map((base, i) => {
      const s = syllables[i]!;
      return { base, reading: `${s.syllable}${s.tone}`, syllable: s.syllable, tone: s.tone };
    });
    return {
      ...t,
      ruby,
      reading: ruby.map((u) => u.reading).join(' '),
      roman: syllables.map((s) => formatPinyin(s.syllable, s.tone, 'marks')).join(' '),
      userReading: true,
      confidence: 'high',
    };
  }
  if (language === 'yue') {
    const syllables = parseJyutping(reading);
    const chars = [...t.surface];
    if (!syllables || syllables.length !== chars.length) return t;
    const ruby: RubyUnit[] = chars.map((base, i) => {
      const s = syllables[i]!;
      const tone = Number(s.slice(-1));
      return { base, reading: s, syllable: s.slice(0, -1), tone };
    });
    return {
      ...t,
      ruby,
      reading: syllables.join(' '),
      roman: syllables.join(' '),
      userReading: true,
      confidence: 'high',
    };
  }
  // Korean: the typed reading is the romanisation.
  return { ...t, userRoman: reading.trim(), userReading: true, confidence: 'high' };
}

const tagged = (t: Token, id: string): string[] => [...(t.correctionIds ?? []), id];

function mergePair(a: Token, b: Token, language: string, id: string): Token {
  const surface = a.surface + b.surface;
  const base: Token = {
    ...a,
    surface,
    end: a.start + surface.length,
    ruby: [...a.ruby, ...b.ruby],
    lemma: null,
    pos: null,
    dict: null,
    confidence: 'medium',
    notes: [...new Set([...a.notes, ...b.notes, 'merged'])],
    corrected: true,
    correctionIds: [...tagged(a, id), ...tagged(b, id)],
  };
  delete base.lemmaCandidates;
  delete base.pronunciation;
  delete base.userRoman;
  if (language === 'ko') {
    base.ruby = [{ base: surface, reading: null }];
    base.roman = romaniseEojeol(surface);
    base.lemmaCandidates = [surface];
  } else if (language === 'ja') {
    base.reading = a.reading !== null && b.reading !== null ? a.reading + b.reading : null;
    base.roman = null;
  } else {
    base.reading = base.ruby.every((u) => u.reading)
      ? base.ruby.map((u) => u.reading).join(' ')
      : null;
    base.roman = [a.roman, b.roman].filter(Boolean).join(' ') || null;
  }
  return base;
}

/** Splits a token at the given UTF-16 offsets within its surface. Offsets that do not fall inside are ignored. */
function splitToken(t: Token, offsets: readonly number[], language: string, id: string): Token[] {
  const cuts = [...new Set(offsets)]
    .filter((o) => o > 0 && o < t.surface.length)
    .sort((x, y) => x - y);
  if (!cuts.length) return [t];
  const bounds = [0, ...cuts, t.surface.length];
  const pieces: Token[] = [];
  let unit = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i]!;
    const to = bounds[i + 1]!;
    const surface = t.surface.slice(from, to);
    const piece: Token = {
      ...t,
      surface,
      start: t.start + from,
      end: t.start + to,
      ruby: [],
      reading: null,
      roman: null,
      lemma: null,
      pos: null,
      dict: null,
      confidence: 'medium',
      notes: [...new Set([...t.notes, 'split'])],
      corrected: true,
      correctionIds: tagged(t, id),
    };
    delete piece.pronunciation;
    delete piece.lemmaCandidates;
    delete piece.userRoman;
    delete piece.userReading;
    // Ruby units that line up with the cut keep their readings.
    const units: RubyUnit[] = [];
    let len = 0;
    while (unit < t.ruby.length && len < surface.length) {
      units.push(t.ruby[unit]!);
      len += t.ruby[unit]!.base.length;
      unit++;
    }
    const aligned = len === surface.length && units.map((u) => u.base).join('') === surface;
    if (language === 'ko') {
      piece.ruby = [{ base: surface, reading: null }];
      piece.roman = romaniseEojeol(surface);
      piece.lemmaCandidates = [surface];
    } else if (aligned && units.every((u) => u.reading !== null)) {
      piece.ruby = units;
      piece.reading = units.map((u) => u.reading).join(language === 'ja' ? '' : ' ');
      piece.roman =
        language === 'ja'
          ? null
          : language === 'zh'
            ? units
                .map((u) => (u.syllable ? formatPinyin(u.syllable, u.tone ?? 5, 'marks') : u.base))
                .join(' ')
            : units.map((u) => u.reading).join(' ');
    } else {
      // No reliable reading for this piece: show it as unreadable rather than guess.
      piece.confidence = 'none';
      piece.notes.push('unknown-reading');
    }
    pieces.push(piece);
  }
  return pieces;
}

function plainOut(t: Token, to: 'none' | 'en', id: string): Token {
  return {
    ...t,
    kind: to === 'en' ? 'latin' : 'symbol',
    lang: to === 'en' ? 'en' : 'other',
    ruby: [],
    reading: null,
    roman: null,
    lemma: null,
    pos: null,
    dict: null,
    confidence: 'none',
    notes: [...t.notes, to === 'en' ? 'user:english' : 'user:no-annotation'],
    corrected: true,
    correctionIds: tagged(t, id),
  };
}

/** Applies the corrections that belong to one line. Never throws; an unusable correction is simply not applied. */
export function applyCorrections(
  analysis: LineAnalysis,
  lineKey: string,
  corrections: readonly OverlayCorrection[],
): OverlayResult {
  const relevant = corrections
    .filter((c) => c.language === analysis.lang && (c.lineKey === lineKey || c.lineKey === null))
    .sort((a, b) => (a.lineKey === null ? 0 : 1) - (b.lineKey === null ? 0 : 1)); // song-wide first, line-specific win
  if (!relevant.length || analysis.status === 'failed') return { analysis, applied: new Set() };

  const applied = new Set<string>();
  let tokens: Token[] = analysis.tokens.map((t) => t);
  const language = analysis.lang;

  // 1. Structural corrections change token boundaries and kinds.
  for (const c of relevant) {
    const { patch } = c;
    if (!patch.mergeWithNext && !patch.split?.length && !patch.segLang) continue;
    // Merge and split act on one place at a time; work from the end so earlier indices stay valid.
    for (const i of targets(tokens, c).reverse()) {
      const t = tokens[i]!;
      if (patch.segLang === 'none' || patch.segLang === 'en') {
        tokens[i] = plainOut(t, patch.segLang, c.id);
        applied.add(c.id);
      } else if (patch.mergeWithNext) {
        const next = tokens[i + 1];
        if (next && isWord(next) && next.lang === t.lang && next.start === t.end) {
          tokens.splice(i, 2, mergePair(t, next, language, c.id));
          applied.add(c.id);
        }
      } else if (patch.split?.length) {
        const parts = splitToken(t, patch.split, language, c.id);
        if (parts.length > 1) {
          tokens.splice(i, 1, ...parts);
          applied.add(c.id);
        }
      }
    }
    tokens = reindex(tokens);
  }

  // 2. Value corrections, matched on the final token list.
  tokens = tokens.map((t) => t);
  for (const c of relevant) {
    const { patch } = c;
    if (
      patch.reading === undefined &&
      patch.romanisation === undefined &&
      patch.gloss === undefined
    )
      continue;
    for (const i of targets(tokens, c)) {
      let t = tokens[i]!;
      if (patch.reading !== undefined) {
        const next = withReading(t, language, patch.reading);
        if (next !== t) t = next;
        else if (language !== 'ko') continue; // unusable reading: leave the generated one
      }
      if (patch.romanisation !== undefined) t = { ...t, userRoman: patch.romanisation };
      if (patch.gloss !== undefined)
        t = { ...t, userGloss: { text: patch.gloss, mode: patch.glossMode ?? 'replace' } };
      tokens[i] = { ...t, corrected: true, correctionIds: tagged(t, c.id) };
      applied.add(c.id);
    }
  }
  return { analysis: { ...analysis, tokens }, applied };
}
