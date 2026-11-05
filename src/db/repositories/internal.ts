import type { OvertoneDB } from '../schema';
import type { Line, LineKind } from '../types';
import { withDefaults } from './settings';

export const effectiveKind = (l: Pick<Line, 'kind' | 'kindOverride'>): LineKind =>
  l.kindOverride ?? l.kind;

/**
 * Recomputes the cached `lineCount`/`learnedCount` for a song. Must run inside a transaction that
 * includes songs, lines and progress. Counts are per occurrence (PRODUCT_SPEC J7.2/J7.3).
 */
export async function recomputeCounts(db: OvertoneDB, songId: string): Promise<void> {
  const lines = await db.lines.where('songId').equals(songId).toArray();
  const learned = new Set(
    (await db.progress.where('songId').equals(songId).toArray()).map((p) => p.lineKey),
  );
  const lyric = lines.filter((l) => effectiveKind(l) === 'lyric');
  await db.songs.update(songId, {
    lineCount: lyric.length,
    learnedCount: lyric.filter((l) => learned.has(l.key)).length,
  });
}

/** Tracks unexported changes for the backup reminder (J11.7). Needs `settings` in the transaction. */
export async function bumpBackupCounters(
  db: OvertoneDB,
  delta: { songs?: number; changes?: number },
): Promise<void> {
  const s = withDefaults(await db.settings.get('app'));
  s.backup.songsSinceExport += delta.songs ?? 0;
  s.backup.changesSinceExport += delta.changes ?? 0;
  await db.settings.put(s);
}
