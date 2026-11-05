/**
 * Script-based song-language detection (LANGUAGE_ENGINE §4.3). Pure function; no worker needed.
 * Mandarin vs Cantonese cannot be told apart reliably by script, so Han-only text always asks the
 * user to choose and only offers a *suggestion*.
 */
import { detectKind } from '@/lyrics/parse';

export type DetectedLang = 'ko' | 'ja';
export type Confidence = 'high' | 'medium' | 'low';

export interface Detection {
  /** Resolved language for Korean/Japanese; null when the user must choose. */
  language: DetectedLang | null;
  confidence: Confidence;
  reason: 'hangul' | 'kana' | 'han-only' | 'no-letters';
  /** Han-only text: the user must pick Mandarin or Cantonese. */
  needsChoice: boolean;
  suggestion?: 'zh' | 'yue';
}

const HANGUL = /\p{Script=Hangul}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}ーゝゞヽヾ]/u;
const HAN = /\p{Script=Han}/u;

// Strongly Cantonese characters, and ones that also occur in Mandarin (weighted lower).
const CANTONESE_STRONG = new Set([...'嘅咗唔冇佢哋喺嘢啲噉嚟睇瞓揾搵攰乜咩囉喎嗰冚啱靚']);
const CANTONESE_WEAK = new Set([...'係呢咁']);

export function detectLanguage(text: string): Detection {
  let h = 0;
  let k = 0;
  let c = 0;
  let strong = 0;
  let weak = 0;
  for (const line of text.split('\n')) {
    if (detectKind(line) !== 'lyric') continue;
    for (const ch of line) {
      if (HANGUL.test(ch)) h++;
      else if (KANA.test(ch)) k++;
      else if (HAN.test(ch)) {
        c++;
        if (CANTONESE_STRONG.has(ch)) strong++;
        else if (CANTONESE_WEAK.has(ch)) weak++;
      }
    }
  }
  const total = h + k + c;
  if (total === 0)
    return { language: null, confidence: 'low', reason: 'no-letters', needsChoice: false };
  if (h >= 0.3 * total)
    return {
      language: 'ko',
      confidence: h >= 0.6 * total ? 'high' : 'medium',
      reason: 'hangul',
      needsChoice: false,
    };
  if (k > 0 && k >= 0.05 * total)
    return {
      language: 'ja',
      confidence: k >= 0.2 * (k + c) ? 'high' : 'medium',
      reason: 'kana',
      needsChoice: false,
    };
  if (h === 0 && k === 0) {
    const score = strong + 0.3 * weak;
    const suggestion = (score / c) * 100 >= 2 ? 'yue' : 'zh';
    return { language: null, confidence: 'low', reason: 'han-only', needsChoice: true, suggestion };
  }
  // A little Hangul or kana in otherwise Han text: lean on whichever is present, low confidence.
  return {
    language: h >= k ? 'ko' : 'ja',
    confidence: 'low',
    reason: h >= k ? 'hangul' : 'kana',
    needsChoice: false,
  };
}

const SIMPLIFIED = new Set([...'爱们这个来说时国会对没还为从样学发开里长门问见头现点关乐么']);
const TRADITIONAL = new Set([...'愛們這個來說時國會對沒還為從樣學發開裡長門問見頭現點關樂麼']);

/** Simplified vs Traditional, for the `lang` attribute (font selection). Defaults to Simplified. */
export function hanVariant(text: string): 'hans' | 'hant' {
  let s = 0;
  let t = 0;
  for (const ch of text) {
    if (SIMPLIFIED.has(ch)) s++;
    else if (TRADITIONAL.has(ch)) t++;
  }
  return t > s ? 'hant' : 'hans';
}

/** BCP-47 `lang` for lyric text of a song language (Han unification makes this functional). */
export function langAttr(language: 'ko' | 'ja' | 'zh' | 'yue', text: string): string {
  switch (language) {
    case 'ko':
      return 'ko';
    case 'ja':
      return 'ja';
    case 'yue':
      return 'zh-HK';
    case 'zh':
      return hanVariant(text) === 'hant' ? 'zh-Hant' : 'zh-Hans';
  }
}
