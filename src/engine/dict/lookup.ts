import { deleteBlocks, getDictDb, packMetaKey, retireLegacyEntries } from './db';
import type { InstalledPack } from './db';
import { evictPackFiles } from './resources';
import { dictionaryBlock } from './types';
import type { DictRow, PackRow } from './types';

/** Test seam: real pack fixtures use an in-memory dictionary instead of fake IndexedDB. */
export interface DictBackend {
  installedVersion(lang: DictRow['lang']): Promise<string | null>;
  lookup(lang: DictRow['lang'], forms: readonly string[]): Promise<Map<string, DictRow[]>>;
}
let override: DictBackend | null = null;
export function setDictBackend(b: DictBackend | null): void {
  override = b;
}

export async function listInstalled(): Promise<InstalledPack[]> {
  return (await getDictDb().meta.toArray()).map((m) => m.value);
}

export async function installedVersion(lang: DictRow['lang']): Promise<string | null> {
  if (override) return override.installedVersion(lang);
  return (await listInstalled()).find((p) => p.lang === lang)?.version ?? null;
}

/** Returns null when no matching version is installed. Reads metadata and data in the same snapshot. */
export async function lookupInstalled(
  lang: DictRow['lang'],
  forms: readonly string[],
  version?: string | null,
): Promise<Map<string, DictRow[]> | null> {
  if (version === null) return null;
  if (override) {
    const active = await override.installedVersion(lang);
    return active && (version === undefined || active === version)
      ? override.lookup(lang, forms)
      : null;
  }
  const db = getDictDb();
  const requested = new Map<number, Set<string>>();
  const buckets = new Set<number>();
  for (const form of forms) {
    const head = form.codePointAt(0);
    if (head === undefined) continue;
    buckets.add(dictionaryBlock(head, lang));
    const group = requested.get(head);
    if (group) group.add(form);
    else requested.set(head, new Set([form]));
  }
  const out = new Map<string, DictRow[]>();
  const add = (row: DictRow) => {
    const hits = out.get(row.f);
    if (hits) hits.push(row);
    else out.set(row.f, [row]);
  };
  return db.transaction('r', [db.entries, db.blocks, db.meta], async () => {
    const pack = (await listInstalled()).find((p) => p.lang === lang);
    if (!pack || (version !== undefined && pack.version !== version)) return null;
    const { generation, version: packVersion } = pack;
    if (generation) {
      const decoder = new TextDecoder();
      // Keep one encoded block at a time. Parse only its requested initial characters.
      for (const bucket of buckets) {
        const block = await db.blocks.get([generation, bucket]);
        if (!block) continue;
        for (const [head, [start, end]] of block.ranges) {
          const group = requested.get(head);
          if (!group) continue;
          const lines = decoder.decode(block.data.subarray(start, end)).split('\n');
          for (const line of lines) {
            const row = JSON.parse(line) as PackRow;
            if (group.has(row.f)) add({ ...row, lang, packVersion });
          }
        }
      }
    } else if (forms.length) {
      const rows = await db.entries
        .where('[lang+f]')
        .anyOf([...new Set(forms)].map((form) => [lang, form]))
        .toArray();
      for (const row of rows) if (row.packVersion === packVersion) add(row);
    }
    for (const hits of out.values()) hits.sort((a, b) => b.q - a.q || a.e - b.e);
    return out;
  });
}

export async function lookupMany(
  lang: DictRow['lang'],
  forms: readonly string[],
): Promise<Map<string, DictRow[]>> {
  return (await lookupInstalled(lang, forms)) ?? new Map();
}

/** Removes the installed pack and supersedes any unfinished install for that pack. */
export async function removePack(id: string): Promise<InstalledPack | undefined> {
  const db = getDictDb();
  const { meta, pending } = await db.transaction(
    'rw',
    [db.entries, db.blocks, db.meta, db.staging],
    async () => {
      const key = packMetaKey(id);
      const meta = (await db.meta.get(key))?.value;
      const pending = await db.staging.get(id);
      if (pending) await deleteBlocks(db, pending.generation);
      if (meta?.generation) await deleteBlocks(db, meta.generation);
      else if (meta) await retireLegacyEntries(db, meta.lang);
      await db.staging.delete(id);
      await db.meta.delete(key);
      return { meta, pending };
    },
  );
  await evictPackFiles([meta?.tokenizer, pending?.tokenizer].filter((url) => url !== undefined));
  return meta;
}
