/**
 * Dictionary coverage and meaning relevance (TEST_STRATEGY §4.4) against the REAL packs (`npm run packs` first).
 * Honesty caveat as elsewhere: the fixtures are self-authored; the meaning expectations below are a small
 * hand-written probe, not an independent relevance study.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { TokenizerBuilder, initSync } from 'lindera-wasm-web-ipadic';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyseLine, analyseLineAsync } from '../../src/engine/analyse';
import { setDictBackend } from '../../src/engine/dict/lookup';
import type { DictRow, PackManifest, PackRow } from '../../src/engine/dict/types';
import { buildTokenizer, setJapaneseTokenizerForTests } from '../../src/engine/ja/tokenizer';
import type { Token } from '../../src/engine/model';
import { lookupWord } from '../../src/features/word/lookup';
import type { LangCode } from '../../src/db/types';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(root, file), 'utf8')) as T;
const manifest = read<PackManifest>('public/packs/manifest.json');

interface Fx {
  id: string;
  text: string;
}
const lines = (lang: string): Fx[] =>
  readdirSync(path.join(root, 'fixtures', 'linguistic', lang))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => read<Fx[]>(`fixtures/linguistic/${lang}/${f}`));

const fixtures: Record<LangCode, Fx[]> = {
  ko: lines('ko'),
  ja: lines('ja'),
  zh: lines('zh'),
  yue: lines('yue'),
};

const tables = new Map<string, Map<string, DictRow[]>>();
const versions = new Map<string, string>();

beforeAll(() => {
  const jaPack = manifest.packs.find((p) => p.lang === 'ja')!;
  const jaFile = (role: 'dictionary' | 'tokenizer') =>
    gunzipSync(
      readFileSync(
        path.join(root, 'public/packs', jaPack.files.find((f) => f.role === role)!.path),
      ),
    );
  initSync({ module: jaFile('tokenizer') });
  setJapaneseTokenizerForTests(buildTokenizer(TokenizerBuilder));
  // Japanese rows are filtered to substrings of the fixtures (the full table is ~500k rows).
  const jaForms = new Set<string>(['見る', '愛', '空', '君', '名前']);
  for (const f of fixtures.ja) {
    const chars = [...f.text];
    for (let i = 0; i < chars.length; i++)
      for (let end = i + 1; end <= Math.min(chars.length, i + 16); end++)
        jaForms.add(chars.slice(i, end).join(''));
  }
  for (const p of manifest.packs) {
    const text =
      p.lang === 'ja'
        ? jaFile('dictionary').toString('utf8')
        : gunzipSync(readFileSync(path.join(root, 'public/packs', p.files[0]!.path))).toString(
            'utf8',
          );
    const table = new Map<string, DictRow[]>();
    for (const line of text.split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line) as PackRow;
      if (p.lang === 'ja' && !jaForms.has(r.f)) continue;
      const row: DictRow = { ...r, lang: p.lang, packVersion: p.version };
      const list = table.get(r.f);
      if (list) list.push(row);
      else table.set(r.f, [row]);
    }
    for (const list of table.values()) list.sort((a, b) => b.q - a.q || a.e - b.e);
    tables.set(p.lang, table);
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
}, 180_000);

async function contentTokens(lang: LangCode): Promise<Token[]> {
  const out: Token[] = [];
  for (const f of fixtures[lang]) {
    const input = { key: f.id, text: f.text };
    const a = lang === 'ko' ? analyseLine(input, 'ko') : await analyseLineAsync(input, lang);
    for (const t of a.tokens)
      // Jamo-only interjections (ㅋㅋ) are not dictionary words.
      if (
        t.kind === 'word' &&
        t.lang === lang &&
        !t.notes.some((n) => n.startsWith('particle')) &&
        !/^[㄰-㆏]+$/u.test(t.surface)
      )
        out.push(t);
  }
  return out;
}

const report: Record<string, unknown> = {};

describe('dictionary coverage (≥ 90 % of content-word tokens have an entry)', () => {
  for (const lang of ['ko', 'ja', 'zh', 'yue'] as const) {
    it(
      lang,
      async () => {
        const tokens = await contentTokens(lang);
        const missing = new Map<string, number>();
        let found = 0;
        for (const t of tokens) {
          const r = await lookupWord(t, lang);
          if (r.status === 'ok') found++;
          else missing.set(t.surface, (missing.get(t.surface) ?? 0) + 1);
        }
        const pct = (100 * found) / tokens.length;
        report[`coverage-${lang}`] = {
          tokens: tokens.length,
          found,
          pct: Number(pct.toFixed(2)),
          topMissing: [...missing].sort((a, b) => b[1] - a[1]).slice(0, 15),
        };
        expect(tokens.length).toBeGreaterThan(50);
        expect(pct).toBeGreaterThanOrEqual(90);
      },
      120_000,
    );
  }
});

/** [language, surface, lemma-candidates, substring expected in the top 3 senses] — hand-written probe. */
const MEANINGS: [LangCode, string, string[], string, string?][] = [
  ['ko', '사랑해', ['사랑해', '사랑하다'], 'love'],
  ['ko', '가고', ['가고', '가다'], 'go'],
  ['ko', '먹어', ['먹어', '먹다'], 'eat'],
  ['ko', '하늘', ['하늘'], 'sky'],
  ['ko', '바다', ['바다'], 'sea'],
  ['ko', '노래', ['노래'], 'song'],
  ['ko', '마음', ['마음'], 'heart'],
  ['ko', '꿈', ['꿈'], 'dream'],
  ['zh', '爱', [], 'love'],
  ['zh', '银行', [], 'bank'],
  ['zh', '朋友', [], 'friend'],
  ['zh', '明天', [], 'tomorrow'],
  ['zh', '喜欢', [], 'like'],
  ['yue', '朋友', [], 'friend'],
  ['yue', '唔該', [], 'thank'],
  ['yue', '銀行', [], 'bank'],
  ['ja', '空', [], 'sky', 'そら'],
  ['ja', '愛', [], 'love'],
  ['ja', '名前', [], 'name'],
  ['ja', '君', [], 'you'],
];

describe('meaning relevance (≥ 85 % of the probe appears in the top 3 senses)', () => {
  it('finds the expected gloss', async () => {
    const misses: string[] = [];
    for (const [lang, surface, cands, expected, reading] of MEANINGS) {
      const token = {
        start: 0,
        end: surface.length,
        surface,
        kind: 'word',
        lang,
        ruby: [],
        reading: reading ?? null,
        roman: null,
        lemma: null,
        pos: null,
        dict: null,
        attachToPrev: false,
        confidence: 'high',
        notes: [],
        ...(cands.length ? { lemmaCandidates: cands } : {}),
      } as Token;
      const r = await lookupWord(token, lang);
      const top =
        r.status === 'ok'
          ? r.entries
              .flatMap((e) => e.senses)
              .slice(0, 3)
              .flatMap((s) => s.gloss)
              .join(' | ')
              .toLowerCase()
          : '';
      if (!top.includes(expected))
        misses.push(`${lang}:${surface} expected "${expected}", got "${top}"`);
    }
    report['meanings'] = { total: MEANINGS.length, misses };
    mkdirSync(path.join(root, 'reports'), { recursive: true });
    writeFileSync(path.join(root, 'reports', 'dictionary.json'), JSON.stringify(report, null, 2));
    expect(
      (100 * (MEANINGS.length - misses.length)) / MEANINGS.length,
      misses.join('\n'),
    ).toBeGreaterThanOrEqual(85);
  }, 60_000);
});
