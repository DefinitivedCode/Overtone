import { deleteBlocks, getDictDb, packMetaKey, retireLegacyEntries } from './db';
import type { DictBlock } from './db';
import { evictPackFiles, storeTokenizer } from './resources';
import { dictionaryBlock } from './types';
import type { PackInfo, PackRow } from './types';

export interface InstallProgress {
  phase: 'download' | 'install';
  loaded: number;
  total: number;
}

export interface InstallOptions {
  /** Base URL packs are served from (default: the app's own `packs/` folder). */
  baseUrl?: string;
  onProgress?: (p: InstallProgress) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export class PackInstallError extends Error {
  constructor(
    readonly kind: 'network' | 'checksum' | 'format' | 'storage' | 'aborted',
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'PackInstallError';
  }
}

const BATCH = 5_000;

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PackInstallError('aborted', 'Installation cancelled');
}

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function download(
  url: string,
  expectedBytes: number,
  o: InstallOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const f = o.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url, { signal: o.signal });
  } catch (e) {
    if (o.signal?.aborted) throw new PackInstallError('aborted', 'Download cancelled', e);
    throw new PackInstallError(
      'network',
      'The download failed. Check your connection and try again.',
      e,
    );
  }
  if (!res.ok || !res.body)
    throw new PackInstallError('network', `The download failed (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || expectedBytes;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      o.onProgress?.({ phase: 'download', loaded, total });
    }
  } catch (e) {
    if (o.signal?.aborted) throw new PackInstallError('aborted', 'Download cancelled', e);
    throw new PackInstallError('network', 'The download was interrupted. Try again.', e);
  }
  const all = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}

function parseRow(line: string): PackRow {
  try {
    const row = JSON.parse(line) as PackRow;
    if (
      row &&
      typeof row.f === 'string' &&
      row.f &&
      Number.isSafeInteger(row.e) &&
      typeof row.r === 'string' &&
      (row.a === undefined ||
        (Array.isArray(row.a) && row.a.every((r) => typeof r === 'string'))) &&
      (row.q === 0 || row.q === 1) &&
      Array.isArray(row.s) &&
      row.s.every((s) => s && Array.isArray(s.g) && s.g.every((g) => typeof g === 'string'))
    )
      return row;
  } catch (e) {
    throw new PackInstallError('format', 'The language data is malformed.', e);
  }
  throw new PackInstallError('format', 'The language data is malformed.');
}

/** Stream bounded chunks without awaiting once per row. */
async function* readLines(bytes: Uint8Array, signal?: AbortSignal): AsyncGenerator<string[]> {
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream('utf-8', { fatal: true }))
    .getReader();
  let carry = '';
  try {
    for (;;) {
      checkAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      const lines = (carry + value).split('\n');
      carry = lines.pop() ?? '';
      yield lines;
    }
    if (carry) yield [carry];
  } catch (e) {
    if (e instanceof PackInstallError) throw e;
    throw new PackInstallError('format', 'The language data could not be decompressed.', e);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Stage verified blocks in bounded transactions. Only the current attempt can publish or write. */
export async function installPack(info: PackInfo, o: InstallOptions = {}): Promise<void> {
  checkAborted(o.signal);
  const db = getDictDb();
  const base = o.baseUrl ?? import.meta.env.BASE_URL + 'packs/';
  const generation = crypto.randomUUID();
  const key = packMetaKey(info.id);
  const tokenizerFile = info.files.find((file) => file.role === 'tokenizer');
  if (info.lang === 'ja' && !tokenizerFile)
    throw new PackInstallError('format', 'The Japanese language pack is missing its tokenizer.');
  const tokenizer = tokenizerFile
    ? new URL(`${base}${tokenizerFile.path}?install=${generation}`, globalThis.location?.href).href
    : undefined;
  const verifyOwner = async () => {
    checkAborted(o.signal);
    if ((await db.staging.get(info.id))?.generation !== generation)
      throw new PackInstallError('aborted', 'Installation was replaced or removed');
  };

  let inserted = 0;
  let batchRows = 0;
  let batch: DictBlock[] = [];
  let bucket = -1;
  let head = -1;
  let linesForHead: string[] = [];
  let parts: Uint8Array<ArrayBuffer>[] = [];
  let ranges: DictBlock['ranges'] = new Map();
  let size = 0;
  const encoder = new TextEncoder();
  const finishHead = () => {
    if (!linesForHead.length) return;
    const bytes = encoder.encode(linesForHead.join('\n'));
    ranges.set(head, [size, size + bytes.length]);
    parts.push(bytes);
    size += bytes.length;
    linesForHead = [];
  };
  const finishBlock = () => {
    if (bucket < 0) return;
    const data = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      data.set(part, offset);
      offset += part.length;
    }
    batch.push({ generation, bucket, data, ranges });
    parts = [];
    ranges = new Map();
    size = 0;
  };
  const flush = async () => {
    await db.transaction('rw', [db.staging, db.blocks], async () => {
      await verifyOwner();
      await db.blocks.bulkAdd(batch);
    });
    inserted += batchRows;
    batchRows = 0;
    batch = [];
    o.onProgress?.({ phase: 'install', loaded: inserted, total: info.rows });
  };

  try {
    const replaced = await db.transaction('rw', [db.staging, db.blocks], async () => {
      checkAborted(o.signal);
      const previous = await db.staging.get(info.id);
      if (previous) await deleteBlocks(db, previous.generation);
      await db.staging.put({ id: info.id, generation, tokenizer });
      return previous;
    });
    if (replaced?.tokenizer) await evictPackFiles([replaced.tokenizer]);
    let downloaded = 0;
    for (const file of info.files) {
      const url = base + file.path;
      const bytes = await download(url, file.bytes, {
        ...o,
        onProgress: (p) =>
          o.onProgress?.({ ...p, loaded: downloaded + p.loaded, total: info.bytes }),
      });
      downloaded += bytes.length;
      const digest = hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
      if (digest !== file.sha256) {
        await evictPackFiles([url]);
        throw new PackInstallError(
          'checksum',
          'The downloaded data did not match its checksum and was discarded.',
        );
      }
      if (file.role === 'tokenizer' && tokenizer) {
        checkAborted(o.signal);
        await storeTokenizer(tokenizer, bytes);
        continue;
      }
      for await (const lines of readLines(bytes, o.signal)) {
        for (const line of lines) {
          if (!line) continue;
          const nextHead = parseRow(line).f.codePointAt(0)!;
          if (nextHead !== head) {
            if (nextHead < head)
              throw new PackInstallError('format', 'The language data is out of order.');
            finishHead();
            const nextBucket = dictionaryBlock(nextHead, info.lang);
            if (nextBucket !== bucket) {
              finishBlock();
              if (batchRows >= BATCH) await flush();
              bucket = nextBucket;
            }
            head = nextHead;
          }
          linesForHead.push(line);
          batchRows++;
        }
      }
    }
    if (inserted + batchRows !== info.rows || info.rows <= 0)
      throw new PackInstallError('format', 'The language data has an unexpected entry count.');
    finishHead();
    finishBlock();
    if (batch.length) await flush();

    // Switch visibility and retire old data together. A failed update leaves the active pack intact.
    const previous = await db.transaction(
      'rw',
      [db.entries, db.meta, db.staging, db.blocks],
      async () => {
        await verifyOwner();
        const old = (await db.meta.get(key))?.value;
        if (old?.generation) await deleteBlocks(db, old.generation);
        else await retireLegacyEntries(db, info.lang);
        checkAborted(o.signal);
        await db.meta.put({
          key,
          value: {
            id: info.id,
            lang: info.lang,
            version: info.version,
            rows: inserted,
            bytes: info.bytes,
            installedAt: Date.now(),
            generation,
            files: info.files.map((file) => file.path),
            tokenizer,
          },
        });
        await db.staging.delete(info.id);
        return old;
      },
    );
    if (previous?.version !== info.version && previous?.files)
      await evictPackFiles(previous.files.map((file) => base + file));
    if (previous?.tokenizer) await evictPackFiles([previous.tokenizer]);
  } catch (e) {
    await db
      .transaction('rw', [db.staging, db.blocks], async () => {
        if ((await db.staging.get(info.id))?.generation !== generation) return;
        await deleteBlocks(db, generation);
        await db.staging.delete(info.id);
      })
      .catch(() => undefined); // If storage is unavailable, the next attempt discards the staging record.
    if (tokenizer) await evictPackFiles([tokenizer]);
    if (e instanceof PackInstallError) throw e;
    throw new PackInstallError(
      'storage',
      'Could not store the language data (is the device out of space?).',
      e,
    );
  }
}
