import { toHiragana } from './kana';

export type LongVowels = 'macron' | 'doubled';

const MORA: Readonly<Record<string, string>> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  ゐ: 'i',
  ゑ: 'e',
  を: 'wo',
  ゔ: 'vu',
  ゎ: 'wa',
  きゃ: 'kya',
  きゅ: 'kyu',
  きょ: 'kyo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  ちゃ: 'cha',
  ちゅ: 'chu',
  ちょ: 'cho',
  ぢゃ: 'ja',
  ぢゅ: 'ju',
  ぢょ: 'jo',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  いぇ: 'ye',
  うぃ: 'wi',
  うぇ: 'we',
  うぉ: 'wo',
  しぇ: 'she',
  じぇ: 'je',
  ちぇ: 'che',
  てぃ: 'ti',
  でぃ: 'di',
  てゅ: 'tyu',
  でゅ: 'dyu',
  とぅ: 'tu',
  どぅ: 'du',
  つぁ: 'tsa',
  つぃ: 'tsi',
  つぇ: 'tse',
  つぉ: 'tso',
  ふぁ: 'fa',
  ふぃ: 'fi',
  ふぇ: 'fe',
  ふぉ: 'fo',
  ふゅ: 'fyu',
  ゔぁ: 'va',
  ゔぃ: 'vi',
  ゔぇ: 've',
  ゔぉ: 'vo',
  ゔゅ: 'vyu',
  くぁ: 'kwa',
  ぐぁ: 'gwa',
};
const MACRON: Readonly<Record<string, string>> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
const PLAIN: Readonly<Record<string, string>> = { ā: 'a', ī: 'i', ū: 'u', ē: 'e', ō: 'o' };
const PARTICLES: Readonly<Record<string, string>> = { は: 'わ', へ: 'え', を: 'お' };

function moras(kana: string): string[] {
  const chars = Array.from(toHiragana(kana));
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const pair = c + (chars[i + 1] ?? '');
    if (chars[i + 1] && MORA[pair]) {
      out.push(pair);
      i++;
    } else if (c === 'ゝ' || c === 'ゞ') {
      const previous = out.at(-1);
      out.push(previous && c === 'ゞ' ? (previous + '\u3099').normalize('NFC') : (previous ?? c));
    } else out.push(c);
  }
  return out;
}

export function particleKana(surface: string, pos: string | null): string | undefined {
  return pos === '助詞' ? PARTICLES[toHiragana(surface)] : undefined;
}

/** Modified Hepburn with the project's written-vowel option. Pronunciation disambiguates native long vowels. */
export function hepburn(
  reading: string,
  pronunciation?: string,
  style: LongVowels = 'macron',
): string {
  const units = moras(reading);
  const pronounced = pronunciation ? moras(pronunciation) : null;
  const aligned = pronounced?.length === units.length;
  let out = '';
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const next = MORA[units[i + 1] ?? ''] ?? '';
    if (u === 'っ') {
      if (/^[^aeiou]/.test(next)) out += next.startsWith('ch') ? 't' : next[0];
    } else if (u === 'ん') {
      out += /^[aeiouy]/.test(next) ? "n'" : 'n';
    } else {
      const last = out.at(-1) ?? '';
      const vowel = PLAIN[last] ?? last;
      const written = MORA[u] ?? u;
      const nativeLong =
        (vowel === 'o' && (u === 'う' || u === 'お')) || (vowel === 'u' && u === 'う');
      if (
        MACRON[vowel] &&
        (u === 'ー' || (nativeLong && (!pronounced || (aligned && pronounced[i] === 'ー'))))
      ) {
        if (style === 'doubled') out += u === 'ー' ? vowel : written;
        else out = out.slice(0, -1) + MACRON[vowel];
      } else out += written;
    }
  }
  return out;
}
