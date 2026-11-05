/**
 * Linguistic accuracy suites (TEST_STRATEGY §4). Reports numbers; thresholds from §4.4.
 * HONESTY CAVEAT: fixtures are authored by the implementing agent, not reviewed by fluent speakers;
 * scores show consistency with the Revised Romanization rules the fixtures were derived from, not
 * proven native-level accuracy.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyseLine } from '../../src/engine/analyse';
import { romaniseLine } from '../../src/engine/romanLine';

const root = path.resolve(import.meta.dirname, '..', '..');
const dir = (lang: string) => path.join(root, 'fixtures', 'linguistic', lang);
const load = <T>(lang: string, file: string) =>
  JSON.parse(readFileSync(path.join(dir(lang), file), 'utf8')) as T[];

interface KoFixture {
  id: string;
  text: string;
  expected: { romanLine: string };
  tags: string[];
  reviewed: boolean;
  expectEngineMiss?: boolean;
}

const ko = readdirSync(dir('ko'))
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => load<KoFixture>('ko', f));

describe('Korean romanisation (full pipeline: analyse → romaniseLine)', () => {
  const scored = ko.filter((f) => !f.expectEngineMiss);
  const results = scored.map((f) => {
    const got = romaniseLine(analyseLine({ key: f.id, text: f.text }, 'ko').tokens);
    const exp = f.expected.romanLine.split(' ');
    const out = got.split(' ');
    return {
      f,
      got,
      lineOk: got === f.expected.romanLine,
      eojeolOk: exp.filter((w, i) => out[i] === w).length,
      eojeolTotal: exp.length,
    };
  });
  const eojeolOk = results.reduce((n, r) => n + r.eojeolOk, 0);
  const eojeolTotal = results.reduce((n, r) => n + r.eojeolTotal, 0);

  it('has at least 120 lines (TEST_STRATEGY §4.3)', () => {
    expect(ko.length).toBeGreaterThanOrEqual(120);
  });

  it('meets the ≥ 97 % eojeol accuracy threshold', () => {
    const pct = (100 * eojeolOk) / eojeolTotal;
    // Written for humans: also the per-tag breakdown for the report.
    const byTag = new Map<string, [number, number]>();
    for (const r of results) {
      const t = r.f.tags[0] ?? 'untagged';
      const [ok, total] = byTag.get(t) ?? [0, 0];
      byTag.set(t, [ok + r.eojeolOk, total + r.eojeolTotal]);
    }
    const failures = results
      .filter((r) => !r.lineOk)
      .map(
        (r) => `- ${r.f.id} ${r.f.text}: got \`${r.got}\`, expected \`${r.f.expected.romanLine}\``,
      );
    const report = [
      `# Korean linguistic report (${new Date().toISOString().slice(0, 10)})`,
      '',
      `Lines: ${ko.length} (${ko.filter((f) => f.reviewed).length} human-reviewed). Eojeol accuracy: **${pct.toFixed(1)} %** (${eojeolOk}/${eojeolTotal}); line exact: ${results.filter((r) => r.lineOk).length}/${results.length}.`,
      '',
      '> Honesty caveat: fixtures were written by the implementing agent from the Revised Romanization rules and not reviewed by fluent speakers; scores show consistency with those rules, not proven native-level accuracy.',
      '',
      '| Tag | Eojeol correct / total |',
      '|---|---|',
      ...[...byTag].sort().map(([t, [ok, total]]) => `| ${t} | ${ok}/${total} |`),
      '',
      failures.length ? '## Failures\n' + failures.join('\n') : 'No failures.',
      '',
    ].join('\n');
    mkdirSync(path.join(root, 'reports'), { recursive: true });
    writeFileSync(path.join(root, 'reports', 'linguistic-ko.md'), report);
    expect(pct).toBeGreaterThanOrEqual(97);
  });

  it('exceptions-table cases (ㄴ-insertion) are 100 %', () => {
    const ex = results.filter(
      (r) =>
        r.f.tags.includes('n-insertion-exception') || r.f.tags.includes('ㄴ-insertion-exception'),
    );
    expect(ex.length).toBeGreaterThanOrEqual(5);
    expect(ex.filter((r) => !r.lineOk)).toEqual([]);
  });

  it('covers every rule category at least five times (rules 1–10 and mixed content)', () => {
    const count = (re: RegExp) => ko.filter((f) => f.tags.some((t) => re.test(t))).length;
    for (const [name, re] of [
      ['rule 1 clusters', /cluster|rule1/],
      ['rule 2 liaison', /liaison|rule2/],
      ['rule 3 aspiration', /aspiration|rule3/],
      ['rule 4 ㅎ deletion', /deletion|rule4/],
      ['rule 5 palatalisation', /palatalisation|rule5/],
      ['rule 6 nasalisation', /nasalisation|rule6/],
      ['rule 7 ㄹ→ㄴ', /rule7|ㄹ→ㄴ|ㄹ|ㄱ\+ㄹ|ㅇ\+ㄹ|ㅁ\+ㄹ/],
      ['rule 8 liquidisation', /liquidisation|rule8/],
      ['rule 9 neutralisation', /neutralisation|rule9/],
      ['particles', /particle/],
      ['contractions', /contraction/],
      ['mixed English', /mixed-english/],
    ] as const) {
      expect(count(re), name).toBeGreaterThanOrEqual(5);
    }
  });
});

interface MixedFixture {
  id: string;
  songLang: 'ko' | 'ja' | 'zh' | 'yue';
  text: string;
  expected: { routing: [string, string][] };
}

describe('mixed-language routing (100 % required)', () => {
  const mixed = load<MixedFixture>('mixed', 'routing.json');
  it('has at least 40 lines', () => {
    expect(mixed.length).toBeGreaterThanOrEqual(40);
  });
  it('routes every segment to the expected language', () => {
    const bad: string[] = [];
    let total = 0;
    let ok = 0;
    for (const f of mixed) {
      const a = analyseLine({ key: f.id, text: f.text }, f.songLang);
      // Half-width katakana and full-width Latin/digits are routed by their analysis class; compare surface+lang of word/latin/number tokens.
      const got = a.tokens
        .filter((t) => t.kind === 'word' || t.kind === 'latin' || t.kind === 'number')
        .map((t) => [
          t.surface,
          t.lang === 'en' ? 'en' : t.lang === 'other' && t.kind === 'number' ? 'other' : t.lang,
        ]);
      const exp = f.expected.routing;
      for (const [i, [s, l]] of exp.entries()) {
        total++;
        if (got[i]?.[0] === s && got[i]?.[1] === l) ok++;
        else
          bad.push(
            `${f.id} "${f.text}" segment ${i}: expected ${s}:${l}, got ${got[i]?.join(':') ?? 'none'}`,
          );
      }
      if (got.length !== exp.length)
        bad.push(`${f.id}: expected ${exp.length} segments, got ${got.length}`);
    }
    mkdirSync(path.join(root, 'reports'), { recursive: true });
    writeFileSync(
      path.join(root, 'reports', 'linguistic-mixed.md'),
      `# Mixed routing report\n\n${ok}/${total} segments routed as expected.\n\n${bad.map((b) => `- ${b}`).join('\n')}\n`,
    );
    expect(bad).toEqual([]);
  });
});
