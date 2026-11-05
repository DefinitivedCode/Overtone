import { describe, expect, it } from 'vitest';
import { buildSearchText, fold, matchesQuery, withRomanised } from './fold';

describe('fold', () => {
  it.each([
    ['ài', 'ai'],
    ['tōkyō', 'tokyo'],
    ['Nǐ hǎo', 'ni hao'],
    ['lǜ', 'lu'],
    ['ＡＢＣ', 'abc'],
    ['ｱｲ', 'あい'],
    ['アイ', 'あい'],
    ['  many   spaces ', 'many spaces'],
  ])('folds %j to %j', (input, expected) => {
    expect(fold(input)).toBe(expected);
  });
  it('does not conflate kana voicing or damage Hangul', () => {
    expect(fold('が')).not.toBe(fold('か'));
    expect(fold('사랑해')).toBe('사랑해');
  });
});

describe('matchesQuery', () => {
  const text = buildSearchText(
    'Test Song',
    'Artist',
    '사랑해\nこんにちは\nwǒ ài nǐ',
    'saranghae konnichiwa wǒ ài nǐ',
  );
  it('is case-, width-, diacritic- and kana-insensitive', () => {
    expect(matchesQuery(text, 'TEST')).toBe(true);
    expect(matchesQuery(text, 'ai')).toBe(true);
    expect(matchesQuery(text, 'コンニチハ')).toBe(true);
  });
  it('finds Korean via romanised text', () => {
    expect(matchesQuery(text, 'saranghae')).toBe(true);
  });
  it('uses AND semantics across tokens', () => {
    expect(matchesQuery(text, 'test artist')).toBe(true);
    expect(matchesQuery(text, 'test missing')).toBe(false);
  });
  it('matches everything for an empty query', () => {
    expect(matchesQuery(text, '   ')).toBe(true);
  });
  it('replaces the romanised suffix without touching the base', () => {
    const base = buildSearchText('T', null, 'x');
    expect(matchesQuery(withRomanised(base, 'hello'), 'hello')).toBe(true);
    expect(matchesQuery(withRomanised(withRomanised(base, 'hello'), 'bye'), 'hello')).toBe(false);
    expect(matchesQuery(withRomanised(base, 'bye'), 'x')).toBe(true);
  });
  it('filters 1,000 synthetic songs in well under 50 ms', () => {
    const songs = Array.from({ length: 1000 }, (_, i) =>
      buildSearchText(
        `Song ${i}`,
        `Artist ${i % 40}`,
        `line one ${i}\nline two\n${'la '.repeat(100)}`,
      ),
    );
    const t0 = performance.now();
    const hits = songs.filter((s) => matchesQuery(s, 'artist 7 song'));
    const ms = performance.now() - t0;
    expect(hits.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(50);
  });
});
