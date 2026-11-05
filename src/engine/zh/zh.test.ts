import { beforeEach, describe, expect, it } from 'vitest';
import { analyseLineAsync } from '../analyse';
import { checkInvariants } from '../model';
import { setDictBackend } from '../dict/lookup';
import type { DictRow } from '../dict/types';
import { DEFAULT_ROMAN_PREFS, romaniseLine, tokenUnits } from '../romanLine';
import { formatPinyin, sandhiTones } from './pinyin';

describe('formatPinyin', () => {
  it.each([
    ['wo', 3, 'wǒ'],
    ['ai', 4, 'ài'],
    ['ni', 3, 'nǐ'],
    ['hao', 3, 'hǎo'],
    ['lou', 2, 'lóu'],
    ['liu', 2, 'liú'],
    ['gui', 4, 'guì'],
    ['lü', 4, 'lǜ'],
    ['nü', 3, 'nǚ'],
    ['yue', 4, 'yuè'],
    ['xiong', 2, 'xióng'],
    ['er', 2, 'ér'],
    ['ma', 5, 'ma'],
    ['de', 0, 'de'],
    ['zhuang', 1, 'zhuāng'],
    ['qiu', 1, 'qiū'],
  ])('%s tone %i → %s', (s, t, out) => {
    expect(formatPinyin(s, t, 'marks')).toBe(out);
  });
  it('numbers mode shows neutral as 5 and keeps ü', () => {
    expect(formatPinyin('lü', 4, 'numbers')).toBe('lü4');
    expect(formatPinyin('ma', 0, 'numbers')).toBe('ma5');
  });
});

describe('sandhiTones', () => {
  const u = (char: string, tone: number) => ({ char, tone });
  it('不 + tone 4 → bú; otherwise unchanged', () => {
    expect(sandhiTones([u('不', 4), u('是', 4)])).toEqual([2, 4]);
    expect(sandhiTones([u('不', 4), u('好', 3)])).toEqual([4, 3]);
  });
  it('一 changes before 4th (yí) and 1st–3rd (yì) tones', () => {
    expect(sandhiTones([u('一', 1), u('个', 4)])).toEqual([2, 4]);
    expect(sandhiTones([u('一', 1), u('天', 1)])).toEqual([4, 1]);
    expect(sandhiTones([u('一', 1), u('起', 3)])).toEqual([4, 3]);
  });
  it('一 before a neutral tone becomes yí (一个 → yí ge)', () => {
    expect(sandhiTones([u('一', 1), u('个', 5)])).toEqual([2, 5]);
  });
  it('keeps yī in ordinals, dates and when last', () => {
    expect(sandhiTones([u('第', 4), u('一', 1), u('个', 4)])).toEqual([4, 1, 4]);
    expect(sandhiTones([u('一', 1), u('月', 4)])).toEqual([1, 4]);
    expect(sandhiTones([u('统', 3), u('一', 1)])).toEqual([3, 1]);
  });
});

const row = (f: string, r: string, e: number, q = 1): DictRow => ({
  f,
  r,
  e,
  s: [{ g: ['x'] }],
  q,
  lang: 'zh',
  packVersion: 't',
});
const DICT: DictRow[] = [
  row('银行', 'yin2 hang2', 1),
  row('銀行', 'yin2 hang2', 1),
  row('行走', 'xing2 zou3', 2),
  row('还钱', 'huan2 qian2', 3),
  row('一个', 'yi1 ge4', 4),
  row('不是', 'bu4 shi4', 5),
  row('朋友', 'peng2 you5', 6),
  row('绿', 'lü4', 7),
  row('绿', 'lu4', 8),
];
function useDict(rows: DictRow[], lang: 'zh' | 'yue' | null = 'zh') {
  setDictBackend({
    installedVersion: async (l) => (l === lang ? 't' : null),
    lookup: async (l, forms) => {
      const m = new Map<string, DictRow[]>();
      for (const f of forms) {
        const hit = rows.filter((r) => r.f === f && r.lang === l);
        if (hit.length) m.set(f, hit);
      }
      return m;
    },
  });
}

describe('Mandarin analysis', () => {
  beforeEach(() => useDict(DICT));

  it('without the language pack the original text is kept and flagged', async () => {
    useDict([], null);
    const a = await analyseLineAsync({ key: 'k', text: '我爱你' }, 'zh');
    expect(a.status).toBe('partial');
    expect(a.tokens[0]).toMatchObject({ notes: ['needs-language-data'], ruby: [] });
  });

  it('segments by dictionary words with one ruby unit per character and tone data', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '银行行走' }, 'zh');
    expect(a.tokens.map((t) => t.surface)).toEqual(['银行', '行走']);
    expect(a.tokens[0]!.ruby).toEqual([
      { base: '银', reading: 'yin2', syllable: 'yin', tone: 2 },
      { base: '行', reading: 'hang2', syllable: 'hang', tone: 2 },
    ]);
    expect(a.tokens[1]!.roman).toBe('xíng zǒu');
    expect(a.tokens[0]!.dict).toEqual({ entryIds: ['1'] });
    expect(checkInvariants('银行行走', a)).toEqual([]);
  });

  it('a unique dictionary reading corrects the library (还钱 → huán qián)', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '还钱' }, 'zh');
    expect(a.tokens[0]!.roman).toBe('huán qián');
    expect(a.tokens[0]!.notes).toContain('dict-reading');
  });

  it.each(['还钱', '還錢'])(
    'reads %s when it is missing from the installed dictionary',
    async (text) => {
      useDict([]);
      const a = await analyseLineAsync({ key: 'k', text }, 'zh');
      expect(romaniseLine(a.tokens)).toBe('huán qián');
    },
  );

  it('Traditional input is read through the simplified shadow and keeps the original characters', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '銀行' }, 'zh');
    expect(a.tokens[0]).toMatchObject({ surface: '銀行', roman: 'yín háng' });
    expect(a.tokens[0]!.ruby.map((u) => u.base)).toEqual(['銀', '行']);
  });

  it('flags polyphones with no word context as medium confidence', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '行' }, 'zh');
    expect(a.tokens[0]).toMatchObject({ confidence: 'medium', notes: ['polyphone'] });
  });

  it('keeps non-Han text as separate tokens and never loses characters', async () => {
    const text = 'I love 你, 朋友!';
    const a = await analyseLineAsync({ key: 'k', text }, 'zh');
    expect(checkInvariants(text, a)).toEqual([]);
    expect(a.tokens.find((t) => t.surface === 'love')).toMatchObject({
      kind: 'latin',
      roman: 'love',
    });
  });

  it('projects tone style and sandhi at render time without re-analysis', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '一个不是' }, 'zh');
    expect(romaniseLine(a.tokens)).toBe('yī gè bù shì');
    expect(
      romaniseLine(a.tokens, { ...DEFAULT_ROMAN_PREFS, zh: { tones: 'marks', sandhi: true } }),
    ).toBe('yí gè bú shì');
    expect(
      romaniseLine(a.tokens, { ...DEFAULT_ROMAN_PREFS, zh: { tones: 'numbers', sandhi: false } }),
    ).toBe('yi1 ge4 bu4 shi4');
    expect(tokenUnits(a.tokens)[0]).toEqual(['yī', 'gè']);
  });

  it('shows ü correctly in both styles', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '绿' }, 'zh');
    expect(romaniseLine(a.tokens)).toMatch(/^l[ǜù]$/);
    expect(
      romaniseLine(a.tokens, { ...DEFAULT_ROMAN_PREFS, zh: { tones: 'numbers', sandhi: false } }),
    ).toMatch(/^l[üu]4$/);
  });
});

describe('Cantonese analysis', () => {
  beforeEach(() => {
    const y = (f: string, r: string, e: number): DictRow => ({
      f,
      r,
      e,
      s: [],
      q: 1,
      lang: 'yue',
      packVersion: 't',
    });
    useDict(
      [y('我哋', 'ngo5 dei6', 1), y('喺度', 'hai2 dou6', 2), y('学校', 'hok6 haau6', 3)],
      'yue',
    );
  });
  it('reads jyutping per character, with tone numbers', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '我哋喺度' }, 'yue');
    expect(a.tokens.map((t) => t.surface)).toEqual(['我哋', '喺度']);
    expect(romaniseLine(a.tokens)).toBe('ngo5 dei6 hai2 dou6');
    expect(a.tokens[0]!.ruby[0]).toEqual({ base: '我', reading: 'ngo5', syllable: 'ngo', tone: 5 });
  });
  it('accepts Simplified input and keeps the original characters', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '学校' }, 'yue');
    expect(a.tokens[0]!.surface).toBe('学校');
    expect(romaniseLine(a.tokens)).toBe('hok6 haau6');
  });
  it('is unaffected by the Mandarin options', async () => {
    const a = await analyseLineAsync({ key: 'k', text: '我哋' }, 'yue');
    expect(
      romaniseLine(a.tokens, { ...DEFAULT_ROMAN_PREFS, zh: { tones: 'marks', sandhi: true } }),
    ).toBe('ngo5 dei6');
  });
});
