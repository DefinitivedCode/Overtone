import { guard } from '../errors';
import { getDb } from '../schema';
import type { LineAnalysisCache } from '../types';

/** The analysis cache is derived data: safe to drop at any time (ARCHITECTURE §3.2). */
export function listAnalyses(songId: string): Promise<LineAnalysisCache[]> {
  return guard(() => getDb().analysis.where('songId').equals(songId).toArray());
}

export function putAnalyses(rows: LineAnalysisCache[]): Promise<void> {
  return guard(async () => {
    if (rows.length > 0) await getDb().analysis.bulkPut(rows);
  });
}

/** Removes cache rows of a song that are no longer needed (old engine versions, edited lines). */
export function pruneAnalyses(songId: string, keep: ReadonlySet<string>): Promise<number> {
  return guard(async () => {
    const stale = (await getDb().analysis.where('songId').equals(songId).primaryKeys()).filter(
      (k) => !keep.has(k),
    );
    await getDb().analysis.bulkDelete(stale);
    return stale.length;
  });
}

export function clearAnalyses(songId: string): Promise<void> {
  return guard(async () => {
    await getDb().analysis.where('songId').equals(songId).delete();
  });
}
