/**
 * Mandarin and Cantonese analysis of one Han run (LANGUAGE_ENGINE §6–7). Requires the language pack
 * (dictionary) for word segmentation; the heavy libraries are loaded lazily on first use.
 */
import { lookupInstalled } from './dict/lookup';
import type { DictRow } from './dict/types';
import { formatPinyin } from './zh/pinyin';
import { plainToken } from './model';
import type { LangCode, RubyUnit, Token } from './model';

const MAX_WORD = 8;

/** Forward maximum matching over dictionary headwords (single characters are always words). */
async function segmentWords(chars: string[], lang: 'zh' | 'yue', version?: string | null) {
  const forms = new Set<string>();
  for (let i = 0; i < chars.length; i++)
    for (let n = 2; n <= Math.min(MAX_WORD, chars.length - i); n++)
      forms.add(chars.slice(i, i + n).join(''));
  for (const c of chars) forms.add(c);
  const hits = await lookupInstalled(lang, [...forms], version);
  if (!hits) return null;
  const words: { start: number; len: number; entries: DictRow[] }[] = [];
  for (let i = 0; i < chars.length;) {
    let len = 1;
    for (let n = Math.min(MAX_WORD, chars.length - i); n >= 2; n--) {
      if (hits.has(chars.slice(i, i + n).join(''))) {
        len = n;
        break;
      }
    }
    words.push({ start: i, len, entries: hits.get(chars.slice(i, i + len).join('')) ?? [] });
    i += len;
  }
  return words;
}

const SYLLABLE = /^([a-zü]+?)([0-5])$/;
const parseSyl = (s: string): { syllable: string; tone: number } | null => {
  const m = SYLLABLE.exec(s);
  return m ? { syllable: m[1]!, tone: Number(m[2]) } : null;
};

const countAccents = (list: string[]) => new Set(list.filter((x) => /\P{ASCII}/u.test(x))).size;

let openccPromise: Promise<(s: string) => string> | null = null;
async function shadow(text: string): Promise<string> {
  openccPromise ??= import('opencc-js/t2cn').then((m) => m.Converter({ from: 't', to: 'cn' }));
  const out = (await openccPromise)(text);
  // Phrase-level conversion can change length; then fall back to feeding the original (LANGUAGE_ENGINE §6.1).
  return Array.from(out).length === Array.from(text).length ? out : text;
}

export async function analyseHan(
  text: string,
  offset: number,
  lang: LangCode,
  version?: string | null,
): Promise<Token[]> {
  const chars = Array.from(text);
  const needsData = (): Token[] => [
    plainToken({
      start: offset,
      end: offset + text.length,
      surface: text,
      lang,
      notes: ['needs-language-data'],
    }),
  ];
  if (lang !== 'zh' && lang !== 'yue') return needsData();
  const words = await segmentWords(chars, lang, version);
  if (!words) return needsData();
  // Per-character readings.
  let units: { syllable: string | null; tone: number; polyphone: boolean }[];
  let simplified: string[] = [];
  if (lang === 'zh') {
    const { pinyin } = await import('pinyin-pro');
    const shadowText = await shadow(text);
    simplified = Array.from(shadowText);
    const items = pinyin(shadowText, {
      type: 'all',
      toneType: 'none',
      v: true,
      toneSandhi: false,
    });
    units = chars.map((_, i) => {
      const it = items[i];
      if (!it || !it.isZh || !it.pinyin) return { syllable: null, tone: 0, polyphone: false };
      return {
        syllable: it.pinyin.replace(/v/g, 'ü'),
        tone: it.num === 0 ? 5 : it.num,
        polyphone: countAccents(it.polyphonic ?? []) > 1,
      };
    });
  } else {
    const { getJyutpingList, getJyutpingCandidates } = await import('to-jyutping');
    const list = getJyutpingList(text);
    units = chars.map((ch, i) => {
      const jy = list[i]?.[1];
      const m = jy ? /^([a-z]+)([1-6])$/.exec(jy) : null;
      if (!m) return { syllable: null, tone: 0, polyphone: false };
      const cand = getJyutpingCandidates(ch)?.[0]?.[1] ?? [];
      return { syllable: m[1]!, tone: Number(m[2]), polyphone: cand.length >= 3 };
    });
  }

  const tokens: Token[] = [];
  let at = offset;
  for (const w of words) {
    const sl = chars.slice(w.start, w.start + w.len);
    const surface = sl.join('');
    const notes: string[] = [];
    let confidence: Token['confidence'] = 'high';
    const us = units.slice(w.start, w.start + w.len).map((u) => ({ ...u }));

    if (lang === 'zh' && w.len >= 2 && w.entries.length > 0) {
      // Dictionary reading wins when the word has exactly one reading of the right length.
      const readings = [
        ...new Set(
          w.entries
            .map((e) => e.r.split(' '))
            .filter((p) => p.length === w.len)
            .map((p) => p.join(' ')),
        ),
      ];
      const mine = us.map((u) => (u.syllable ? `${u.syllable}${u.tone}` : '?')).join(' ');
      if (readings.length === 1 && readings[0] !== mine) {
        const parsed = readings[0]!.split(' ').map(parseSyl);
        if (parsed.every(Boolean)) {
          parsed.forEach((p, i) => {
            us[i] = { syllable: p!.syllable, tone: p!.tone, polyphone: false };
          });
          notes.push('dict-reading');
        }
      } else if (readings.length > 1 && !readings.includes(mine)) {
        confidence = 'medium';
        notes.push('reading-mismatch');
      }
    } else if (
      lang === 'zh' &&
      w.len === 1 &&
      simplified[w.start] === '还' &&
      simplified[w.start + 1] === '钱'
    ) {
      // 還錢 is absent from the pinned CC-CEDICT. Reading per Taiwan MOE's Concised Mandarin Chinese Dictionary.
      // https://dict.concised.moe.edu.tw/dictView.jsp?ID=20767&la=1&powerMode=0
      us[0] = { syllable: 'huan', tone: 2, polyphone: false };
    } else if (lang === 'zh' && w.len === 1 && us[0]?.polyphone) {
      confidence = 'medium';
      notes.push('polyphone');
    } else if (lang === 'yue' && w.len === 1 && us[0]?.polyphone) {
      confidence = 'medium';
      notes.push('polyphone');
    }
    if (us.some((u) => u.syllable === null)) {
      confidence = us.every((u) => u.syllable === null) ? 'none' : 'low';
      notes.push('unknown-reading');
    }

    const ruby: RubyUnit[] = us.map((u, i) =>
      u.syllable === null
        ? { base: sl[i]!, reading: null }
        : { base: sl[i]!, reading: `${u.syllable}${u.tone}`, syllable: u.syllable, tone: u.tone },
    );
    const roman = us
      .map((u, i) =>
        u.syllable === null
          ? sl[i]!
          : lang === 'zh'
            ? formatPinyin(u.syllable, u.tone, 'marks')
            : `${u.syllable}${u.tone}`,
      )
      .join(' ');
    tokens.push(
      plainToken({
        start: at,
        end: at + surface.length,
        surface,
        lang,
        ruby,
        reading: ruby.every((r) => r.reading) ? ruby.map((r) => r.reading).join(' ') : null,
        roman,
        dict: w.entries.length
          ? { entryIds: [...new Set(w.entries.map((e) => String(e.e)))] }
          : null,
        confidence,
        notes,
      }),
    );
    at += surface.length;
  }
  return tokens;
}
