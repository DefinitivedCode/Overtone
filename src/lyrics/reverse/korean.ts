/**
 * Revised-Romanization-style Latin text → candidate Hangul spellings (ADR 0016).
 *
 * Romanisation is lossy: it records sound, not spelling. The result is therefore a ranked list of candidates, never a
 * single answer. Strict candidates are validated by round-tripping through the forward romaniser, so every one of them
 * romanises back to exactly what was pasted.
 */
import { romaniseEojeol } from '@/engine/ko/romanise';

const S_BASE = 0xac00;
const INITIAL_INDEX = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWEL_LIST = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const FINAL_LIST = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

interface Opt {
  jamo: string;
  /** Not the Revised Romanization reading (e.g. "k" meaning ㄱ). */
  lenient?: boolean;
}

const INITIALS: ReadonlyArray<readonly [string, readonly Opt[]]> = [
  ['kk', [{ jamo: 'ㄲ' }]],
  ['tt', [{ jamo: 'ㄸ' }]],
  ['pp', [{ jamo: 'ㅃ' }]],
  ['ss', [{ jamo: 'ㅆ' }]],
  ['jj', [{ jamo: 'ㅉ' }]],
  ['ch', [{ jamo: 'ㅊ' }, { jamo: 'ㅈ', lenient: true }]],
  ['sh', [{ jamo: 'ㅅ', lenient: true }]],
  ['g', [{ jamo: 'ㄱ' }]],
  ['k', [{ jamo: 'ㅋ' }, { jamo: 'ㄱ', lenient: true }]],
  ['n', [{ jamo: 'ㄴ' }]],
  ['d', [{ jamo: 'ㄷ' }]],
  ['t', [{ jamo: 'ㅌ' }, { jamo: 'ㄷ', lenient: true }]],
  ['r', [{ jamo: 'ㄹ' }]],
  ['l', [{ jamo: 'ㄹ' }]],
  ['m', [{ jamo: 'ㅁ' }]],
  ['b', [{ jamo: 'ㅂ' }]],
  ['p', [{ jamo: 'ㅍ' }, { jamo: 'ㅂ', lenient: true }]],
  ['s', [{ jamo: 'ㅅ' }]],
  ['j', [{ jamo: 'ㅈ' }]],
  ['h', [{ jamo: 'ㅎ' }]],
];

const VOWELS: ReadonlyArray<readonly [string, readonly Opt[]]> = [
  ['yae', [{ jamo: 'ㅒ' }]],
  ['yeo', [{ jamo: 'ㅕ' }]],
  ['wae', [{ jamo: 'ㅙ' }]],
  ['ae', [{ jamo: 'ㅐ' }]],
  ['ya', [{ jamo: 'ㅑ' }]],
  ['ye', [{ jamo: 'ㅖ' }]],
  ['eo', [{ jamo: 'ㅓ' }]],
  ['eu', [{ jamo: 'ㅡ' }]],
  ['wa', [{ jamo: 'ㅘ' }]],
  ['we', [{ jamo: 'ㅞ' }]],
  ['wi', [{ jamo: 'ㅟ' }]],
  ['wo', [{ jamo: 'ㅝ' }]],
  ['yo', [{ jamo: 'ㅛ' }]],
  ['yu', [{ jamo: 'ㅠ' }]],
  ['oe', [{ jamo: 'ㅚ' }]],
  ['ui', [{ jamo: 'ㅢ' }]],
  ['oo', [{ jamo: 'ㅜ', lenient: true }]],
  ['ee', [{ jamo: 'ㅣ', lenient: true }]],
  ['a', [{ jamo: 'ㅏ' }]],
  ['e', [{ jamo: 'ㅔ' }]],
  ['i', [{ jamo: 'ㅣ' }]],
  ['o', [{ jamo: 'ㅗ' }]],
  ['u', [{ jamo: 'ㅜ' }]],
];

const FINALS: ReadonlyArray<readonly [string, string]> = [
  ['ng', 'ㅇ'],
  ['k', 'ㄱ'],
  ['n', 'ㄴ'],
  ['t', 'ㄷ'],
  ['l', 'ㄹ'],
  ['m', 'ㅁ'],
  ['p', 'ㅂ'],
];

interface Syl {
  L: string;
  V: string;
  T: string;
  lenient: boolean;
}

const MAX_PARSES = 400;
const MAX_CANDIDATES = 6;

function enumerateParses(word: string): Syl[][] {
  const out: Syl[][] = [];
  const walk = (pos: number, acc: Syl[]): void => {
    if (out.length >= MAX_PARSES) return;
    if (pos === word.length) {
      out.push(acc.slice());
      return;
    }
    const initialChoices: Array<{ len: number; opt: Opt }> = [{ len: 0, opt: { jamo: 'ㅇ' } }];
    for (const [roman, opts] of INITIALS) {
      if (word.startsWith(roman, pos))
        for (const opt of opts) initialChoices.push({ len: roman.length, opt });
    }
    for (const ini of initialChoices) {
      const vPos = pos + ini.len;
      for (const [vRoman, vOpts] of VOWELS) {
        if (!word.startsWith(vRoman, vPos)) continue;
        for (const vOpt of vOpts) {
          const afterV = vPos + vRoman.length;
          const base = {
            L: ini.opt.jamo,
            V: vOpt.jamo,
            lenient: !!ini.opt.lenient || !!vOpt.lenient,
          };
          acc.push({ ...base, T: '' });
          walk(afterV, acc);
          acc.pop();
          for (const [fRoman, fJamo] of FINALS) {
            if (!word.startsWith(fRoman, afterV)) continue;
            acc.push({ ...base, T: fJamo });
            walk(afterV + fRoman.length, acc);
            acc.pop();
          }
        }
      }
    }
  };
  walk(0, []);
  return out;
}

function compose(s: Syl): string {
  const l = INITIAL_INDEX.indexOf(s.L);
  const v = VOWEL_LIST.indexOf(s.V);
  const t = s.T === '' ? 0 : FINAL_LIST.indexOf(s.T);
  return String.fromCodePoint(S_BASE + (l * 21 + v) * 28 + t);
}

const render = (syls: readonly Syl[]): string => syls.map(compose).join('');

/** Rough preference among parses of the same text: fewer syllables, "ng" kept together, few stray vowel-only syllables. */
function parseCost(syls: readonly Syl[]): number {
  let cost = syls.length * 10;
  syls.forEach((s, i) => {
    if (s.lenient) cost += 8;
    if (s.T === 'ㄴ' && syls[i + 1]?.L === 'ㄱ') cost += 3; // "n"+"g…" is usually "ng"
    if (i > 0 && s.L === 'ㅇ') cost += 1; // a silent initial after another syllable is rarer than a consonant
  });
  return cost;
}

const NASAL_NEXT = new Set(['ㄴ', 'ㅁ']);
const LIAISON_FINALS = new Set([
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅅ',
  'ㅆ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
]);

/** Spellings that sound identical: assimilated finals and liaison (먹어 / 머거, 국물 / 궁물). */
function spellingVariants(parse: readonly Syl[]): Syl[][] {
  const variants: Syl[][] = [];
  const clone = () => parse.map((s) => ({ ...s }));
  parse.forEach((s, i) => {
    const next = parse[i + 1];
    if (!next) return;
    const alt: string | null =
      s.T === 'ㅇ' && NASAL_NEXT.has(next.L)
        ? 'ㄱ'
        : s.T === 'ㅁ' && NASAL_NEXT.has(next.L)
          ? 'ㅂ'
          : s.T === 'ㄹ' && next.L === 'ㄹ'
            ? 'ㄴ'
            : null;
    if (alt) {
      const v = clone();
      v[i]!.T = alt;
      variants.push(v);
    }
    if (s.T === '' && next.L !== 'ㅇ' && LIAISON_FINALS.has(next.L)) {
      const v = clone();
      v[i]!.T = next.L;
      v[i + 1]!.L = 'ㅇ';
      variants.push(v);
    }
  });
  return variants;
}

/** Latin letters only, lowercased, with syllable separators (hyphen, apostrophe) and combining marks removed. */
export function normaliseRoman(word: string): string {
  return word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[-'’ʼ·.]/gu, '')
    .toLowerCase();
}

/**
 * Ranked Hangul candidates for one romanised word; `[]` when the text cannot be read as Korean romanisation.
 * The first candidates are Revised Romanization readings; spellings that only fit looser conventions come last.
 */
export function romanToHangul(word: string): string[] {
  const text = normaliseRoman(word);
  if (!/^[a-z]+$/.test(text)) return [];
  const parses = enumerateParses(text)
    .map((p) => ({ p, cost: parseCost(p) }))
    .sort((a, b) => a.cost - b.cost);
  const seen = new Set<string>();
  const strict: string[] = [];
  const loose: string[] = [];
  const add = (syls: readonly Syl[]) => {
    const h = render(syls);
    if (seen.has(h)) return;
    seen.add(h);
    if (syls.some((s) => s.lenient)) loose.push(h);
    else if (romaniseEojeol(h) === text) strict.push(h);
  };
  const best = parses.slice(0, 40);
  for (const { p } of best) add(p);
  for (const { p } of best) for (const v of spellingVariants(p)) add(v);
  return [...strict, ...loose].slice(0, MAX_CANDIDATES);
}

/** Evidence for Korean over Japanese: letter groups that Hepburn Japanese does not produce. */
export const KOREAN_MARKER = /eo|eu|ui|ng|[ktplm]$|kk|pp|jj/;
