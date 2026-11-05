/** Pinyin formatting and 一/不 tone sandhi as render-time projections (LANGUAGE_ENGINE §6.4–6.5). Pure. */
import type { Token } from '../model';

export type ToneStyle = 'marks' | 'numbers';

const MARKS: Record<string, string> = {
  a: 'āáǎà',
  e: 'ēéěè',
  i: 'īíǐì',
  o: 'ōóǒò',
  u: 'ūúǔù',
  ü: 'ǖǘǚǜ',
};

/** Index of the vowel that carries the tone mark: a/e first, ou → o, otherwise the last vowel. */
function markIndex(syl: string): number {
  const a = syl.search(/[ae]/);
  if (a >= 0) return a;
  const ou = syl.indexOf('ou');
  if (ou >= 0) return ou;
  let last = -1;
  for (let i = 0; i < syl.length; i++) if ('iouü'.includes(syl[i]!)) last = i;
  return last;
}

/** `formatPinyin('lü', 4, 'marks')` → `lǜ`; numbers mode → `lü4` (neutral tone 5). */
export function formatPinyin(syllable: string, tone: number, style: ToneStyle): string {
  if (style === 'numbers') return `${syllable}${tone === 0 ? 5 : tone}`;
  if (tone < 1 || tone > 4) return syllable;
  const i = markIndex(syllable);
  if (i < 0) return syllable;
  const v = syllable[i]!;
  const marked = MARKS[v]?.[tone - 1];
  return marked ? syllable.slice(0, i) + marked + syllable.slice(i + 1) : syllable;
}

interface Unit {
  char: string;
  tone: number;
}

/** Characters before which 一 keeps its citation tone (ordinals, dates, numbers). */
const KEEP_BEFORE = /[月号日]/u;
const KEEP_AFTER = /[第万千百十零〇]/u;

/**
 * Tone changes for 不 and 一 from neighbouring tones: 不 + tone 4 → 2; 一 + tone 4 or neutral → 2; 一 + tones 1–3 → 4.
 * Ordinal/counting contexts (第一, 一月, standalone 一) keep yī. Returns the new tone for each unit.
 */
export function sandhiTones(units: readonly Unit[]): number[] {
  return units.map((u, i) => {
    const next = units[i + 1];
    const prev = units[i - 1];
    if (!next) return u.tone;
    if (u.char === '不' && u.tone === 4 && next.tone === 4) return 2;
    if (u.char === '一' && u.tone === 1) {
      if ((prev && KEEP_AFTER.test(prev.char)) || KEEP_BEFORE.test(next.char)) return u.tone;
      if (next.tone === 4 || next.tone === 5) return 2; // before a neutral tone too: yí ge
      if (next.tone >= 1 && next.tone <= 3) return 4;
    }
    return u.tone;
  });
}

export interface ZhPrefs {
  tones: ToneStyle;
  sandhi: boolean;
}

/**
 * Display syllables for every Mandarin token (index-aligned with `tokens`; null for other tokens),
 * with sandhi computed across the whole line when enabled.
 */
export function zhDisplay(tokens: readonly Token[], prefs: ZhPrefs): (string[] | null)[] {
  const flat: { ti: number; ui: number; char: string; syllable: string; tone: number }[] = [];
  tokens.forEach((t, ti) => {
    if (t.kind === 'word' && t.lang === 'zh')
      t.ruby.forEach((u, ui) => {
        if (u.syllable)
          flat.push({ ti, ui, char: u.base, syllable: u.syllable, tone: u.tone ?? 5 });
      });
  });
  const tones = prefs.sandhi ? sandhiTones(flat) : flat.map((f) => f.tone);
  const out: (string[] | null)[] = tokens.map((t) =>
    t.kind === 'word' && t.lang === 'zh' ? t.ruby.map((u) => u.reading ?? u.base) : null,
  );
  flat.forEach((f, i) => {
    out[f.ti]![f.ui] = formatPinyin(f.syllable, tones[i]!, prefs.tones);
  });
  return out;
}
