import { StorageError, toStorageError } from './errors';
import { getDb, watchVersionChange } from './schema';
import type { OvertoneDB } from './schema';

const RETRYABLE = new Set(['InvalidStateError', 'UnknownError', 'OpenFailedError']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Defensive open (ARCHITECTURE §10.4): some WebKit versions fail transiently after OS updates.
 * Retry once after 500 ms, then surface a typed error. A database that failed to open is NEVER
 * deleted or recreated automatically.
 */
export async function openDatabase(db: OvertoneDB = getDb(), retryDelayMs = 500): Promise<void> {
  watchVersionChange(db);
  try {
    await db.open();
    return;
  } catch (first) {
    const name = (first as { name?: string }).name ?? '';
    if (!RETRYABLE.has(name)) throw toStorageError(first);
    await sleep(retryDelayMs);
    try {
      db.close();
      await db.open();
    } catch (second) {
      const err = toStorageError(second);
      throw new StorageError(
        err.kind,
        'Overtone could not open its storage. Your data has not been touched. Try again, or reload.',
        second,
      );
    }
  }
}
