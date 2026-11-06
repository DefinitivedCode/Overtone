/** Loads dictionary evidence for ranking romanised-import candidates from the installed Korean pack. */
import { lemmaCandidates } from '@/engine/ko/lemma';
import { installedVersion, lookupInstalled } from '@/engine/dict/lookup';
import { scanCommonKanjiRows } from '@/engine/dict/scan';
import { buildKanjiIndex, type KanjiIndex } from './kanji';
import { convertLyrics } from './convert';
import { HANGUL, lexiconFromHeadwords, type Lexicon } from './rank';

/** Every dictionary form worth looking up for these candidates: the spellings and their possible lemmas. */
function formsToLookUp(text: string): Set<string> {
  const forms = new Set<string>();
  for (const line of convertLyrics(text, 'ko'))
    for (const seg of line.segments)
      if (seg.type === 'word')
        for (const c of seg.candidates)
          if (HANGUL.test(c)) for (const f of lemmaCandidates(c)) forms.add(f);
  return forms;
}

/**
 * Lexicon from the installed Korean dictionary, or `null` when it is not installed (candidates then keep the
 * converter's own order).
 */
export async function installedKoreanLexicon(text: string): Promise<Lexicon | null> {
  try {
    if ((await installedVersion('ko')) === null) return null;
    const rows = await lookupInstalled('ko', [...formsToLookUp(text)]);
    return rows ? lexiconFromHeadwords(rows) : null;
  } catch {
    return null; // the dictionary is optional; a read failure must not break the review step
  }
}

/**
 * Kanji options for Japanese words, built in memory from the common entries of the installed Japanese pack (no pack
 * format or database change). `null` when the pack is not installed or cannot be read: words then stay kana-only.
 */
export async function installedKanjiIndex(): Promise<KanjiIndex | null> {
  try {
    const rows = await scanCommonKanjiRows();
    return rows ? buildKanjiIndex(rows) : null;
  } catch {
    return null;
  }
}
