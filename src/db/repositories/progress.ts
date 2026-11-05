import { guard } from '../errors';
import { getDb } from '../schema';
import { bumpBackupCounters, effectiveKind, recomputeCounts } from './internal';

export function getLearnedKeys(songId: string): Promise<Set<string>> {
  return guard(async () => {
    const rows = await getDb().progress.where('songId').equals(songId).toArray();
    return new Set(rows.map((r) => r.lineKey));
  });
}

/**
 * Sets a key learned/unlearned. Repeated lines share one state (J7.3). A key that is not a lyric
 * line of this song is ignored. Returns the new state.
 */
export function setLearned(
  songId: string,
  lineKey: string,
  learned: boolean,
  now = Date.now(),
): Promise<boolean> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.songs, db.lines, db.progress, db.settings], async () => {
      const matches = (
        await db.lines.where('[songId+key]').equals([songId, lineKey]).toArray()
      ).filter((l) => effectiveKind(l) === 'lyric');
      if (matches.length === 0) return false;
      const existing = await db.progress.get([songId, lineKey]);
      if (learned && !existing) {
        await db.progress.add({ songId, lineKey, learnedAt: now });
        await bumpBackupCounters(db, { changes: 1 });
      } else if (!learned && existing) {
        await db.progress.delete([songId, lineKey]);
        await bumpBackupCounters(db, { changes: 1 });
      }
      await recomputeCounts(db, songId);
      return learned;
    });
  });
}

export function toggleLearned(songId: string, lineKey: string, now = Date.now()): Promise<boolean> {
  return guard(async () => {
    const current = await getDb().progress.get([songId, lineKey]);
    return setLearned(songId, lineKey, !current, now);
  });
}

export function resetProgress(songId: string): Promise<number> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.songs, db.lines, db.progress, db.settings], async () => {
      const n = await db.progress.where('songId').equals(songId).delete();
      await recomputeCounts(db, songId);
      if (n > 0) await bumpBackupCounters(db, { changes: n });
      return n;
    });
  });
}

/** Learned ÷ learnable, from stored (cached) counts — identical in every view (J7.2). */
export function progressFraction(song: { lineCount: number; learnedCount: number }): number {
  return song.lineCount === 0 ? 0 : song.learnedCount / song.lineCount;
}
