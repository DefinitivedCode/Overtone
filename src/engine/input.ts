/** Parsing and validation of readings typed into the correction sheet (PRODUCT_SPEC J8.4). Pure. */
import { isKana, toHiragana } from './ja/kana';

/* ---------------- Japanese: romaji → hiragana ---------------- */

const BASE: Record<string, string> = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
  ka: 'か',
  ki: 'き',
  ku: 'く',
  ke: 'け',
  ko: 'こ',
  sa: 'さ',
  shi: 'し',
  si: 'し',
  su: 'す',
  se: 'せ',
  so: 'そ',
  ta: 'た',
  chi: 'ち',
  ti: 'ち',
  tsu: 'つ',
  tu: 'つ',
  te: 'て',
  to: 'と',
  na: 'な',
  ni: 'に',
  nu: 'ぬ',
  ne: 'ね',
  no: 'の',
  ha: 'は',
  hi: 'ひ',
  fu: 'ふ',
  hu: 'ふ',
  he: 'へ',
  ho: 'ほ',
  ma: 'ま',
  mi: 'み',
  mu: 'む',
  me: 'め',
  mo: 'も',
  ya: 'や',
  yu: 'ゆ',
  yo: 'よ',
  ra: 'ら',
  ri: 'り',
  ru: 'る',
  re: 'れ',
  ro: 'ろ',
  wa: 'わ',
  wi: 'ゐ',
  we: 'ゑ',
  wo: 'を',
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  za: 'ざ',
  ji: 'じ',
  zi: 'じ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
  ba: 'ば',
  bi: 'び',
  bu: 'ぶ',
  be: 'べ',
  bo: 'ぼ',
  pa: 'ぱ',
  pi: 'ぴ',
  pu: 'ぷ',
  pe: 'ぺ',
  po: 'ぽ',
  kya: 'きゃ',
  kyu: 'きゅ',
  kyo: 'きょ',
  sha: 'しゃ',
  shu: 'しゅ',
  sho: 'しょ',
  sya: 'しゃ',
  syu: 'しゅ',
  syo: 'しょ',
  cha: 'ちゃ',
  chu: 'ちゅ',
  cho: 'ちょ',
  tya: 'ちゃ',
  tyu: 'ちゅ',
  tyo: 'ちょ',
  nya: 'にゃ',
  nyu: 'にゅ',
  nyo: 'にょ',
  hya: 'ひゃ',
  hyu: 'ひゅ',
  hyo: 'ひょ',
  mya: 'みゃ',
  myu: 'みゅ',
  myo: 'みょ',
  rya: 'りゃ',
  ryu: 'りゅ',
  ryo: 'りょ',
  gya: 'ぎゃ',
  gyu: 'ぎゅ',
  gyo: 'ぎょ',
  ja: 'じゃ',
  ju: 'じゅ',
  jo: 'じょ',
  jya: 'じゃ',
  jyu: 'じゅ',
  jyo: 'じょ',
  zya: 'じゃ',
  zyu: 'じゅ',
  zyo: 'じょ',
  bya: 'びゃ',
  byu: 'びゅ',
  byo: 'びょ',
  pya: 'ぴゃ',
  pyu: 'ぴゅ',
  pyo: 'ぴょ',
  fa: 'ふぁ',
  fi: 'ふぃ',
  fe: 'ふぇ',
  fo: 'ふぉ',
  je: 'じぇ',
  che: 'ちぇ',
  she: 'しぇ',
  va: 'ゔぁ',
  vi: 'ゔぃ',
  vu: 'ゔ',
  ve: 'ゔぇ',
  vo: 'ゔぉ',
  tsa: 'つぁ',
  tsi: 'つぃ',
  tse: 'つぇ',
  tso: 'つぉ',
  thi: 'てぃ',
  dhi: 'でぃ',
  tyi: 'てぃ',
  dyi: 'でぃ',
  wu: 'う',
  la: 'ら',
  li: 'り',
  lu: 'る',
  le: 'れ',
  lo: 'ろ',
  xtsu: 'っ',
  ltsu: 'っ',
};
const LONG: Record<string, string> = {
  ā: 'aa',
  ī: 'ii',
  ū: 'uu',
  ē: 'ee',
  ō: 'ou',
  â: 'aa',
  î: 'ii',
  û: 'uu',
  ê: 'ee',
  ô: 'ou',
};

/**
 * Converts romaji to hiragana: Hepburn and Nihon/Kunrei spellings, macrons (ō → おう), doubled consonants (っ) and
 * `n`/`n'` (ん). Returns null when the text contains something that is not romaji, so the caller can show an error.
 * Text that is already kana is returned as hiragana.
 */
export function romajiToKana(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (isKana(text)) return toHiragana(text);
  const s = [...text.toLowerCase().normalize('NFC')].map((c) => LONG[c] ?? c).join('');
  if (!/^[a-z' -]+$/u.test(s)) return null;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === ' ' || c === '-' || c === "'") {
      i++;
      continue;
    }
    // Doubled consonant (not n): kka → っか
    if (c !== 'n' && /[bcdfghjklmpqrstvwxyz]/u.test(c) && s[i + 1] === c) {
      out += 'っ';
      i++;
      continue;
    }
    if (c === 'n') {
      const next = s[i + 1];
      const after = s.slice(i + 1, i + 3);
      // ん unless the n starts na/ni/nu/ne/no/nya…
      if (next && /[aiueoy]/u.test(next) && !(next === 'y' && !/^y[aiueo]/u.test(after))) {
        // fall through to table lookup
      } else {
        out += 'ん';
        i += next === "'" ? 2 : 1;
        continue;
      }
    }
    let matched = false;
    for (const len of [4, 3, 2, 1]) {
      const chunk = s.slice(i, i + len);
      const kana = BASE[chunk];
      if (kana) {
        out += kana;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }
  return out || null;
}

/* ---------------- Mandarin: pinyin ---------------- */

const FINALS =
  'a|o|e|ai|ei|ao|ou|an|en|ang|eng|ong|er|i|ia|ie|iao|iu|ian|in|iang|ing|iong|u|ua|uo|uai|ui|uan|un|uang|ueng|ü|üe|üan|ün';
const INITIALS = 'zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]';
const SYLLABLE = new RegExp(`^(?:${INITIALS})?(?:${FINALS})$`, 'u');

const TONE_MARKS: Record<string, [string, number]> = {};
for (const [v, marks] of Object.entries({
  a: 'āáǎà',
  e: 'ēéěè',
  i: 'īíǐì',
  o: 'ōóǒò',
  u: 'ūúǔù',
  ü: 'ǖǘǚǜ',
}))
  [...marks].forEach((m, i) => (TONE_MARKS[m] = [v, i + 1]));

export interface PinyinSyllable {
  /** Toneless syllable with ü (`lü`). */
  syllable: string;
  /** 1–4, or 5 for neutral. */
  tone: number;
  /** False when the syllable is not in the standard inventory (a warning, not an error: J8.4). */
  known: boolean;
}

/**
 * Parses typed pinyin: tone marks (`nǐ`), tone numbers (`ni3`, `lv4`, `lu:4`) or neutral (`ma`, `ma5`).
 * Syllables may be separated by spaces or apostrophes. Returns null for text that is not pinyin-shaped at all.
 */
export function parsePinyin(input: string): PinyinSyllable[] | null {
  const parts = input
    .trim()
    .toLowerCase()
    .split(/[\s']+/u)
    .filter(Boolean);
  if (!parts.length) return null;
  const out: PinyinSyllable[] = [];
  for (const part of parts) {
    let tone = 5;
    let letters = '';
    for (const ch of part.normalize('NFC')) {
      const mark = TONE_MARKS[ch];
      if (mark) {
        letters += mark[0];
        tone = mark[1];
      } else if (/[1-5]/u.test(ch)) tone = Number(ch);
      else letters += ch;
    }
    const syllable = letters.replace(/u:|v/gu, 'ü');
    if (!/^[a-zü]+$/u.test(syllable)) return null;
    out.push({ syllable, tone, known: SYLLABLE.test(syllable) });
  }
  return out;
}

/* ---------------- Cantonese: Jyutping ---------------- */

/** One Jyutping syllable: lowercase letters and a tone 1–6. */
export const JYUTPING = /^[a-z]+[1-6]$/u;

/** Splits typed Jyutping into syllables; null if any syllable is not `[a-z]+[1-6]`. */
export function parseJyutping(input: string): string[] | null {
  const parts = input
    .trim()
    .toLowerCase()
    .split(/[\s']+/u)
    .filter(Boolean);
  if (!parts.length || !parts.every((p) => JYUTPING.test(p))) return null;
  return parts;
}
