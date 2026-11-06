/**
 * Native-speaker review sheets for the linguistic fixtures (issue #14).
 *
 *   npm run review-sheets                                  -> writes docs/review/<lang>.md (a prioritised sample)
 *   npm run review-sheets -- apply docs/review/ko.md --reviewer "Name"   -> records a filled-in sheet
 *
 * A reviewer marks each row `y` (the expected reading is right) or `n` (wrong) and writes the correct reading in the
 * last column. Applying a sheet marks `y` rows as reviewed (with reviewer and date) and records the correction of `n`
 * rows as a `reviewNote` WITHOUT touching the expectation: a person then fixes the fixture (or the engine) on purpose.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format } from 'prettier';

export const LANGS = ['ko', 'ja', 'zh', 'yue'] as const;
export type Lang = (typeof LANGS)[number];

export interface Fixture {
  id: string;
  lang: string;
  text: string;
  expected: {
    romanLine?: string;
    reading?: string;
    tokens?: Array<{ surface: string; reading: string }>;
  };
  tags?: string[];
  reviewed?: boolean;
  reviewedBy?: string;
  reviewedOn?: string;
  reviewNote?: string;
  [key: string]: unknown;
}

export const SAMPLE_SIZE = 40;

/** The riskiest categories first: a reviewer's 15 minutes should go where a self-authored fixture is likeliest wrong. */
const PRIORITY: Record<Lang, string[]> = {
  ko: [
    'n-insertion-exception',
    'ㄴ-insertion',
    'irregular',
    'lyric-spelling',
    'contraction',
    'rule',
    'particle',
  ],
  ja: [
    'jukujikun',
    'ambiguous',
    'poetic',
    'okurigana',
    'long-vowels',
    'counters-iteration',
    'loans',
  ],
  zh: ['polyphone', 'neutral', 'yi-bu', 'poem', 'traditional'],
  yue: ['polyphone', 'literary-colloquial', 'lyric', 'folk', 'simplified'],
};

const tagRank = (lang: Lang, f: Fixture): number => {
  const tag = f.tags?.[0] ?? '';
  const i = PRIORITY[lang].findIndex((p) => tag.startsWith(p));
  return i === -1 ? PRIORITY[lang].length : i;
};

/** Deterministic and spread across categories: round-robin by first tag, riskiest categories first, unreviewed only. */
export function pickSample(lang: Lang, entries: readonly Fixture[], n = SAMPLE_SIZE): Fixture[] {
  const groups = new Map<string, Fixture[]>();
  for (const f of entries.filter((e) => !e.reviewed)) {
    const key = f.tags?.[0] ?? '';
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  const ordered = [...groups.values()].sort((a, b) => tagRank(lang, a[0]!) - tagRank(lang, b[0]!));
  const out: Fixture[] = [];
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const g of ordered) {
      const f = g[round];
      if (f && out.length < n) {
        out.push(f);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

export function expectedText(f: Fixture): string {
  const e = f.expected;
  if (e.reading) return e.reading;
  const tokens = (e.tokens ?? []).map((t) => `${t.surface}=${t.reading}`).join(' ');
  return [e.romanLine, tokens && `(${tokens})`].filter(Boolean).join(' ');
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const HOW: Record<Lang, string> = {
  ko: 'Check the **romanisation** (Revised Romanization, written as pronounced: 국물 is *gungmul*). Mark `n` if the pronunciation or spelling is wrong, and write the right romanisation.',
  ja: 'Check the **romaji** and the kanji **readings in brackets** (for example 風=かぜ). Mark `n` if any reading is wrong for this sentence, and write the right reading.',
  zh: 'Check the **pinyin** (tone numbers, read in context: 长 in 长大 is *zhang3*). Mark `n` if any syllable or tone is wrong, and write the right pinyin.',
  yue: 'Check the **Jyutping** (tone numbers, read in context, colloquial reading where the line is colloquial). Mark `n` if any syllable or tone is wrong, and write the right Jyutping.',
};

export function buildSheet(lang: Lang, sample: readonly Fixture[]): string {
  const rows = sample.map(
    (f) => `| ${f.id} | ${cell(f.text)} | ${cell(expectedText(f))} |   |   |`,
  );
  return `# Review sheet: ${lang}

${sample.length} lines, chosen across the categories most likely to be wrong. About 15 minutes.

${HOW[lang]}

- **OK column:** \`y\` = the expected reading is right, \`n\` = wrong, blank = skipped.
- **Correction column:** only needed for \`n\`.
- Do not edit the ID column or the table structure.
- These readings were written by the implementer (an AI) and have never been checked by a fluent speaker. That is the point of this review.

| ID | Text | Expected | OK (y/n) | Correction |
| --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

export interface ReviewRow {
  id: string;
  ok: boolean | null;
  note: string;
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

export function parseSheet(md: string): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const [id, , , ok, note] = splitRow(line);
    if (!id || id === 'ID' || /^-+$/.test(id)) continue;
    const mark = (ok ?? '').toLowerCase();
    rows.push({
      id,
      ok: ['y', 'yes', '✓'].includes(mark) ? true : ['n', 'no', '✗'].includes(mark) ? false : null,
      note: note ?? '',
    });
  }
  return rows;
}

export interface ApplyResult {
  reviewed: number;
  flagged: Array<{ id: string; note: string }>;
  skipped: number;
  unknown: string[];
}

/** Mutates `fixtures`: `y` marks reviewed with reviewer/date; `n` sets a reviewNote only (the expectation is left alone). */
export function applyReview(
  fixtures: Fixture[],
  rows: readonly ReviewRow[],
  reviewer: string,
  date: string,
): ApplyResult {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const result: ApplyResult = { reviewed: 0, flagged: [], skipped: 0, unknown: [] };
  for (const row of rows) {
    const f = byId.get(row.id);
    if (!f) result.unknown.push(row.id);
    else if (row.ok === null) result.skipped++;
    else if (row.ok) {
      f.reviewed = true;
      f.reviewedBy = reviewer;
      f.reviewedOn = date;
      delete f.reviewNote;
      result.reviewed++;
    } else {
      f.reviewNote = `${reviewer} ${date}: ${row.note || '(marked wrong, no correction given)'}`;
      result.flagged.push({ id: row.id, note: row.note });
    }
  }
  return result;
}

// ---------- CLI ----------

const root = path.resolve(import.meta.dirname, '..', '..');
const dir = (lang: Lang) => path.join(root, 'fixtures', 'linguistic', lang);

function load(lang: Lang): Array<{ file: string; entries: Fixture[] }> {
  return readdirSync(dir(lang))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: path.join(dir(lang), f),
      entries: JSON.parse(readFileSync(path.join(dir(lang), f), 'utf8')) as Fixture[],
    }));
}

/** Fixtures are stored as plain 2-space JSON (not Prettier-formatted); keep that so a review changes only what it must. */
function writeJson(file: string, data: unknown): void {
  writeFileSync(
    file,
    `${JSON.stringify(data, null, 2)}
`,
  );
}

async function main(argv: string[]): Promise<void> {
  if (argv[0] === 'apply') {
    const sheet = argv[1];
    const at = argv.indexOf('--reviewer');
    const reviewer = at >= 0 ? argv[at + 1] : undefined;
    if (!sheet || !reviewer)
      throw new Error('usage: review-sheets apply <sheet.md> --reviewer "Name"');
    const lang = path.basename(sheet, '.md') as Lang;
    if (!LANGS.includes(lang)) throw new Error(`sheet must be named <lang>.md, got ${sheet}`);
    const files = load(lang);
    const result = applyReview(
      files.flatMap((f) => f.entries),
      parseSheet(readFileSync(sheet, 'utf8')),
      reviewer,
      new Date().toISOString().slice(0, 10),
    );
    for (const f of files) writeJson(f.file, f.entries);
    console.log(
      `${lang}: ${result.reviewed} marked reviewed, ${result.flagged.length} flagged, ${result.skipped} skipped` +
        (result.unknown.length ? `, unknown ids: ${result.unknown.join(', ')}` : ''),
    );
    for (const f of result.flagged)
      console.log(`  FIX ${f.id}: ${f.note || '(no correction given)'}`);
    return;
  }
  const out = path.join(root, 'docs', 'review');
  mkdirSync(out, { recursive: true });
  for (const lang of LANGS) {
    const sample = pickSample(
      lang,
      load(lang).flatMap((f) => f.entries),
    );
    const file = path.join(out, `${lang}.md`);
    writeFileSync(file, await format(buildSheet(lang, sample), { parser: 'markdown' }));
    console.log(`${file}: ${sample.length} lines`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  await main(process.argv.slice(2));
