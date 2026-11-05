import { afterEach, describe, expect, it } from 'vitest';
import { analyseLineAsync } from '../analyse';
import { setDictBackend } from '../dict/lookup';
import { checkInvariants } from '../model';
import { romaniseLine } from '../romanLine';
import { alignFurigana } from './furigana';
import { hepburn, particleKana } from './hepburn';
import { setJapaneseTokenizerForTests } from './tokenizer';

describe('Modified Hepburn', () => {
  it.each([
    ['とうきょう', 'トーキョー', 'tōkyō', 'toukyou'],
    ['おおさか', 'オーサカ', 'ōsaka', 'oosaka'],
    ['おもう', 'オモウ', 'omou', 'omou'],
    ['おおきい', 'オーキイ', 'ōkii', 'ookii'],
    ['せんせい', 'センセイ', 'sensei', 'sensei'],
    ['えいが', 'エイガ', 'eiga', 'eiga'],
    ['ｺｰﾋｰ', 'コーヒー', 'kōhī', 'koohii'],
    ['まっちゃ', undefined, 'matcha', 'matcha'],
    ['あっ', undefined, 'a', 'a'],
    ['きんようび', 'キンヨービ', "kin'yōbi", "kin'youbi"],
    ['れんあい', undefined, "ren'ai", "ren'ai"],
    ['づづく', undefined, 'zuzuku', 'zuzuku'],
    ['ヴァイオリン', undefined, 'vaiorin', 'vaiorin'],
    ['いすゞ', undefined, 'isuzu', 'isuzu'],
  ])('%s with pronunciation %s', (reading, pronunciation, macron, doubled) => {
    expect(hepburn(reading, pronunciation)).toBe(macron);
    expect(hepburn(reading, pronunciation, 'doubled')).toBe(doubled);
  });

  it('renders は, へ and を as grammatical particles only when POS confirms them', () => {
    expect(['は', 'へ', 'を'].map((surface) => particleKana(surface, '助詞'))).toEqual([
      'わ',
      'え',
      'お',
    ]);
    expect(particleKana('は', '名詞')).toBeUndefined();
  });
});

describe('furigana', () => {
  it('anchors hiragana and katakana okurigana against the normalized reading', () => {
    expect(alignFurigana('取り戻す', 'トリモドス')).toEqual({
      units: [
        { base: '取', reading: 'と' },
        { base: 'り', reading: null },
        { base: '戻', reading: 'もど' },
        { base: 'す', reading: null },
      ],
      uncertain: false,
    });
    expect(alignFurigana('今日', 'キョウ').units).toEqual([{ base: '今日', reading: 'きょう' }]);
    expect(alignFurigana('コーヒー', 'コーヒー').units).toEqual([]);
  });

  it('keeps every character and flags readings whose kana cannot be aligned', () => {
    expect(alignFurigana('見かけ', 'みえ')).toEqual({
      units: [{ base: '見かけ', reading: 'みえ' }],
      uncertain: true,
    });
    expect(alignFurigana('𠮷野', 'よしの').units[0]?.base).toBe('𠮷野');
  });
});

afterEach(() => {
  setJapaneseTokenizerForTests();
  setDictBackend(null);
});

it('preserves offsets, original English and unrecoverable kanji, with ranked JMdict fallback', async () => {
  setJapaneseTokenizerForTests({ tokenize: (text) => [...text].map((surface) => ({ surface })) });
  setDictBackend({
    installedVersion: async () => 'fixture',
    lookup: async () =>
      new Map([
        [
          '𠮷',
          [
            {
              f: '𠮷',
              e: 1,
              r: 'よし',
              a: ['きち'],
              s: [],
              q: 1,
              lang: 'ja',
              packVersion: 'fixture',
            },
          ],
        ],
      ]),
  });
  const text = 'Hi 𠮷𠀀';
  const analysis = await analyseLineAsync({ key: 'test', text }, 'ja');
  expect(checkInvariants(text, analysis)).toEqual([]);
  expect(analysis.tokens).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ surface: 'Hi', lang: 'en' }),
      expect.objectContaining({ surface: '𠮷', reading: 'よし', confidence: 'low' }),
      expect.objectContaining({ surface: '𠀀', reading: null, confidence: 'none' }),
    ]),
  );
  expect(romaniseLine(analysis.tokens)).toBe('Hi yoshi 𠀀');
});
