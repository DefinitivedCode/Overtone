import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTIONARY_SOURCES, PACKAGE_LICENCES } from '../../src/features/about/licences.generated';

const root = path.resolve(import.meta.dirname, '..', '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const sources = JSON.parse(readFileSync(path.join(root, 'scripts/packs/sources.json'), 'utf8')) as {
  sources: Record<string, { name: string }>;
};

describe('About & licences data (re-run `npm run licences` if this fails)', () => {
  it('lists every runtime dependency with its installed version and a licence', () => {
    const listed = new Map(PACKAGE_LICENCES.map((p) => [p.name, p]));
    for (const name of Object.keys(pkg.dependencies)) {
      const entry = listed.get(name);
      expect(entry, name).toBeDefined();
      expect(entry!.licence, name).not.toBe('');
      const installed = JSON.parse(
        readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'),
      ) as { version: string };
      expect(entry!.version, name).toBe(installed.version);
    }
  });

  it('lists every pinned dictionary source with attribution', () => {
    for (const s of Object.values(sources.sources)) {
      const d = DICTIONARY_SOURCES.find((x) => x.name === s.name);
      expect(d, s.name).toBeDefined();
      expect(d!.attribution.length).toBeGreaterThan(20);
    }
  });
});
