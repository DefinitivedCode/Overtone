import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { DictRow } from './types';

export interface InstalledPack {
  id: string;
  lang: DictRow['lang'];
  version: string;
  rows: number;
  /** Compressed download size. */
  bytes: number;
  installedAt: number;
  /** Absent on installs made with the previous per-row schema. */
  generation?: string;
  files?: string[];
  tokenizer?: string;
}

interface MetaRow {
  key: string;
  value: InstalledPack;
}

export interface DictBlock {
  generation: string;
  bucket: number;
  data: Uint8Array;
  ranges: Map<number, [start: number, end: number]>;
}

/**
 * Keep the v1 store for packs installed before sharding. They can still be read offline
 * immediately after upgrading the schema. An update or removal retires the old rows.
 */
export class DictDB extends Dexie {
  entries!: Table<DictRow, number>;
  meta!: Table<MetaRow, string>;
  blocks!: Table<DictBlock, [string, number]>;
  staging!: Table<{ id: string; generation: string; tokenizer?: string }, string>;

  constructor(name = 'overtone-dict') {
    super(name);
    this.version(1).stores({
      entries: '++rowId, [lang+f], packVersion',
      meta: 'key',
    });
    this.version(2).stores({
      blocks: '[generation+bucket]',
      staging: 'id',
    });
  }
}

export const packMetaKey = (id: string): string => `pack:${id}`;

export function deleteBlocks(db: DictDB, generation: string): Promise<number> {
  return db.blocks
    .where('[generation+bucket]')
    .between([generation, Dexie.minKey], [generation, Dexie.maxKey], true, true)
    .delete();
}

/** Use a single clear when no other installed pack still relies on the legacy store. */
export async function retireLegacyEntries(db: DictDB, lang: DictRow['lang']): Promise<void> {
  const keepOther = (await db.meta.toArray()).some(
    ({ value }) => value.lang !== lang && !value.generation,
  );
  if (keepOther) {
    await db.entries
      .where('[lang+f]')
      .between([lang, Dexie.minKey], [lang, Dexie.maxKey], true, true)
      .delete();
  } else {
    await db.entries.clear();
  }
}

let current = new DictDB();
export const getDictDb = (): DictDB => current;
/** Test seam. */
export function setDictDb(db: DictDB): void {
  current = db;
}
