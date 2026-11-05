/** Word lookup for the Word sheet (M9): turns a token into dictionary entries from the installed packs. */
import type { LangCode } from '@/db/types';
import type { Token } from '@/engine/model';
import { installedVersion, lookupMany } from '@/engine/dict/lookup';
import type { DictRow } from '@/engine/dict/types';

export interface WordSense {
  gloss: string[];
  pos?: string;
}
export interface WordEntry {
  /** Headword form that matched. */
  form: string;
  reading: string | null;
  senses: WordSense[];
  /** Human-readable source, e.g. "JMdict". */
  source: string;
}
export type WordLookup =
  | { status: 'ok'; entries: WordEntry[]; dictionaryForm: string | null }
  | { status: 'no-pack'; packId: string; packName: string }
  | { status: 'no-entry' };

const PACK: Record<LangCode, { id: string; name: string }> = {
  ko: { id: 'ko-core', name: 'Korean dictionary' },
  ja: { id: 'ja-core', name: 'Japanese' },
  zh: { id: 'zh-core', name: 'Mandarin' },
  yue: { id: 'yue-core', name: 'Cantonese' },
};
export const packForLookup = (language: LangCode) => PACK[language];

const S_BASE = 0xac00;
const isSyllable = (c: string | undefined): c is string =>
  !!c && c.codePointAt(0)! >= S_BASE && c.codePointAt(0)! <= 0xd7a3;
/** Final-consonant index of a syllable (0 = none, 8 = ㄹ, 17 = ㅂ). */
const finalOf = (c: string) => (c.codePointAt(0)! - S_BASE) % 28;
const withFinal = (c: string, final: number) =>
  String.fromCodePoint(c.codePointAt(0)! - finalOf(c) + final);

/**
 * Citation forms for regular sound-changing conjugations that the heuristic lemmatiser does not undo:
 * ㅂ-irregular (추워 → 춥다), 르-irregular (몰라 → 모르다), formal 합니다 → 하다, and 여 contractions (놓여 → 놓이다).
 * These are candidates only: each is checked against the dictionary, so a wrong guess just finds nothing.
 */
export function koIrregularForms(surface: string): string[] {
  const out: string[] = [];
  const chars = [...surface.replace(/요$/u, '')];
  const last = chars.at(-1);
  const prev = chars.at(-2);
  const head = chars.slice(0, -2).join('');
  if (isSyllable(prev) && (last === '워' || last === '와') && finalOf(prev) === 0)
    out.push(`${head}${withFinal(prev, 17)}다`);
  if (isSyllable(prev) && (last === '라' || last === '러') && finalOf(prev) === 8)
    out.push(`${head}${withFinal(prev, 0)}르다`);
  if (surface.endsWith('습니다')) out.push(`${surface.slice(0, -3)}다`);
  else if (surface.endsWith('니다')) {
    const stem = [...surface.slice(0, -2)];
    const s = stem.at(-1);
    if (isSyllable(s) && finalOf(s) === 17)
      out.push(`${stem.slice(0, -1).join('')}${withFinal(s, 0)}다`);
  }
  if (last === '여' && chars.length > 1) out.push(`${chars.slice(0, -1).join('')}이다`);
  return out;
}

/** Candidate headwords in priority order (most specific first), without duplicates. */
export function lookupForms(token: Token, language: LangCode): string[] {
  const forms: string[] = [];
  if (language === 'ko') {
    for (const c of token.lemmaCandidates ?? [token.surface]) {
      forms.push(c);
      // The heuristic lemmatiser sometimes stops at the stem (좋은 → 좋): try the citation form too.
      if (!c.endsWith('다') && c.length > 0) forms.push(`${c}다`);
    }
    forms.push(...koIrregularForms(token.surface), token.surface);
  } else if (language === 'ja') {
    if (token.lemma) forms.push(token.lemma);
    forms.push(token.surface);
  } else {
    forms.push(token.surface);
  }
  return [...new Set(forms.filter(Boolean))];
}

const sourceName = (row: DictRow, language: LangCode): string => {
  if (language === 'ko') return row.x === 'k' ? 'kengdic' : 'Wiktionary';
  if (language === 'ja') return 'JMdict';
  if (language === 'yue') return 'CC-Canto';
  return 'CC-CEDICT';
};

const toEntry = (row: DictRow, language: LangCode, source?: string): WordEntry => ({
  form: row.f,
  reading: row.r || null,
  senses: row.s.map((s) => ({ gloss: s.g, ...(s.p ? { pos: s.p } : {}) })),
  source: source ?? sourceName(row, language),
});

const MAX_ENTRIES = 4;

/** Looks a token up; never throws (a storage failure is reported as "no entry"). */
export async function lookupWord(token: Token, language: LangCode): Promise<WordLookup> {
  const pack = PACK[language];
  try {
    if ((await installedVersion(language)) === null)
      return { status: 'no-pack', packId: pack.id, packName: pack.name };
    const forms = lookupForms(token, language);
    const found = await lookupMany(language, forms);
    let entries: WordEntry[] = [];
    let matched: string | null = null;
    // Dictionary forms rank ahead of the exact surface (사랑해 → 사랑하다 "to love" before the set phrase 사랑해).
    const hits = forms.filter((form) => (found.get(form) ?? []).some((r) => r.s.length > 0));
    const ordered = [
      ...hits.filter((form) => form !== token.surface),
      ...hits.filter((form) => form === token.surface),
    ].slice(0, 2);
    for (const form of ordered) {
      const rows = (found.get(form) ?? []).filter((r) => r.s.length > 0);
      matched ??= form;
      // Japanese: prefer entries whose kana matches the analysed reading.
      const sorted =
        language === 'ja' && token.reading
          ? [...rows].sort(
              (a, b) =>
                Number(b.r === token.reading || !!b.a?.includes(token.reading ?? '')) -
                Number(a.r === token.reading || !!a.a?.includes(token.reading ?? '')),
            )
          : rows;
      entries.push(
        ...sorted.slice(0, ordered.length > 1 ? 2 : MAX_ENTRIES).map((r) => toEntry(r, language)),
      );
    }
    entries = entries.slice(0, MAX_ENTRIES);
    // Cantonese: CC-Canto is small; CC-CEDICT glosses (when downloaded) fill the gaps.
    if (language === 'yue' && entries.length === 0 && (await installedVersion('zh')) !== null) {
      const zh = await lookupMany('zh', [token.surface]);
      const rows = (zh.get(token.surface) ?? []).filter((r) => r.s.length > 0);
      if (rows.length) {
        matched = token.surface;
        entries = rows.slice(0, MAX_ENTRIES).map((r) => toEntry(r, 'zh'));
      }
    }
    if (!entries.length) return { status: 'no-entry' };
    return {
      status: 'ok',
      entries,
      dictionaryForm: matched && matched !== token.surface ? matched : null,
    };
  } catch {
    return { status: 'no-entry' };
  }
}
