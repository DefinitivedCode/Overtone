/**
 * Korean lemma heuristics (LANGUAGE_ENGINE §5.3): particle stripping and candidate dictionary forms.
 * Candidates are NOT validated here — that needs the dictionary (M9) — so none is ever presented
 * as a meaning; they are carried on tokens for lookup, flagged `lemma-guess`.
 */

const S_BASE = 0xac00;
const isSyl = (c: string) => {
  const cp = c.codePointAt(0)!;
  return cp >= S_BASE && cp <= 0xd7a3;
};
/** Final jamo index (0 = none, 8 = ㄹ). */
const finalOf = (c: string) => (c.codePointAt(0)! - S_BASE) % 28;
const hasBatchim = (c: string) => isSyl(c) && finalOf(c) !== 0;
const endsInRieul = (c: string) => isSyl(c) && finalOf(c) === 8;

/** The syllable `c` with its final consonant replaced (0 = none, 4 = ㄴ, 8 = ㄹ, 17 = ㅂ). */
const withFinal = (c: string, final: number) =>
  String.fromCodePoint(c.codePointAt(0)! - finalOf(c) + final);

/**
 * ㄹ-stem verbs (알다, 만들다, 불다) lose their ㄹ before ㄴ, ㅂ, ㅅ and a following 는: 아는, 압니다, 만드세요,
 * 분다. Given the eojeol with that ending removed, returns dictionary forms with the ㄹ restored.
 * Also covers plain vowel stems that take ㅂ니다 / ㄴ다 (갑니다 → 가다, 간다 → 가다).
 */
function rieulForms(stem: string, merged: 'none' | 'nieun' | 'bieup'): string[] {
  const chars = [...stem];
  const last = chars.pop();
  if (last === undefined || !isSyl(last)) return [];
  const head = chars.join('');
  const final = finalOf(last);
  if (merged === 'none') {
    // The ending is a separate syllable (는, 세요), so the stem has no final of its own.
    return final === 0 ? [`${head}${withFinal(last, 8)}다`] : [];
  }
  // ㄴ or ㅂ was absorbed into the stem's last syllable (분 = 부 + ㄴ).
  if (final !== (merged === 'nieun' ? 4 : 17)) return [];
  return [`${head}${withFinal(last, 0)}다`, `${head}${withFinal(last, 8)}다`];
}

/** Longest first. `batchim`: required stem ending ('yes' needs a final consonant, 'no' needs none/ㄹ). */
const PARTICLES: ReadonlyArray<readonly [string, 'any' | 'yes' | 'no']> = [
  ['에서부터', 'any'],
  ['에게서', 'any'],
  ['한테서', 'any'],
  ['으로서', 'yes'],
  ['으로써', 'yes'],
  ['에서는', 'any'],
  ['에게는', 'any'],
  ['이라도', 'yes'],
  ['처럼', 'any'],
  ['까지', 'any'],
  ['부터', 'any'],
  ['마저', 'any'],
  ['조차', 'any'],
  ['에게', 'any'],
  ['한테', 'any'],
  ['에서', 'any'],
  ['으로', 'yes'],
  ['이랑', 'yes'],
  ['하고', 'any'],
  ['보다', 'any'],
  ['이나', 'yes'],
  ['이야', 'yes'],
  ['은', 'yes'],
  ['는', 'no'],
  ['이', 'yes'],
  ['가', 'no'],
  ['을', 'yes'],
  ['를', 'no'],
  ['에', 'any'],
  ['의', 'any'],
  ['도', 'any'],
  ['만', 'any'],
  ['로', 'no'],
  ['와', 'no'],
  ['과', 'yes'],
  ['랑', 'no'],
  ['나', 'no'],
  ['야', 'no'],
];

/** Short English glosses for particles — deterministic and useful to learners (shown by the Word sheet, M9). */
export const PARTICLE_GLOSS: Readonly<Record<string, string>> = {
  은: 'topic marker (after a consonant)',
  는: 'topic marker (after a vowel)',
  이: 'subject marker (after a consonant)',
  가: 'subject marker (after a vowel)',
  을: 'object marker (after a consonant)',
  를: 'object marker (after a vowel)',
  에: 'at, to, in (place, time, direction)',
  에서: 'at, in, from (location of an action)',
  의: 'possessive marker (’s, of)',
  도: 'also, too, even',
  만: 'only',
  로: 'by, with, toward (after a vowel or ㄹ)',
  으로: 'by, with, toward (after a consonant)',
  와: 'and, with (after a vowel)',
  과: 'and, with (after a consonant)',
  랑: 'and, with (casual, after a vowel)',
  이랑: 'and, with (casual, after a consonant)',
  하고: 'and, with',
  에게: 'to (a person)',
  한테: 'to (a person, casual)',
  까지: 'until, up to',
  부터: 'from, starting at',
  처럼: 'like, as',
  보다: 'than',
  마저: 'even, also (emphatic)',
  조차: 'even (negative contexts)',
  나: 'or, or so (after a vowel)',
  이나: 'or, or so (after a consonant)',
  야: 'vocative / emphasis (after a vowel)',
  이야: 'vocative / emphasis (after a consonant)',
  에서부터: 'starting from',
  에게서: 'from (a person)',
  한테서: 'from (a person, casual)',
  으로서: 'as, in the capacity of',
  으로써: 'by means of',
  에서는: 'at/in (topic)',
  에게는: 'to (topic)',
  이라도: 'even if it is',
};

export interface ParticleSplit {
  stem: string;
  particle: string;
}

/** Strips the longest particle whose batchim agreement fits; returns null when none applies. */
export function splitParticle(eojeol: string): ParticleSplit | null {
  for (const [p, need] of PARTICLES) {
    if (eojeol.length <= p.length || !eojeol.endsWith(p)) continue;
    const stem = eojeol.slice(0, -p.length);
    const last = [...stem].pop()!;
    if (!isSyl(last)) continue;
    if (need === 'yes' && !hasBatchim(last)) continue;
    if (need === 'no' && hasBatchim(last) && !endsInRieul(last)) continue;
    return { stem, particle: p };
  }
  return null;
}

// Contractions → full stem. Keyed by the contracted syllable.
const REVERSE: ReadonlyArray<readonly [string, string]> = [
  ['해', '하'],
  ['했', '하'],
  ['봐', '보'],
  ['봤', '보'],
  ['와', '오'],
  ['왔', '오'],
  ['줘', '주'],
  ['줬', '주'],
  ['돼', '되'],
  ['됐', '되'],
  ['써', '쓰'],
  ['커', '크'],
  ['꺼', '끄'],
  ['떠', '뜨'],
  ['워', '우'],
  ['펴', '피'],
  ['와', '와'],
  ['아', '아'],
  ['어', '어'],
];

/** Endings stripped to find a predicate stem, longest first. */
const ENDINGS = [
  '았었어요',
  '었었어요',
  '겠습니다',
  '았어요',
  '었어요',
  '였어요',
  '습니다',
  'ㅂ니다',
  '해요',
  '아요',
  '어요',
  '았어',
  '었어',
  '였어',
  '잖아',
  '는데',
  '지만',
  '니까',
  '면서',
  '도록',
  '더라',
  '네요',
  '군요',
  '아서',
  '어서',
  '고',
  '지',
  '면',
  '서',
  '는',
  '은',
  '을',
  '던',
  '게',
  '죠',
  '요',
  '아',
  '어',
  '야',
  '자',
  '다',
];

/**
 * Candidate dictionary forms for an eojeol, best guess first. Always includes the eojeol itself and
 * its particle-stripped stem; predicate candidates end in 다.
 */
export function lemmaCandidates(eojeol: string): string[] {
  const out: string[] = [eojeol];
  const add = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  const sp = splitParticle(eojeol);
  const base = sp ? sp.stem : eojeol;
  if (sp) add(base);
  // Copula on nouns: 학생이에요 / 학생입니다 / 학생이다.
  const cop = /^(.+?)(이에요|예요|입니다|이야|이다)$/u.exec(eojeol);
  if (cop?.[1]) add(cop[1]);

  for (const end of ENDINGS) {
    if (!base.endsWith(end) || base.length <= end.length) continue;
    const stem = base.slice(0, -end.length);
    add(`${stem}다`);
    const last = [...stem].pop() ?? '';
    for (const [from, to] of REVERSE) {
      if (last === from && from !== to) add(`${[...stem].slice(0, -1).join('')}${to}다`);
    }
  }
  // ㄹ-dropping and ㅂ/ㄴ-absorbing endings, which the plain ending list above cannot see. These look at the whole
  // eojeol: a trailing 는 would otherwise already have been taken for a particle.
  const chars = [...eojeol];
  if (chars.length >= 3 && eojeol.endsWith('니다') && finalOf(chars.at(-3)!) === 17)
    rieulForms(chars.slice(0, -2).join(''), 'bieup').forEach(add);
  else if (
    chars.length >= 2 &&
    chars.at(-1) === '다' &&
    isSyl(chars.at(-2)!) &&
    finalOf(chars.at(-2)!) === 4
  )
    rieulForms(chars.slice(0, -1).join(''), 'nieun').forEach(add);
  for (const end of ['시는', '십니다', '세요', '는']) {
    if (eojeol.endsWith(end) && eojeol.length > end.length)
      rieulForms(eojeol.slice(0, -end.length), 'none').forEach(add);
  }
  // Contracted stems with no separate ending: 해 → 하다, 봐 → 보다, 줘 → 주다.
  const lastCh = [...base].pop() ?? '';
  for (const [from, to] of REVERSE) {
    if (lastCh === from && from !== to) add(`${[...base].slice(0, -1).join('')}${to}다`);
  }
  return out;
}
