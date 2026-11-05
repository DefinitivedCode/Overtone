import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAssets } from '../../scripts/brand/build';

const root = path.resolve(import.meta.dirname, '..', '..');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

describe('brand asset pipeline', () => {
  const first = buildAssets();
  const second = buildAssets();

  it('is deterministic: two runs produce byte-identical output', () => {
    expect(second.assets.length).toBe(first.assets.length);
    first.assets.forEach((a, i) => {
      const b = second.assets[i]!;
      expect(b.path).toBe(a.path);
      expect(sha(b.data), a.path).toBe(sha(a.data));
    });
  });

  it('matches the committed assets (re-run `npm run brand` if this fails)', () => {
    for (const a of first.assets) {
      const committed = readFileSync(path.join(root, a.path));
      expect(sha(committed), a.path).toBe(sha(a.data));
    }
  });

  it('keeps every PNG under 200 KB', () => {
    for (const a of first.assets) {
      if (a.path.endsWith('.png'))
        expect((a.data as Buffer).length, a.path).toBeLessThanOrEqual(200 * 1024);
    }
  });

  it('banner and wordmark SVGs contain no <text> (fonts are outlined)', () => {
    for (const p of ['brand/banner.svg', 'brand/wordmark.svg']) {
      const svg = first.assets.find((a) => a.path === p)!.data as string;
      expect(svg).not.toMatch(/<text\b/);
    }
  });

  it('emits splash links for light and dark of every device', () => {
    expect(first.splashLinks.length).toBeGreaterThan(0);
    expect(first.splashLinks.filter((l) => l.media.includes('dark')).length).toBe(
      first.splashLinks.filter((l) => l.media.includes('light')).length,
    );
  });
});
