import { describe, expect, it } from 'vitest';
import { analyseLine } from './analyse';
import { checkInvariants } from './model';
import type { LineAnalysis, Token } from './model';
import { applyCorrections } from './overlay';
import type { OverlayCorrection } from './overlay';
import { japaneseRomanRuns, romaniseLine, tokenRoman } from './romanLine';
import type { RomanPrefs } from './romanLine';
import { parseJyutping, parsePinyin, romajiToKana } from './input';

const ko = (text: string): LineAnalysis => analyseLine({ key: 'k', text }, 'ko');
const fix = (c: Partial<OverlayCorrection> & { surface: string }): OverlayCorrection => ({
  id: 'c1',
  lineKey: 'k',
  occurrence: null,
  language: 'ko',
  patch: {},
  ...c,
});
const word = (a: LineAnalysis, surface: string): Token =>
  a.tokens.find((t) => t.surface === surface)!;
const PREFS: RomanPrefs = {
  ko: { mode: 'pronunciation' },
  zh: { tones: 'marks', sandhi: false },
  ja: { longVowels: 'macron', showRomajiLine: true, furiganaForKanaWords: false },
};

describe('romajiToKana', () => {
  it.each([
    ['tōkyō', 'とうきょう'],
    ['toukyou', 'とうきょう'],
    ['kitte', 'きって'],
    ['shinbun', 'しんぶん'],
    ["kon'nichi", 'こんにち'],
    ['gakkou', 'がっこう'],
    ['nyan', 'にゃん'],
    ['アイ', 'あい'],
    ['きのう', 'きのう'],
    ['ja', 'じゃ'],
  ])('%s → %s', (romaji, kana) => expect(romajiToKana(romaji)).toBe(kana));
  it('rejects text that is not romaji', () => {
    expect(romajiToKana('hello?')).toBeNull();
    expect(romajiToKana('')).toBeNull();
    expect(romajiToKana('ni3')).toBeNull();
  });
});

describe('pinyin and Jyutping input', () => {
  it('accepts tone numbers, marks and ü spellings', () => {
    expect(parsePinyin('ni3 hao3')).toEqual([
      { syllable: 'ni', tone: 3, known: true },
      { syllable: 'hao', tone: 3, known: true },
    ]);
    expect(parsePinyin('nǐ')).toEqual([{ syllable: 'ni', tone: 3, known: true }]);
    expect(parsePinyin('lv4')?.[0]).toMatchObject({ syllable: 'lü', tone: 4, known: true });
    expect(parsePinyin('ma')?.[0]?.tone).toBe(5);
  });
  it('warns (known: false) rather than blocks on odd syllables', () => {
    expect(parsePinyin('qqq3')?.[0]?.known).toBe(false);
    expect(parsePinyin('3 3')).toBeNull();
  });
  it('requires Jyutping like [a-z]+[1-6]', () => {
    expect(parseJyutping('ngo5 dei6')).toEqual(['ngo5', 'dei6']);
    expect(parseJyutping('ngo')).toBeNull();
    expect(parseJyutping('ngo7')).toBeNull();
  });
});

describe('overlay: value corrections', () => {
  it('replaces a Korean romanisation and marks the token, leaving others alone', () => {
    const a = ko('나는 노래해');
    const { analysis, applied } = applyCorrections(a, 'k', [
      fix({ surface: '노래해', patch: { reading: 'norae-hae' } }),
    ]);
    expect(applied.has('c1')).toBe(true);
    expect(tokenRoman(word(analysis, '노래해'))).toBe('norae-hae');
    expect(word(analysis, '노래해').corrected).toBe(true);
    expect(tokenRoman(word(analysis, '나는'))).toBe('naneun');
    expect(romaniseLine(analysis.tokens)).toBe('naneun norae-hae');
    expect(checkInvariants('나는 노래해', analysis)).toEqual([]);
  });

  it('targets one occurrence, or every occurrence, as asked', () => {
    const a = ko('사랑 사랑');
    const one = applyCorrections(a, 'k', [
      fix({ surface: '사랑', occurrence: 1, patch: { romanisation: 'X' } }),
    ]);
    expect(romaniseLine(one.analysis.tokens)).toBe('sarang X');
    const all = applyCorrections(a, 'k', [fix({ surface: '사랑', patch: { romanisation: 'X' } })]);
    expect(romaniseLine(all.analysis.tokens)).toBe('X X');
  });

  it('song-wide corrections apply on any line; line-specific ones win over them', () => {
    const a = ko('사랑');
    const wide = fix({ id: 'wide', lineKey: null, surface: '사랑', patch: { romanisation: 'W' } });
    const line = fix({ id: 'line', lineKey: 'k', surface: '사랑', patch: { romanisation: 'L' } });
    const other = applyCorrections(a, 'other-line', [line, wide]);
    expect(romaniseLine(other.analysis.tokens)).toBe('W');
    const same = applyCorrections(a, 'k', [wide, line]);
    expect(romaniseLine(same.analysis.tokens)).toBe('L');
    const reversed = applyCorrections(a, 'k', [line, wide]);
    expect(romaniseLine(reversed.analysis.tokens)).toBe('L');
  });

  it('attaches a meaning with its mode', () => {
    const a = ko('노래');
    const { analysis } = applyCorrections(a, 'k', [
      fix({ surface: '노래', patch: { gloss: 'my song', glossMode: 'prepend' } }),
    ]);
    expect(word(analysis, '노래').userGloss).toEqual({ text: 'my song', mode: 'prepend' });
  });

  it('ignores corrections for another language and does not apply unmatched ones', () => {
    const a = ko('노래');
    const r = applyCorrections(a, 'k', [
      fix({ id: 'ja', language: 'ja', surface: '노래', patch: { romanisation: 'X' } }),
      fix({ id: 'gone', surface: '없는', patch: { romanisation: 'X' } }),
    ]);
    expect(r.applied.size).toBe(0);
    expect(romaniseLine(r.analysis.tokens)).toBe('norae');
  });
});

describe('overlay: Chinese, Cantonese and Japanese readings', () => {
  const han = (lang: 'zh' | 'yue', surface: string, readings: string[]): LineAnalysis => ({
    lineKey: 'k',
    lang,
    engineVersion: 1,
    status: 'ok',
    tokens: [
      {
        start: 0,
        end: surface.length,
        surface,
        kind: 'word',
        lang,
        ruby: [...surface].map((base, i) => ({
          base,
          reading: readings[i]!,
          syllable: readings[i]!.slice(0, -1),
          tone: Number(readings[i]!.slice(-1)),
        })),
        reading: readings.join(' '),
        roman: readings.join(' '),
        lemma: null,
        pos: null,
        dict: null,
        attachToPrev: false,
        confidence: 'high',
        notes: [],
      },
    ],
  });

  it('rewrites pinyin per character and shows tone marks', () => {
    const a = han('zh', '银行', ['yin2', 'hang2']);
    const r = applyCorrections(a, 'k', [
      fix({ language: 'zh', surface: '银行', patch: { reading: 'yin2 xing2' } }),
    ]);
    expect(r.analysis.tokens[0]!.ruby.map((u) => u.reading)).toEqual(['yin2', 'xing2']);
    expect(romaniseLine(r.analysis.tokens)).toBe('yín xíng');
  });

  it('rejects a reading whose syllable count does not match the characters', () => {
    const a = han('zh', '银行', ['yin2', 'hang2']);
    const r = applyCorrections(a, 'k', [
      fix({ language: 'zh', surface: '银行', patch: { reading: 'yin2' } }),
    ]);
    expect(r.applied.size).toBe(0);
  });

  it('rewrites Jyutping', () => {
    const a = han('yue', '銀行', ['ngan4', 'hong4']);
    const r = applyCorrections(a, 'k', [
      fix({ language: 'yue', surface: '銀行', patch: { reading: 'ngan4 hang4' } }),
    ]);
    expect(romaniseLine(r.analysis.tokens)).toBe('ngan4 hang4');
  });

  it('turns a Japanese romaji reading into kana ruby and derives Hepburn from it', () => {
    const a: LineAnalysis = {
      lineKey: 'k',
      lang: 'ja',
      engineVersion: 1,
      status: 'ok',
      tokens: [
        {
          start: 0,
          end: 2,
          surface: '運命',
          kind: 'word',
          lang: 'ja',
          ruby: [{ base: '運命', reading: 'うんめい' }],
          reading: 'うんめい',
          roman: null,
          lemma: null,
          pos: null,
          dict: null,
          attachToPrev: false,
          confidence: 'medium',
          notes: [],
        },
      ],
    };
    const r = applyCorrections(a, 'k', [
      fix({ language: 'ja', surface: '運命', patch: { reading: 'sadame' } }),
    ]);
    const t = r.analysis.tokens[0]!;
    expect(t.reading).toBe('さだめ');
    expect(t.ruby).toEqual([{ base: '運命', reading: 'さだめ' }]);
    const roman = japaneseRomanRuns(r.analysis.tokens, PREFS)
      .map((x) => x.text)
      .join('');
    expect(roman).toBe('sadame');
  });
});

describe('overlay: structural corrections', () => {
  it('"do not annotate" and "English" remove annotation and keep invariants', () => {
    const a = ko('사랑 노래');
    for (const segLang of ['none', 'en']) {
      const r = applyCorrections(a, 'k', [fix({ surface: '노래', patch: { segLang } })]);
      const t = word(r.analysis, '노래');
      expect(t.ruby).toEqual([]);
      expect(t.roman).toBeNull();
      expect(checkInvariants('사랑 노래', r.analysis)).toEqual([]);
      expect(romaniseLine(r.analysis.tokens)).toBe('sarang 노래');
    }
  });

  it('merges adjacent words only when they touch', () => {
    const a = ko('사랑 노래');
    const spaced = applyCorrections(a, 'k', [
      fix({ surface: '사랑', patch: { mergeWithNext: 1 } }),
    ]);
    expect(spaced.applied.size).toBe(0);
  });

  it('splits a Korean word and romanises each piece', () => {
    const a = ko('사랑해');
    const r = applyCorrections(a, 'k', [fix({ surface: '사랑해', patch: { split: [2] } })]);
    expect(r.analysis.tokens.map((t) => t.surface)).toEqual(['사랑', '해']);
    expect(romaniseLine(r.analysis.tokens)).toBe('sarang' + 'hae');
    expect(checkInvariants('사랑해', r.analysis)).toEqual([]);
  });
});
