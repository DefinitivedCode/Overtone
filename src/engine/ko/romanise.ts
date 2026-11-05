/**
 * Korean → Revised Romanization of Korea, pronunciation-based (LANGUAGE_ENGINE §5.1).
 * Operates per eojeol (space-delimited word); no liaison across spaces. Pure and deterministic.
 */
import { KO_EXCEPTIONS } from './exceptions';

export type KoMode = 'pronunciation' | 'letters';

const S_BASE = 0xac00;
const S_END = 0xd7a3;

const INITIALS = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;
const VOWELS = [
  'ㅏ',
  'ㅐ',
  'ㅑ',
  'ㅒ',
  'ㅓ',
  'ㅔ',
  'ㅕ',
  'ㅖ',
  'ㅗ',
  'ㅘ',
  'ㅙ',
  'ㅚ',
  'ㅛ',
  'ㅜ',
  'ㅝ',
  'ㅞ',
  'ㅟ',
  'ㅠ',
  'ㅡ',
  'ㅢ',
  'ㅣ',
] as const;
// Finals as arrays of jamo (clusters have two).
const FINALS: readonly (readonly string[])[] = [
  [],
  ['ㄱ'],
  ['ㄲ'],
  ['ㄱ', 'ㅅ'],
  ['ㄴ'],
  ['ㄴ', 'ㅈ'],
  ['ㄴ', 'ㅎ'],
  ['ㄷ'],
  ['ㄹ'],
  ['ㄹ', 'ㄱ'],
  ['ㄹ', 'ㅁ'],
  ['ㄹ', 'ㅂ'],
  ['ㄹ', 'ㅅ'],
  ['ㄹ', 'ㅌ'],
  ['ㄹ', 'ㅍ'],
  ['ㄹ', 'ㅎ'],
  ['ㅁ'],
  ['ㅂ'],
  ['ㅂ', 'ㅅ'],
  ['ㅅ'],
  ['ㅆ'],
  ['ㅇ'],
  ['ㅈ'],
  ['ㅊ'],
  ['ㅋ'],
  ['ㅌ'],
  ['ㅍ'],
  ['ㅎ'],
];

const INITIAL_ROMAN: Record<string, string> = {
  ㄱ: 'g',
  ㄲ: 'kk',
  ㄴ: 'n',
  ㄷ: 'd',
  ㄸ: 'tt',
  ㄹ: 'r',
  ㅁ: 'm',
  ㅂ: 'b',
  ㅃ: 'pp',
  ㅅ: 's',
  ㅆ: 'ss',
  ㅇ: '',
  ㅈ: 'j',
  ㅉ: 'jj',
  ㅊ: 'ch',
  ㅋ: 'k',
  ㅌ: 't',
  ㅍ: 'p',
  ㅎ: 'h',
};
const VOWEL_ROMAN: Record<string, string> = {
  ㅏ: 'a',
  ㅐ: 'ae',
  ㅑ: 'ya',
  ㅒ: 'yae',
  ㅓ: 'eo',
  ㅔ: 'e',
  ㅕ: 'yeo',
  ㅖ: 'ye',
  ㅗ: 'o',
  ㅘ: 'wa',
  ㅙ: 'wae',
  ㅚ: 'oe',
  ㅛ: 'yo',
  ㅜ: 'u',
  ㅝ: 'wo',
  ㅞ: 'we',
  ㅟ: 'wi',
  ㅠ: 'yu',
  ㅡ: 'eu',
  ㅢ: 'ui',
  ㅣ: 'i',
};
/** Final sounds after neutralisation (pronunciation mode). */
const FINAL_SOUND_ROMAN: Record<string, string> = {
  ㄱ: 'k',
  ㄴ: 'n',
  ㄷ: 't',
  ㄹ: 'l',
  ㅁ: 'm',
  ㅂ: 'p',
  ㅇ: 'ng',
};
/** Final letters, by spelling (letters mode). */
const FINAL_LETTER_ROMAN: Record<string, string> = {
  ㄱ: 'k',
  ㄲ: 'kk',
  ㄳ: 'ks',
  ㄴ: 'n',
  ㄵ: 'nj',
  ㄶ: 'nh',
  ㄷ: 't',
  ㄹ: 'l',
  ㄺ: 'lk',
  ㄻ: 'lm',
  ㄼ: 'lp',
  ㄽ: 'ls',
  ㄾ: 'lt',
  ㄿ: 'lp',
  ㅀ: 'lh',
  ㅁ: 'm',
  ㅂ: 'p',
  ㅄ: 'ps',
  ㅅ: 's',
  ㅆ: 'ss',
  ㅇ: 'ng',
  ㅈ: 'j',
  ㅊ: 'ch',
  ㅋ: 'k',
  ㅌ: 't',
  ㅍ: 'p',
  ㅎ: 'h',
};

interface Syl {
  L: string;
  V: string;
  T: string[];
}

const isHangulSyllable = (cp: number) => cp >= S_BASE && cp <= S_END;

function decompose(ch: string): Syl {
  const code = ch.codePointAt(0)! - S_BASE;
  return {
    L: INITIALS[Math.floor(code / 588)]!,
    V: VOWELS[Math.floor((code % 588) / 28)]!,
    T: [...FINALS[code % 28]!],
  };
}

const K_CLASS = new Set(['ㄱ', 'ㄲ', 'ㅋ']);
const T_CLASS = new Set(['ㄷ', 'ㅅ', 'ㅆ', 'ㅈ', 'ㅊ', 'ㅌ', 'ㅎ']);
const P_CLASS = new Set(['ㅂ', 'ㅍ']);

/** Rules 1 + 9: cluster simplification and final neutralisation. `next` is the following initial. */
function simplifyFinal(T: string[], next: string | null): string[] {
  if (T.length === 2) {
    const [a, b] = T as [string, string];
    // ㄺ before ㄱ keeps ㄹ (읽고 → 일꼬); otherwise the first jamo survives, except ㄻ → ㅁ, ㄿ → ㅂ.
    if (a === 'ㄹ' && b === 'ㄱ') return [next === 'ㄱ' ? 'ㄹ' : 'ㄱ'];
    if (a === 'ㄹ' && b === 'ㅁ') return ['ㅁ'];
    if (a === 'ㄹ' && b === 'ㅍ') return ['ㅂ'];
    if (a === 'ㅂ' && b === 'ㅅ') return ['ㅂ'];
    if (a === 'ㄱ' && b === 'ㅅ') return ['ㄱ'];
    return [a]; // ㄵ ㄶ ㄼ ㄽ ㄾ ㅀ → first jamo
  }
  const f = T[0];
  if (!f) return [];
  if (K_CLASS.has(f)) return ['ㄱ'];
  if (T_CLASS.has(f)) return ['ㄷ'];
  if (P_CLASS.has(f)) return ['ㅂ'];
  return [f];
}

/** Applies the pronunciation rules (LANGUAGE_ENGINE §5.1 rules 1–9) in place across a Hangul run. */
function applyRules(syls: Syl[]): void {
  for (let i = 0; i < syls.length; i++) {
    const cur = syls[i]!;
    const next = syls[i + 1];
    if (!next) {
      cur.T = simplifyFinal(cur.T, null);
      break;
    }
    const last = cur.T[cur.T.length - 1];

    if (next.L === 'ㅇ' && cur.T.length > 0 && last !== 'ㅇ') {
      // Rule 5: palatalisation (ㄷ/ㅌ + 이).
      if ((last === 'ㄷ' || last === 'ㅌ') && cur.T.length === 1 && next.V === 'ㅣ') {
        cur.T = [];
        next.L = last === 'ㄷ' ? 'ㅈ' : 'ㅊ';
        continue;
      }
      // Rule 4: ㅎ is silent before a vowel (좋아 → 조아, 많아 → 마나).
      if (last === 'ㅎ') {
        cur.T.pop();
        if (cur.T.length === 1) {
          next.L = cur.T[0]!;
          cur.T = [];
        }
        continue;
      }
      // Rule 2: liaison — the last consonant moves to the next syllable.
      next.L = last!;
      cur.T.pop();
      if (cur.T.length > 0) cur.T = simplifyFinal(cur.T, null); // 앉아 → 안자
      continue;
    }

    // Rule 3: aspiration with a following ㅎ (축하 → 추카, 맞히다 → 마치다).
    if (next.L === 'ㅎ' && cur.T.length > 0) {
      const asp: Record<string, string> = {
        ㄱ: 'ㅋ',
        ㄲ: 'ㅋ',
        ㅋ: 'ㅋ',
        ㄷ: 'ㅌ',
        ㅅ: 'ㅌ',
        ㅆ: 'ㅌ',
        ㅌ: 'ㅌ',
        ㅊ: 'ㅌ',
        ㅈ: 'ㅊ',
        ㅂ: 'ㅍ',
        ㅍ: 'ㅍ',
      };
      const to = asp[last!];
      if (to) {
        cur.T.pop();
        next.L = to;
        cur.T = simplifyFinal(cur.T, next.L);
        continue;
      }
    }
    // Rule 3 (ㅎ final + ㄱ/ㄷ/ㅈ): 좋다 → 조타, 많고 → 만코.
    if (last === 'ㅎ' && (next.L === 'ㄱ' || next.L === 'ㄷ' || next.L === 'ㅈ')) {
      cur.T.pop();
      next.L = next.L === 'ㄱ' ? 'ㅋ' : next.L === 'ㄷ' ? 'ㅌ' : 'ㅊ';
      cur.T = simplifyFinal(cur.T, next.L);
      continue;
    }

    cur.T = simplifyFinal(cur.T, next.L);
    const f = cur.T[0];
    if (!f) continue;

    // Rules 6–8: nasalisation and liquidisation.
    if (next.L === 'ㄴ' || next.L === 'ㅁ') {
      if (f === 'ㄱ') cur.T = ['ㅇ'];
      else if (f === 'ㄷ') cur.T = ['ㄴ'];
      else if (f === 'ㅂ') cur.T = ['ㅁ'];
    }
    if (next.L === 'ㄹ') {
      if (f === 'ㅁ' || f === 'ㅇ') next.L = 'ㄴ';
      else if (f === 'ㄱ') {
        cur.T = ['ㅇ'];
        next.L = 'ㄴ';
      } else if (f === 'ㄷ') {
        cur.T = ['ㄴ'];
        next.L = 'ㄴ';
      } else if (f === 'ㅂ') {
        cur.T = ['ㅁ'];
        next.L = 'ㄴ';
      } else if (f === 'ㄴ') cur.T = ['ㄹ'];
    }
    if (f === 'ㄹ' && next.L === 'ㄴ') next.L = 'ㄹ';
  }
}

/** Romanisation of a Hangul run, one string per syllable (after sound changes, so the pieces join into the word). */
function romaniseRunParts(run: string, mode: KoMode): string[] {
  const syls = [...run].map(decompose);
  if (mode === 'pronunciation') applyRules(syls);
  const parts: string[] = [];
  for (let i = 0; i < syls.length; i++) {
    const s = syls[i]!;
    const prev = syls[i - 1];
    let ini = INITIAL_ROMAN[s.L] ?? '';
    // ㄹ is "l" when it follows a final ㄹ (ㄹㄹ → ll), "r" otherwise.
    if (s.L === 'ㄹ' && prev && prev.T.length > 0 && prev.T[prev.T.length - 1] === 'ㄹ') ini = 'l';
    let part = ini + (VOWEL_ROMAN[s.V] ?? '');
    if (mode === 'pronunciation') part += s.T.map((j) => FINAL_SOUND_ROMAN[j] ?? '').join('');
    else part += FINAL_LETTER_ROMAN[composeFinalLetter(s.T)] ?? '';
    parts.push(part);
  }
  return parts;
}

const romaniseRun = (run: string, mode: KoMode): string => romaniseRunParts(run, mode).join('');

const CLUSTER: Record<string, string> = {
  ㄱㅅ: 'ㄳ',
  ㄴㅈ: 'ㄵ',
  ㄴㅎ: 'ㄶ',
  ㄹㄱ: 'ㄺ',
  ㄹㅁ: 'ㄻ',
  ㄹㅂ: 'ㄼ',
  ㄹㅅ: 'ㄽ',
  ㄹㅌ: 'ㄾ',
  ㄹㅍ: 'ㄿ',
  ㄹㅎ: 'ㅀ',
  ㅂㅅ: 'ㅄ',
};
const composeFinalLetter = (T: readonly string[]): string =>
  T.length === 2 ? (CLUSTER[T.join('')] ?? '') : (T[0] ?? '');

// Compatibility jamo typed on their own (ㅋㅋ, ㅠㅠ): transliterated letter by letter.
// A lone ㅇ is read "eung"; the bare silent initial would produce an empty string, so use "ng".
const COMPAT: Record<string, string> = { ...INITIAL_ROMAN, ...VOWEL_ROMAN, ㅇ: 'ng' };

/** Romanises one eojeol. Non-Hangul characters pass through unchanged. */
export function romaniseEojeol(word: string, mode: KoMode = 'pronunciation'): string {
  if (mode === 'pronunciation') {
    for (const [key, pron] of KO_EXCEPTIONS) {
      if (word === key) return romaniseRun(pron, 'pronunciation');
    }
  }
  let out = '';
  let run = '';
  const flush = () => {
    if (run) out += romaniseRun(run, mode);
    run = '';
  };
  for (const ch of word) {
    const cp = ch.codePointAt(0)!;
    if (isHangulSyllable(cp)) run += ch;
    else {
      flush();
      out += COMPAT[ch] ?? ch;
    }
  }
  flush();
  return out;
}

/**
 * The same romanisation as `romaniseEojeol`, split at Hangul syllable boundaries. Because it comes from the
 * pronunciation pipeline, each piece reflects sound changes (좋다 → jo, ta; 있어요 → i, sseo, yo) and
 * `parts.join('')` always equals `romaniseEojeol(word, mode)`. Characters outside Hangul syllables stay attached to
 * the preceding piece.
 */
export function romaniseEojeolSyllables(word: string, mode: KoMode = 'pronunciation'): string[] {
  if (mode === 'pronunciation') {
    for (const [key, pron] of KO_EXCEPTIONS) {
      if (word === key) return romaniseRunParts(pron, 'pronunciation');
    }
  }
  const parts: string[] = [];
  let run = '';
  const flush = () => {
    if (run) parts.push(...romaniseRunParts(run, mode));
    run = '';
  };
  const attach = (text: string) => {
    if (parts.length > 0) parts[parts.length - 1] += text;
    else parts.push(text);
  };
  for (const ch of word) {
    const cp = ch.codePointAt(0)!;
    if (isHangulSyllable(cp)) run += ch;
    else {
      flush();
      attach(COMPAT[ch] ?? ch);
    }
  }
  flush();
  return parts;
}

/** Romanises text word by word (whitespace-delimited); whitespace is preserved. */
export function romaniseKorean(text: string, mode: KoMode = 'pronunciation'): string {
  return text
    .split(/(\s+)/u)
    .map((part) => (/^\s*$/u.test(part) ? part : romaniseEojeol(part, mode)))
    .join('');
}

/** True if the string contains at least one Hangul syllable. */
export const hasHangul = (s: string): boolean =>
  [...s].some((c) => isHangulSyllable(c.codePointAt(0)!));
