/**
 * Romaji (Hepburn, plus common Nihon-shiki / Kunrei spellings and macrons) → kana (ADR 0016).
 *
 * Only kana is produced: romaji records no kanji, so reconstructing them would be invention. Long vowels and the
 * particles は / へ / を are the real ambiguities and are offered as alternatives.
 */
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
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  sa: 'さ',
  shi: 'し',
  si: 'し',
  su: 'す',
  se: 'せ',
  so: 'そ',
  za: 'ざ',
  ji: 'じ',
  zi: 'じ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  ta: 'た',
  chi: 'ち',
  ti: 'ち',
  tsu: 'つ',
  tu: 'つ',
  te: 'て',
  to: 'と',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
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
  wo: 'を',
  kya: 'きゃ',
  kyu: 'きゅ',
  kyo: 'きょ',
  gya: 'ぎゃ',
  gyu: 'ぎゅ',
  gyo: 'ぎょ',
  sha: 'しゃ',
  shu: 'しゅ',
  sho: 'しょ',
  sya: 'しゃ',
  syu: 'しゅ',
  syo: 'しょ',
  ja: 'じゃ',
  ju: 'じゅ',
  jo: 'じょ',
  jya: 'じゃ',
  jyu: 'じゅ',
  jyo: 'じょ',
  zya: 'じゃ',
  zyu: 'じゅ',
  zyo: 'じょ',
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
  bya: 'びゃ',
  byu: 'びゅ',
  byo: 'びょ',
  pya: 'ぴゃ',
  pyu: 'ぴゅ',
  pyo: 'ぴょ',
  mya: 'みゃ',
  myu: 'みゅ',
  myo: 'みょ',
  rya: 'りゃ',
  ryu: 'りゅ',
  ryo: 'りょ',
  she: 'しぇ',
  je: 'じぇ',
  che: 'ちぇ',
  ye: 'いぇ',
  wi: 'うぃ',
  we: 'うぇ',
  thi: 'てぃ',
  dhi: 'でぃ',
  fa: 'ふぁ',
  fi: 'ふぃ',
  fe: 'ふぇ',
  fo: 'ふぉ',
  tsa: 'つぁ',
  tsi: 'つぃ',
  tse: 'つぇ',
  tso: 'つぉ',
  va: 'ゔぁ',
  vi: 'ゔぃ',
  vu: 'ゔ',
  ve: 'ゔぇ',
  vo: 'ゔぉ',
};

const KEYS = Object.keys(BASE).sort((a, b) => b.length - a.length);
const VOWEL = /[aeiou]/;

const MACRON_VOWEL: Record<string, string> = {
  ā: 'a',
  â: 'a',
  ī: 'i',
  î: 'i',
  ū: 'u',
  û: 'u',
  ē: 'e',
  ê: 'e',
  ō: 'o',
  ô: 'o',
};

type LongStyle = 'ou' | 'oo' | 'mark';

/** Parses one romaji word into hiragana, or null if any part is not romaji. `mark` writes macron vowels as ー. */
function parse(word: string, style: LongStyle): string | null {
  let out = '';
  let i = 0;
  while (i < word.length) {
    const c = word[i]!;
    if (c === '~') {
      // Long-vowel mark after a vowel kana: the vowel is `plain`, the previous kana ends in it.
      const plain = word[i - 1] ?? '';
      if (style === 'mark') out += 'ー';
      else if (plain === 'o') out += style === 'oo' ? 'お' : 'う';
      else if (plain === 'e') out += style === 'oo' ? 'え' : 'い';
      else out += BASE[plain] ?? '';
      i++;
      continue;
    }
    // Sokuon: doubled consonant, or "tch".
    if (c !== 'n' && !VOWEL.test(c) && word[i + 1] === c && /[kstpgzdbhfjcmrwy]/.test(c)) {
      out += 'っ';
      i++;
      continue;
    }
    if (c === 't' && word.startsWith('ch', i + 1)) {
      out += 'っ';
      i++;
      continue;
    }
    const key = KEYS.find((k) => word.startsWith(k, i));
    if (key) {
      out += BASE[key];
      i += key.length;
      continue;
    }
    if (c === 'n' || (c === 'm' && /[bpm]/.test(word[i + 1] ?? ''))) {
      out += 'ん';
      i++;
      continue;
    }
    return null;
  }
  return out === '' || out.endsWith('っ') ? null : out;
}

const PARTICLES: Record<string, string[]> = {
  wa: ['は', 'わ'],
  e: ['へ', 'え'],
  o: ['を', 'お'],
};

/** Strips separators (hyphen, apostrophe in "n'") but notes whether an apostrophe forced ん. */
function prepare(word: string): string {
  return word
    .normalize('NFC')
    .toLowerCase()
    .replace(/[āâīîūûēêōô]/gu, (ch) => `${MACRON_VOWEL[ch]}~`)
    .replace(/n['’ʼ-](?=[aeiouy])/gu, 'N')
    .replace(/['’ʼ-]/gu, '')
    .replace(/N/g, 'n!');
}

/** Candidate kana for one romaji word, best first; `[]` when it cannot be read as romaji. */
export function romajiToKana(word: string): string[] {
  const prepared = prepare(word);
  // "n!" marks an explicit n' (ん before a vowel): parse each side separately.
  const pieces = prepared.split('!');
  const hasMacron = prepared.includes('~');
  const build = (style: LongStyle): string | null => {
    let out = '';
    for (const piece of pieces) {
      if (piece === '') continue;
      const p = parse(piece, style);
      if (p === null) return null;
      out += p;
    }
    return out;
  };
  const plain = prepared.replace(/!/g, '');
  const particle = PARTICLES[plain];
  if (particle) return particle;
  const primary = build('ou');
  if (primary === null || primary === '') return [];
  const out: string[] = [primary];
  if (hasMacron) {
    const alt = build('oo');
    if (alt && alt !== primary) out.push(alt);
  }
  out.push(toKatakana(hasMacron ? (build('mark') ?? primary) : primary));
  return [...new Set(out)];
}

const toKatakana = (hira: string): string =>
  hira.replace(/[ぁ-ゖ]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));

/** Evidence for Japanese over Korean: letter groups that Revised Romanization does not produce. */
export const JAPANESE_MARKER = /tsu|shi|sh|ts|fu|hu|ky|ry|ou|oo|uu|desu|masu|[āīūēōôûî]|^wo$|n'/;
