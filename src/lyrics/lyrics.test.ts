import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffLyricKeys } from './diff';
import {
  detectKind,
  lineKey,
  normaliseLyrics,
  parseLyrics,
  validateSongInput,
  LIMITS,
} from './parse';

describe('normaliseLyrics', () => {
  it('normalises line endings and NFC, preserving blank lines, spaces and full-width text', () => {
    const raw = 'A\r\n\r\n  leading space\r　全角　スペース\n\né';
    expect(normaliseLyrics(raw)).toBe('A\n\n  leading space\n　全角　スペース\n\né');
  });
  it('strips control and zero-width characters but keeps tabs', () => {
    expect(normaliseLyrics('a\u0000b​c\u0085d\te﻿')).toBe('abcd\te');
  });
  it('keeps ZWJ inside emoji sequences and drops stray ZWJ', () => {
    const family = '👨‍👩‍👧';
    expect(normaliseLyrics(family)).toBe(family);
    expect(normaliseLyrics('a‍b')).toBe('ab');
  });
  it('trims trailing whitespace at end of file only', () => {
    expect(normaliseLyrics('line one  \nline two   \n\n')).toBe('line one  \nline two');
  });
  it('preserves section labels and punctuation', () => {
    const t = '[Chorus]\n(Repeat)\n사랑해!!';
    expect(normaliseLyrics(t)).toBe(t);
  });
});

describe('detectKind', () => {
  it.each([
    '[Chorus]',
    '[Verse 2: Jungkook]',
    '(Repeat x2)',
    '【サビ】',
    '후렴',
    'Chorus',
    'Verse 1',
    'Pre-Chorus',
    'Bridge',
    'x2',
    '×2',
    '副歌',
    '間奏',
    'Jungkook:',
    '(Chorus)',
    '[ Hook ]',
  ])('classifies %j as a section', (line) => {
    expect(detectKind(line)).toBe('section');
  });
  it.each([
    '(I love you)',
    '(사랑해)',
    '(oh oh oh)',
    'I love you',
    '사랑해',
    '君が好き',
    'Verses of love are sweet',
  ])('keeps %j as a lyric', (line) => {
    expect(detectKind(line)).toBe('lyric');
  });
  it('classifies blank and whitespace-only lines as blank', () => {
    expect(detectKind('')).toBe('blank');
    expect(detectKind('   ')).toBe('blank');
  });
});

describe('lineKey', () => {
  it('is 16 hex chars and empty for blank lines', async () => {
    expect(await lineKey('사랑해')).toMatch(/^[0-9a-f]{16}$/);
    expect(await lineKey('  ')).toBe('');
  });
  it('is shared by whitespace, case, width and trailing-punctuation variants', async () => {
    const base = await lineKey('I love you');
    for (const v of [
      'i LOVE you',
      '  I   love you  ',
      'I love you!',
      'I love you…',
      'Ｉ　ｌｏｖｅ　ｙｏｕ',
    ]) {
      expect(await lineKey(v), v).toBe(base);
    }
  });
  it('differs for different lines', async () => {
    expect(await lineKey('I love you')).not.toBe(await lineKey('I love you too'));
    expect(await lineKey('사랑해')).not.toBe(await lineKey('사랑해요'));
  });
  it('still keys punctuation-only lines (not blank)', async () => {
    expect(await lineKey('...')).toMatch(/^[0-9a-f]{16}$/);
  });
  it('is stable (frozen contract): known vectors', async () => {
    // Independently computed with node:crypto sha1(...).slice(0, 16). Changing the key function
    // requires a backup schemaVersion bump and a migration (ARCHITECTURE §7).
    expect(await lineKey('I love you!')).toBe('bb7b1901d99e8b26');
    expect(await lineKey('사랑해')).toBe('e8153e8625d8c7be');
  });
});

describe('parseLyrics', () => {
  it('assigns indexes, kinds and shared keys to repeated lines', async () => {
    const lines = await parseLyrics('[Chorus]\nla la la\n\nla la la!\n');
    expect(lines.map((l) => [l.index, l.kind])).toEqual([
      [0, 'section'],
      [1, 'lyric'],
      [2, 'blank'],
      [3, 'lyric'],
    ]);
    expect(lines[1]!.key).toBe(lines[3]!.key);
    expect(lines[2]!.key).toBe('');
  });
  it('property: joined line texts equal the normalised input', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary', maxLength: 300 }), async (text) => {
        const lines = await parseLyrics(text);
        expect(lines.map((l) => l.text).join('\n')).toBe(normaliseLyrics(text));
      }),
      { numRuns: 100 },
    );
  });
});

describe('validateSongInput', () => {
  const ok = { title: 'T', artist: null, lyrics: 'la' };
  it('accepts valid input', () => expect(validateSongInput(ok)).toEqual({}));
  it('requires title and lyrics', () => {
    expect(validateSongInput({ ...ok, title: '  ' }).title).toBeTruthy();
    expect(validateSongInput({ ...ok, lyrics: ' \n ' }).lyrics).toBeTruthy();
  });
  it('enforces limits with specific messages, never truncating', () => {
    expect(validateSongInput({ ...ok, title: 'x'.repeat(LIMITS.title + 1) }).title).toMatch(
      /too long/,
    );
    expect(validateSongInput({ ...ok, artist: 'x'.repeat(LIMITS.artist + 1) }).artist).toMatch(
      /too long/,
    );
    expect(validateSongInput({ ...ok, lyrics: 'x'.repeat(LIMITS.lyricsChars + 1) }).lyrics).toMatch(
      /too long/,
    );
    expect(
      validateSongInput({ ...ok, lyrics: 'a\n'.repeat(LIMITS.lyricsLines + 1) }).lyrics,
    ).toMatch(/too many lines/);
  });
  it('accepts exactly the limits', () => {
    expect(validateSongInput({ ...ok, title: 'x'.repeat(LIMITS.title) })).toEqual({});
    expect(validateSongInput({ ...ok, lyrics: 'x'.repeat(LIMITS.lyricsChars) })).toEqual({});
    expect(
      validateSongInput({ ...ok, lyrics: Array(LIMITS.lyricsLines).fill('a').join('\n') }),
    ).toEqual({});
  });
});

describe('diffLyricKeys', () => {
  it('reports identical lyrics as unchanged', () => {
    expect(diffLyricKeys(['a', 'b'], ['a', 'b'])).toEqual({
      unchanged: 2,
      changed: 0,
      added: 0,
      removed: 0,
    });
  });
  it('counts a replaced line as changed', () => {
    expect(diffLyricKeys(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual({
      unchanged: 2,
      changed: 1,
      added: 0,
      removed: 0,
    });
  });
  it('counts insertions and deletions', () => {
    expect(diffLyricKeys(['a', 'b'], ['a', 'n', 'b'])).toEqual({
      unchanged: 2,
      changed: 0,
      added: 1,
      removed: 0,
    });
    expect(diffLyricKeys(['a', 'b', 'c'], ['a', 'c'])).toEqual({
      unchanged: 2,
      changed: 0,
      added: 0,
      removed: 1,
    });
  });
  it('treats a swap as one removal plus one addition around the common anchor', () => {
    expect(diffLyricKeys(['a', 'b'], ['b', 'a'])).toEqual({
      unchanged: 1,
      changed: 0,
      added: 1,
      removed: 1,
    });
  });
  it('handles empty sides', () => {
    expect(diffLyricKeys([], ['a'])).toEqual({ unchanged: 0, changed: 0, added: 1, removed: 0 });
    expect(diffLyricKeys(['a'], [])).toEqual({ unchanged: 0, changed: 0, added: 0, removed: 1 });
  });
});
