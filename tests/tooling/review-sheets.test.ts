import { describe, expect, it } from 'vitest';
import {
  applyReview,
  buildSheet,
  expectedText,
  parseSheet,
  pickSample,
  type Fixture,
} from '../../scripts/docs/review-sheets';

const fx = (id: string, tag: string, extra: Partial<Fixture> = {}): Fixture => ({
  id,
  lang: 'zh',
  text: `text ${id}`,
  expected: { reading: `reading ${id}` },
  tags: [tag],
  reviewed: false,
  ...extra,
});

describe('review sheets (issue #14)', () => {
  const entries = [
    ...Array.from({ length: 30 }, (_, i) => fx(`p${i}`, 'plain')),
    ...Array.from({ length: 5 }, (_, i) => fx(`y${i}`, 'polyphone')),
    ...Array.from({ length: 3 }, (_, i) => fx(`n${i}`, 'neutral')),
    fx('done', 'polyphone', { reviewed: true }),
  ];

  it('picks a deterministic sample that spreads across categories, riskiest first, skipping reviewed lines', () => {
    const a = pickSample('zh', entries, 10);
    expect(pickSample('zh', entries, 10).map((f) => f.id)).toEqual(a.map((f) => f.id));
    expect(a).toHaveLength(10);
    expect(a.some((f) => f.id === 'done')).toBe(false);
    expect(a[0]!.tags![0]).toBe('polyphone'); // riskiest category first
    expect(new Set(a.map((f) => f.tags![0])).size).toBe(3); // spread, not 10 of the same
  });

  it('returns fewer lines when there are not enough, never duplicates', () => {
    const a = pickSample('zh', entries.slice(0, 3), 10);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((f) => f.id)).size).toBe(3);
  });

  it('shows readings for every language shape', () => {
    expect(expectedText(fx('a', 'x'))).toBe('reading a');
    expect(
      expectedText({
        ...fx('b', 'x'),
        expected: { romanLine: 'kaze ga fuku', tokens: [{ surface: '風', reading: 'かぜ' }] },
      }),
    ).toBe('kaze ga fuku (風=かぜ)');
    expect(expectedText({ ...fx('c', 'x'), expected: { romanLine: 'jeomda' } })).toBe('jeomda');
  });

  it('round-trips a sheet, including pipes in text and filled-in marks', () => {
    const sample = [fx('a', 'x', { text: 'a | b' }), fx('b', 'x'), fx('c', 'x')];
    const filled = buildSheet('zh', sample).replace(
      '| a | a \\| b | reading a |   |   |',
      '| a | a \\| b | reading a | y |   |',
    );
    const rows = parseSheet(filled);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows[0]!.ok).toBe(true);
    expect(rows[1]!.ok).toBeNull();
  });

  it('parses y / n / corrections and ignores everything outside the table', () => {
    const md = [
      '# title',
      '| ID | Text | Expected | OK (y/n) | Correction |',
      '| --- | --- | --- | --- | --- |',
      '| a | t | r | Y |  |',
      '| b | t | r | n | zhang3 da4 |',
      '| c | t | r | ✓ |  |',
      '| d | t | r | maybe |  |',
      'not a row',
    ].join('\n');
    expect(parseSheet(md)).toEqual([
      { id: 'a', ok: true, note: '' },
      { id: 'b', ok: false, note: 'zhang3 da4' },
      { id: 'c', ok: true, note: '' },
      { id: 'd', ok: null, note: '' },
    ]);
  });

  it('applies reviews: y marks reviewed, n only adds a note and never changes the expectation', () => {
    const list = [fx('a', 'x'), fx('b', 'x'), fx('c', 'x', { reviewNote: 'old' })];
    const result = applyReview(
      list,
      [
        { id: 'a', ok: true, note: '' },
        { id: 'b', ok: false, note: 'zhang3' },
        { id: 'c', ok: true, note: '' },
        { id: 'zzz', ok: true, note: '' },
        { id: 'a2', ok: null, note: '' },
      ],
      'Sam',
      '2026-11-07',
    );
    expect(result.reviewed).toBe(2);
    expect(result.flagged).toEqual([{ id: 'b', note: 'zhang3' }]);
    expect(result.unknown).toEqual(['zzz', 'a2']);
    expect(list[0]).toMatchObject({ reviewed: true, reviewedBy: 'Sam', reviewedOn: '2026-11-07' });
    expect(list[1]!.reviewed).toBe(false);
    expect(list[1]!.reviewNote).toContain('zhang3');
    expect(list[1]!.expected).toEqual({ reading: 'reading b' });
    expect(list[2]!.reviewNote).toBeUndefined();
  });
});
