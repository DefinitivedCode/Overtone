import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing block ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast', (_name, t) => {
  for (const surface of ['bg', 'bg-elevated']) {
    for (const fg of ['text', 'text-secondary', 'annotation', 'accent']) {
      it(`${fg} on ${surface} ≥ 4.5:1`, () => {
        expect(contrast(t[fg]!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`text-tertiary on ${surface} ≥ 3:1`, () => {
      expect(contrast(t['text-tertiary']!, t[surface]!)).toBeGreaterThanOrEqual(3);
    });
    for (const status of ['danger', 'warning', 'success']) {
      it(`${status} on ${surface} ≥ 4.5:1`, () => {
        expect(contrast(t[status]!, t[surface]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it('accent-contrast on accent ≥ 4.5:1', () => {
    expect(contrast(t['accent-contrast']!, t['accent']!)).toBeGreaterThanOrEqual(4.5);
  });
});
