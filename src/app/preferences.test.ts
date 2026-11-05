import { describe, expect, it } from 'vitest';
import { parseTextSize } from './preferences';

describe('parseTextSize', () => {
  it('defaults to the middle step when nothing is stored (null must not become 0)', () => {
    expect(parseTextSize(null)).toBe(2);
    expect(parseTextSize('')).toBe(2);
  });
  it('accepts every valid step and rejects junk', () => {
    expect([0, 1, 2, 3, 4].map((n) => parseTextSize(String(n)))).toEqual([0, 1, 2, 3, 4]);
    expect(parseTextSize('9')).toBe(2);
    expect(parseTextSize('abc')).toBe(2);
  });
});
