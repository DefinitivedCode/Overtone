import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TokenizerBuilder, initSync } from 'lindera-wasm-web-ipadic';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { analyseLineAsync } from '../../src/engine/analyse';
import { setDictBackend } from '../../src/engine/dict/lookup';
import type { DictRow, PackManifest, PackRow } from '../../src/engine/dict/types';
import { toHiragana } from '../../src/engine/ja/kana';
import { buildTokenizer, setJapaneseTokenizerForTests } from '../../src/engine/ja/tokenizer';
import { checkInvariants } from '../../src/engine/model';
import type { Token } from '../../src/engine/model';
import { romaniseLine } from '../../src/engine/romanLine';
import { parseAozora } from '../../src/lyrics/aozora';

interface ExpectedSpan {
  surface: string;
  start: number;
  end: number;
  reading: string;
}
interface Fixture {
  id: string;
  text: string;
  pasted?: string;
  tags: string[];
  reviewed: boolean;
  expectEngineMiss?: boolean;
  expected: { tokens: ExpectedSpan[]; romanLine: string };
}

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const fixtures = read<Fixture[]>('fixtures/linguistic/ja/lines.json');
const starter = read<{ id: string; text: string; expected: { reading: string } }[]>(
  'fixtures/linguistic/ja/starter.json',
);

beforeAll(() => {
  const pack = read<PackManifest>('public/packs/manifest.json').packs.find((p) => p.lang === 'ja')!;
  const file = (role: 'dictionary' | 'tokenizer') =>
    gunzipSync(readFileSync(`public/packs/${pack.files.find((f) => f.role === role)!.path}`));
  initSync({ module: file('tokenizer') });
  setJapaneseTokenizerForTests(buildTokenizer(TokenizerBuilder));
  const byForm = new Map<string, DictRow[]>();
  const fixtureText = fixtures.map((f) => f.text).concat(starter.map((f) => f.text));
  const forms = new Set<string>();
  for (const line of fixtureText) {
    const chars = [...line];
    for (let i = 0; i < chars.length; i++)
      for (let end = i + 1; end <= Math.min(chars.length, i + 16); end++)
        forms.add(chars.slice(i, end).join(''));
  }
  for (const line of file('dictionary').toString('utf8').trimEnd().split('\n')) {
    const row = JSON.parse(line) as PackRow;
    if (!forms.has(row.f)) continue;
    const hits = byForm.get(row.f) ?? [];
    hits.push({ ...row, lang: 'ja', packVersion: pack.version });
    byForm.set(row.f, hits);
  }
  for (const hits of byForm.values()) hits.sort((a, b) => b.q - a.q || a.e - b.e);
  setDictBackend({
    installedVersion: async (lang) => (lang === 'ja' ? pack.version : null),
    lookup: async (lang, forms) =>
      new Map(
        lang === 'ja'
          ? forms.filter((form) => byForm.has(form)).map((form) => [form, byForm.get(form)!])
          : [],
      ),
  });
});

afterAll(() => {
  setDictBackend(null);
  setJapaneseTokenizerForTests();
});

/** Compare surface ranges independently of the tokenizer's word boundaries. */
function spanReading(tokens: Token[], start: number, end: number): string {
  let result = '';
  for (const token of tokens) {
    if (token.start >= end || token.end <= start) continue;
    if (token.start >= start && token.end <= end) {
      result += token.reading ?? token.surface;
      continue;
    }
    let at = token.start;
    for (const ruby of token.ruby.length
      ? token.ruby
      : [{ base: token.surface, reading: token.reading }]) {
      const next = at + ruby.base.length;
      if (at < end && next > start) {
        result +=
          ruby.reading === null
            ? toHiragana(ruby.base.slice(Math.max(0, start - at), Math.min(next, end) - at))
            : at >= start && next <= end
              ? ruby.reading
              : '?';
      }
      at = next;
    }
  }
  return result;
}

it('meets Japanese reading and romaji thresholds and reports every difference', async () => {
  const totals = { spans: 0, hits: 0, lines: 0, roman: 0, starter: 0, poetic: 0, poeticHits: 0 };
  const byTag = new Map<string, { spans: number; hits: number; lines: number; roman: number }>();
  const differences: string[] = [];
  for (const f of fixtures) {
    const input = f.pasted ? parseAozora(f.pasted) : { text: f.text, readings: [] };
    expect(input.text, f.id).toBe(f.text);
    const result = await analyseLineAsync({ ...input, key: f.id }, 'ja');
    expect(checkInvariants(input.text, result), f.id).toEqual([]);
    const roman = romaniseLine(result.tokens);
    let hits = 0;
    for (const t of f.expected.tokens) {
      expect(f.text.slice(t.start, t.end), f.id).toBe(t.surface);
      const got = spanReading(result.tokens, t.start, t.end);
      if (got === t.reading) hits++;
      else
        differences.push(
          `- ${f.id} ${t.surface}: got ${got}, expected ${t.reading}${f.expectEngineMiss ? ' (poetic)' : ''}`,
        );
    }
    const romanHit = Number(roman === f.expected.romanLine);
    if (!romanHit)
      differences.push(
        `- ${f.id} ${f.text}: got “${roman}”, expected “${f.expected.romanLine}”${f.expectEngineMiss ? ' (poetic)' : ''}`,
      );
    if (f.expectEngineMiss) {
      totals.poetic++;
      totals.poeticHits += romanHit;
      continue;
    }
    totals.spans += f.expected.tokens.length;
    totals.hits += hits;
    totals.lines++;
    totals.roman += romanHit;
    for (const tag of f.tags) {
      const row = byTag.get(tag) ?? { spans: 0, hits: 0, lines: 0, roman: 0 };
      row.spans += f.expected.tokens.length;
      row.hits += hits;
      row.lines++;
      row.roman += romanHit;
      byTag.set(tag, row);
    }
  }
  for (const f of starter) {
    const result = await analyseLineAsync({ key: f.id, text: f.text }, 'ja');
    const reading = result.tokens.map((t) => t.reading ?? t.surface).join('');
    if (reading === f.expected.reading) totals.starter++;
    else differences.push(`- ${f.id} ${f.text}: got ${reading}, expected ${f.expected.reading}`);
  }
  const reading = (100 * totals.hits) / totals.spans;
  const roman = (100 * totals.roman) / totals.lines;
  mkdirSync('reports', { recursive: true });
  writeFileSync(
    'reports/linguistic-ja.md',
    [
      '# Japanese linguistic report',
      '',
      `Reading spans: ${totals.hits}/${totals.spans} (${reading.toFixed(2)} %). Romaji lines: ${totals.roman}/${totals.lines} (${roman.toFixed(2)} %).`,
      `Original starter reading lines: ${totals.starter}/${starter.length}. Poetic matches: ${totals.poeticHits}/${totals.poetic}.`,
      `Reviewed lines: ${fixtures.filter((f) => f.reviewed).length}. References are self-authored, with no native-speaker verification.`,
      '',
      '| Tag | Reading spans | Romaji lines |',
      '| --- | --- | --- |',
      ...[...byTag].map(([tag, r]) => `| ${tag} | ${r.hits}/${r.spans} | ${r.roman}/${r.lines} |`),
      '',
      '## Differences',
      '',
      ...differences,
      '',
    ].join('\n'),
  );
  expect(totals.lines).toBeGreaterThanOrEqual(150);
  expect(reading).toBeGreaterThanOrEqual(95);
  expect(roman).toBeGreaterThanOrEqual(85);
  expect(totals.starter).toBeGreaterThanOrEqual(48);
});
