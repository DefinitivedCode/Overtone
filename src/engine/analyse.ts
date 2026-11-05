/** The analysis pipeline: script runs → language routing → per-language analyser (LANGUAGE_ENGINE §4). */
import { lemmaCandidates, splitParticle } from './ko/lemma';
import { romaniseEojeol } from './ko/romanise';
import { ENGINE_VERSION } from './version';
import { failedAnalysis, plainToken } from './model';
import type { LangCode, LineAnalysis, Token } from './model';
import { mergeJapanese, routeRun, splitRuns } from './segment/segment';
import type { Run } from './segment/segment';

export interface LineInput {
  key: string;
  text: string;
}

export interface AnalyseRequest {
  lang: LangCode;
  lines: LineInput[];
}

const HANGUL_SYLLABLE = /[가-힣]/u;

function koreanWord(run: Run): Token {
  const hasSyllable = HANGUL_SYLLABLE.test(run.text);
  const notes: string[] = [];
  const split = splitParticle(run.text);
  if (split) notes.push(`particle:${split.particle}`);
  if (!hasSyllable) notes.push('jamo-only'); // ㅋㅋ, ㅠㅠ: transliterated letter by letter
  return plainToken({
    start: run.start,
    end: run.end,
    surface: run.text,
    kind: 'word',
    lang: 'ko',
    ruby: [{ base: run.text, reading: null }],
    roman: romaniseEojeol(run.text, 'pronunciation'),
    lemmaCandidates: hasSyllable ? lemmaCandidates(run.text) : undefined,
    confidence: hasSyllable ? 'high' : 'low',
    notes,
  });
}

function tokenFor(run: Run, lang: LangCode): Token {
  const routed = routeRun(run.cls, lang);
  const base = {
    start: run.start,
    end: run.end,
    surface: run.text,
    kind: routed.kind,
    lang: routed.lang,
  };
  if (routed.kind === 'word') {
    if (routed.lang === 'ko' && lang === 'ko') return koreanWord(run);
    // A language this engine cannot read yet (or Hanja): keep the original, say why.
    return plainToken({ ...base, notes: [routed.note ?? 'needs-language-data'] });
  }
  if (routed.kind === 'space') return plainToken({ ...base, confidence: 'high' });
  return plainToken({ ...base, roman: run.text, confidence: 'high' }); // latin, number, punct, symbol: shown as written
}

/** Analyses one line. Pure and deterministic. */
export function analyseLine(input: LineInput, lang: LangCode): LineAnalysis {
  const tokens = mergeJapanese(splitRuns(input.text)).map((run) => tokenFor(run, lang));
  const unread = tokens.some((t) => t.kind === 'word' && t.confidence === 'none');
  return {
    lineKey: input.key,
    lang,
    engineVersion: ENGINE_VERSION[lang],
    status: unread ? 'partial' : 'ok',
    tokens,
  };
}

/** Analyses a batch; an exception on one line yields a failed (original-text) analysis for that line only. */
export function analyseBatch(req: AnalyseRequest): LineAnalysis[] {
  return req.lines.map((line) => {
    try {
      return analyseLine(line, req.lang);
    } catch {
      return failedAnalysis(line.key, req.lang, ENGINE_VERSION[req.lang], line.text);
    }
  });
}
