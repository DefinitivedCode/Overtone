import { getDictDb } from './db';
import type { PackRow } from './types';

const decoder = new TextDecoder();
/** Pack blocks for the CJK Unified Ideographs (and Extension A) pages (see `dictionaryBlock`). */
const FIRST_BUCKET = 0x34;
const LAST_BUCKET = 0x9f;

/**
 * Ordinary (common) JMdict rows whose written form starts with a kanji, read from the installed Japanese pack.
 * `null` when the pack is not installed (or uses the legacy per-row store). Only lines flagged `"q":1` are parsed, so
 * this stays quick even though the pack has hundreds of thousands of rows.
 */
export async function scanCommonKanjiRows(): Promise<PackRow[] | null> {
  const db = getDictDb();
  return db.transaction('r', [db.blocks, db.meta], async () => {
    const pack = (await db.meta.toArray()).map((m) => m.value).find((p) => p.lang === 'ja');
    if (!pack?.generation) return null;
    const rows: PackRow[] = [];
    for (let bucket = FIRST_BUCKET; bucket <= LAST_BUCKET; bucket++) {
      const block = await db.blocks.get([pack.generation, bucket]);
      if (!block) continue;
      for (const [start, end] of block.ranges.values())
        for (const line of decoder.decode(block.data.subarray(start, end)).split('\n'))
          if (line.includes('"q":1')) rows.push(JSON.parse(line) as PackRow);
    }
    return rows;
  });
}
