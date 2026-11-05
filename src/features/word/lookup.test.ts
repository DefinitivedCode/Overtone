import { afterEach, describe, expect, it } from 'vitest';
import { plainToken } from '@/engine/model';
import type { Token } from '@/engine/model';
import { setDictBackend } from '@/engine/dict/lookup';
import type { DictRow } from '@/engine/dict/types';
import { koIrregularForms, lookupForms, lookupWord } from './lookup';

const row = (lang: DictRow['lang'], f: string, extra: Partial<DictRow> = {}): DictRow => ({
  lang,
  packVersion: '1',
  f,
  e: 1,
  r: '',
  s: [{ g: ['to love'], p: 'verb' }],
  q: 1,
  ...extra,
});

function backend(rows: DictRow[], installed: Partial<Record<DictRow['lang'], string>>) {
  setDictBackend({
    installedVersion: async (lang) => installed[lang] ?? null,
    lookup: async (lang, forms) => {
      const out = new Map<string, DictRow[]>();
      for (const r of rows)
        if (r.lang === lang && forms.includes(r.f)) out.set(r.f, [...(out.get(r.f) ?? []), r]);
      return out;
    },
  });
}

const token = (surface: string, extra: Partial<Token> = {}): Token =>
  plainToken({ start: 0, end: surface.length, surface, kind: 'word', lang: 'ko', ...extra });

afterEach(() => setDictBackend(null));

describe('lookupForms', () => {
  it('tries lemma candidates, their citation forms, then the surface', () => {
    expect(lookupForms(token('좋은', { lemmaCandidates: ['좋은', '좋'] }), 'ko')).toEqual([
      '좋은',
      '좋은다',
      '좋',
      '좋다',
    ]);
  });
  it('uses the tokenizer base form first for Japanese', () => {
    expect(lookupForms(token('愛して', { lang: 'ja', lemma: '愛する' }), 'ja')).toEqual([
      '愛する',
      '愛して',
    ]);
  });
});

describe('koIrregularForms', () => {
  it('undoes the common irregular conjugations', () => {
    expect(koIrregularForms('추워')).toEqual(['춥다']);
    expect(koIrregularForms('아름다워')).toEqual(['아름답다']);
    expect(koIrregularForms('몰라')).toEqual(['모르다']);
    expect(koIrregularForms('빨라요')).toEqual(['빠르다']);
    expect(koIrregularForms('합니다')).toEqual(['하다']);
    expect(koIrregularForms('먹습니다')).toEqual(['먹다']);
    expect(koIrregularForms('놓여')).toEqual(['놓이다']);
  });
  it('leaves ordinary words alone', () => {
    expect(koIrregularForms('사랑')).toEqual([]);
    expect(koIrregularForms('노래')).toEqual([]);
  });
});

describe('lookupWord', () => {
  it('reports a missing pack rather than an empty result', async () => {
    backend([], {});
    expect(await lookupWord(token('사랑'), 'ko')).toEqual({
      status: 'no-pack',
      packId: 'ko-core',
      packName: 'Korean dictionary',
    });
  });

  it('finds the dictionary form for a conjugated Korean word and names its source', async () => {
    backend([row('ko', '사랑하다', { x: 'w' })], { ko: '1' });
    const r = await lookupWord(token('사랑해', { lemmaCandidates: ['사랑해', '사랑하다'] }), 'ko');
    expect(r).toMatchObject({ status: 'ok', dictionaryForm: '사랑하다' });
    if (r.status === 'ok') expect(r.entries.map((e) => e.form)).toEqual(['사랑하다']);
    if (r.status === 'ok') expect(r.entries[0]).toMatchObject({ source: 'Wiktionary' });
  });

  it('lists the dictionary form before an exact-surface entry', async () => {
    backend([row('ko', '사랑해', { s: [{ g: ['I love you'] }] }), row('ko', '사랑하다')], {
      ko: '1',
    });
    const r = await lookupWord(token('사랑해', { lemmaCandidates: ['사랑해', '사랑하다'] }), 'ko');
    expect(r.status === 'ok' && r.entries.map((e) => e.form)).toEqual(['사랑하다', '사랑해']);
  });

  it('labels kengdic rows and skips rows without senses', async () => {
    backend([row('ko', '노래', { x: 'k' }), row('ko', '노래', { s: [] })], { ko: '1' });
    const r = await lookupWord(token('노래'), 'ko');
    expect(r.status === 'ok' && r.entries.map((e) => e.source)).toEqual(['kengdic']);
  });

  it('says so when there is no entry', async () => {
    backend([row('ko', '사랑')], { ko: '1' });
    expect(await lookupWord(token('쀍'), 'ko')).toEqual({ status: 'no-entry' });
  });

  it('prefers the Japanese entry whose kana matches the reading', async () => {
    backend(
      [
        row('ja', '日', { e: 1, r: 'ひ', s: [{ g: ['day'] }] }),
        row('ja', '日', { e: 2, r: 'にち', s: [{ g: ['Sunday'] }] }),
      ],
      { ja: '1' },
    );
    const r = await lookupWord(token('日', { lang: 'ja', reading: 'にち' }), 'ja');
    expect(r.status === 'ok' && r.entries[0]?.reading).toBe('にち');
  });

  it('falls back to CC-CEDICT glosses for Cantonese when CC-Canto has none', async () => {
    backend([row('zh', '銀行', { s: [{ g: ['bank'] }] }), row('yue', '銀行', { s: [] })], {
      yue: '1',
      zh: '1',
    });
    const r = await lookupWord(token('銀行', { lang: 'yue' }), 'yue');
    expect(r.status === 'ok' && r.entries[0]?.source).toBe('CC-CEDICT');
  });
});
