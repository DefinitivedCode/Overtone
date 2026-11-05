import type { PackRow } from '../../src/engine/dict/types';

const clip = (s: string) => s.trim().slice(0, 80);
const senses = (defs: string[]) =>
  defs
    .map(clip)
    .filter(Boolean)
    .slice(0, 5)
    .map((g) => ({ g: [g] }));

/** CC-CEDICT pinyin → tone-numbered, lower case, ü for u:. Returns [reading, isProper]. */
export function normaliseCedictPinyin(py: string): [string, boolean] {
  const proper = /^[A-Z]/.test(py);
  return [py.replace(/u:/gi, 'ü').toLowerCase(), proper];
}

/** `Traditional Simplified [pin1 yin1] /gloss/gloss/` → rows for both forms. */
export function parseCedict(text: string): PackRow[] {
  const rows: PackRow[] = [];
  let e = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = /^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/\s*$/.exec(line);
    if (!m) continue;
    const [, trad, simp, py, defs] = m as unknown as [string, string, string, string, string];
    const [r, proper] = normaliseCedictPinyin(py);
    const s = senses(defs.split('/'));
    e++;
    rows.push({ f: trad, e, r, s, q: proper ? 0 : 1 });
    if (simp !== trad) rows.push({ f: simp, e, r, s, q: proper ? 0 : 1 });
  }
  return rows;
}

/** CC-Canto / CEDICT Cantonese readings: `Trad Simp [pin1yin1] {jyut6ping3} /gloss/…/`. */
export function parseCanto(text: string, withGlosses: boolean, firstId = 1): PackRow[] {
  const rows: PackRow[] = [];
  let e = firstId;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = /^(\S+) (\S+) \[([^\]]*)\] \{([^}]+)\}(?: \/(.+)\/)?\s*$/.exec(line);
    if (!m) continue;
    const [, trad, simp, , jy, defs] = m as unknown as [
      string,
      string,
      string,
      string,
      string,
      string | undefined,
    ];
    const s = withGlosses && defs ? senses(defs.split('/')) : [];
    e++;
    rows.push({ f: trad, e, r: jy.toLowerCase(), s, q: 1 });
    if (simp !== trad) rows.push({ f: simp, e, r: jy.toLowerCase(), s, q: 1 });
  }
  return rows;
}

/** Group equal initial code points so installation can stream one shard at a time. */
export function toJsonLines(rows: PackRow[]): string {
  const sorted = rows.map((row) => ({ head: row.f.codePointAt(0)!, row }));
  sorted.sort((a, b) => a.head - b.head);
  return sorted.map(({ row }) => JSON.stringify(row)).join('\n') + '\n';
}
