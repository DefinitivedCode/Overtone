/**
 * Pure ranking of romanised-import candidates by dictionary evidence (issue #11, ADR 0016).
 *
 * A candidate spelling that is a real word (or an inflected form of one) is far more likely to be what the lyric said
 * than one that merely romanises back to the pasted text. The score only reorders candidates: nothing is dropped, so
 * names, slang and anything missing from the dictionary stay reachable.
 */
import { lemmaCandidates } from '@/engine/ko/lemma';

export const HANGUL = /^[가-힣]+$/u;

/** Higher = more likely a real word; 0 = no evidence. */
export type Lexicon = (form: string) => number;

/** The least a dictionary row has to say: whether it is an ordinary entry (1) or a proper noun (0). */
export interface HeadwordInfo {
  q: number;
}

/**
 * Exact common headword 4 > inflected/particle form of a common headword 3 > exact proper noun 2 > form of a proper
 * noun 1 > unknown 0. Lemma forms come from the same heuristics the Word sheet uses (`lemmaCandidates`).
 */
export function lexiconFromHeadwords(
  headwords: ReadonlyMap<string, readonly HeadwordInfo[]>,
): Lexicon {
  return (form) => {
    if (!HANGUL.test(form)) return 0;
    let best = 0;
    for (const [i, lemma] of lemmaCandidates(form).entries()) {
      const rows = headwords.get(lemma);
      if (!rows?.length) continue;
      const common = rows.some((r) => r.q === 1);
      const exact = i === 0 || lemma === form;
      best = Math.max(best, exact ? (common ? 4 : 2) : common ? 3 : 1);
    }
    return best;
  };
}

/** Stable reorder: higher score first, otherwise the converter's own order. */
export function rankByLexicon(candidates: readonly string[], lexicon: Lexicon): string[] {
  return candidates
    .map((c, i) => ({ c, i, score: lexicon(c) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
}
