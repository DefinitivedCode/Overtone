/**
 * Mandarin and Cantonese linguistic suites (TEST_STRATEGY §4) against the REAL packs (`npm run packs` first).
 * Honesty caveat as in ko.test.ts: fixtures are self-authored and unreviewed by fluent speakers.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyseLineAsync } from '../../src/engine/analyse';
import { setDictBackend } from '../../src/engine/dict/lookup';
import type { DictRow, PackManifest, PackRow } from '../../src/engine/dict/types';
import { gunzipSync } from 'node:zlib';
import { convert } from 'pinyin-pro';

const root = path.resolve(import.meta.dirname, '..', '..');
const fx = <T>(lang: string) =>
  readdirSync(path.join(root, 'fixtures', 'linguistic', lang))
    .filter((f) => f.endsWith('.json'))
    .flatMap(
      (f) =>
        JSON.parse(readFileSync(path.join(root, 'fixtures', 'linguistic', lang, f), 'utf8')) as T[],
    );

interface Fx {
  id: string;
  text: string;
  expected: { reading: string };
  acceptable?: { reading: string[] };
  tags: string[];
  expectEngineMiss?: boolean;
}

const manifest = JSON.parse(
  readFileSync(path.join(root, 'public', 'packs', 'manifest.json'), 'utf8'),
) as PackManifest;
/** In-memory backend over the real pack files (same ordering rule as the IndexedDB lookup). */
beforeAll(() => {
  const tables = new Map<string, Map<string, DictRow[]>>();
  const versions = new Map<string, string>();
  for (const p of manifest.packs) {
    const text = gunzipSync(
      readFileSync(path.join(root, 'public', 'packs', p.files[0]!.path)),
    ).toString('utf8');
    const m = new Map<string, DictRow[]>();
    for (const line of text.split(String.fromCharCode(10))) {
      if (!line) continue;
      const r = JSON.parse(line) as PackRow;
      const row: DictRow = { ...r, lang: p.lang, packVersion: p.version };
      const list = m.get(r.f);
      if (list) list.push(row);
      else m.set(r.f, [row]);
    }
    for (const list of m.values()) list.sort((x, y) => y.q - x.q || x.e - y.e);
    tables.set(p.lang, m);
    versions.set(p.lang, p.version);
  }
  setDictBackend({
    installedVersion: async (lang) => versions.get(lang) ?? null,
    lookup: async (lang, forms) => {
      const out = new Map<string, DictRow[]>();
      for (const f of forms) {
        const hit = tables.get(lang)?.get(f);
        if (hit) out.set(f, hit);
      }
      return out;
    },
  });
}, 120_000);

async function readings(text: string, lang: 'zh' | 'yue'): Promise<string[]> {
  const a = await analyseLineAsync({ key: 'k', text }, lang);
  return a.tokens.flatMap((t) => (t.kind === 'word' ? t.ruby.map((u) => u.reading ?? '?') : []));
}

function expectedSyllables(reading: string, lang: 'zh' | 'yue'): string[] {
  return reading.split(' ').map((syllable) => {
    if (lang === 'yue' || /\d$/.test(syllable)) return syllable;
    // The Mandarin starter probes use tone marks. Compare them on the same 1–5 scale as the engine.
    return convert([syllable], { format: 'symbolToNum' })[0]!.replace(/0$/, '5');
  });
}

for (const [lang, threshold, polyThreshold] of [
  ['zh', 98, 92],
  ['yue', 95, 88],
] as const) {
  describe(`${lang} readings (real pack)`, () => {
    const all = fx<Fx>(lang).filter((f) => !f.expectEngineMiss);
    it('has at least 120 lines (starter probes + lines)', () => {
      expect(all.length).toBeGreaterThanOrEqual(120);
    });

    it(`meets the ≥ ${threshold} % character accuracy (polyphones ≥ ${polyThreshold} %)`, async () => {
      let ok = 0;
      let total = 0;
      let pOk = 0;
      let pTotal = 0;
      const byTag = new Map<string, [number, number]>();
      const failures: string[] = [];
      for (const f of all) {
        const got = await readings(f.text, lang);
        const want = expectedSyllables(f.expected.reading, lang);
        const alts = (f.acceptable?.reading ?? []).map((r) => expectedSyllables(r, lang));
        expect(got, f.id).toHaveLength(want.length);
        want.forEach((w, i) => {
          const good = got[i] === w || alts.some((a) => a[i] !== undefined && got[i] === a[i]);
          total++;
          if (good) ok++;
          const tag = f.tags[0] ?? 'untagged';
          const [tOk, tTotal] = byTag.get(tag) ?? [0, 0];
          byTag.set(tag, [tOk + (good ? 1 : 0), tTotal + 1]);
          if (f.tags.includes('polyphone')) {
            pTotal++;
            if (good) pOk++;
          }
        });
        if (got.join(' ') !== want.join(' ') && !alts.some((a) => a.join(' ') === got.join(' ')))
          failures.push(
            `- ${f.id} ${f.text}: got \`${got.join(' ')}\`, expected \`${want.join(' ')}\``,
          );
      }
      const pct = (100 * ok) / total;
      const pPct = pTotal ? (100 * pOk) / pTotal : 100;
      mkdirSync(path.join(root, 'reports'), { recursive: true });
      writeFileSync(
        path.join(root, 'reports', `linguistic-${lang}.md`),
        [
          `# ${lang} linguistic report (${new Date().toISOString().slice(0, 10)})`,
          '',
          `Lines: ${all.length}. Character accuracy **${pct.toFixed(1)} %** (${ok}/${total}); polyphone subset **${pPct.toFixed(1)} %** (${pOk}/${pTotal}).`,
          '',
          '> Honesty caveat: self-authored, unreviewed fixtures; scores show agreement with the implementer’s expectations, not proven native-level accuracy.',
          '',
          '| Tag | correct / total |',
          '|---|---|',
          ...[...byTag].sort().map(([t, [a, b]]) => `| ${t} | ${a}/${b} |`),
          '',
          failures.length
            ? '## Lines with any difference\n' + failures.join('\n')
            : 'No differences.',
          '',
        ].join('\n'),
      );
      expect.soft(pPct).toBeGreaterThanOrEqual(polyThreshold);
      expect(pct).toBeGreaterThanOrEqual(threshold);
    }, 120_000);
  });
}
