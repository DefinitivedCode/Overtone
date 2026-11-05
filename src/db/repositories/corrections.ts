import { guard } from '../errors';
import { getDb } from '../schema';
import type { Correction, LangCode } from '../types';
import { bumpBackupCounters, effectiveKind } from './internal';

export type NewCorrection = Omit<Correction, 'id' | 'createdAt' | 'updatedAt'>;

export function createCorrection(input: NewCorrection, now = Date.now()): Promise<Correction> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.corrections, db.settings], async () => {
      const c: Correction = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      await db.corrections.add(c);
      await bumpBackupCounters(db, { changes: 1 });
      return c;
    });
  });
}

export function updateCorrection(
  id: string,
  patch: Partial<Pick<Correction, 'patch' | 'lineKey' | 'occurrence'>>,
  now = Date.now(),
): Promise<Correction> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.corrections, db.settings], async () => {
      const current = await db.corrections.get(id);
      if (!current) throw new Error('Correction not found');
      const next: Correction = { ...current, ...patch, updatedAt: now };
      await db.corrections.put(next);
      await bumpBackupCounters(db, { changes: 1 });
      return next;
    });
  });
}

/** Revert = delete the correction; the generated value shows again (J8.5). */
export function deleteCorrection(id: string): Promise<void> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.corrections, db.settings], async () => {
      await db.corrections.delete(id);
      await bumpBackupCounters(db, { changes: 1 });
    });
  });
}

export function listCorrections(songId: string): Promise<Correction[]> {
  return guard(() => getDb().corrections.where('songId').equals(songId).toArray());
}

/** Corrections that apply under the song's current language; others stay stored but inactive. */
export async function listActiveCorrections(
  songId: string,
  language: LangCode,
): Promise<Correction[]> {
  return (await listCorrections(songId)).filter((c) => c.language === language);
}

/** Corrections whose line no longer exists in the song (kept after edits; removable by the user). */
export async function listOrphanedCorrections(songId: string): Promise<Correction[]> {
  return guard(async () => {
    const db = getDb();
    const keys = new Set(
      (await db.lines.where('songId').equals(songId).toArray())
        .filter((l) => effectiveKind(l) === 'lyric')
        .map((l) => l.key),
    );
    return (await db.corrections.where('songId').equals(songId).toArray()).filter(
      (c) => c.lineKey !== null && !keys.has(c.lineKey),
    );
  });
}

/** "Clean up unused corrections": the only operation that removes corrections without a direct user edit. */
export async function deleteOrphanedCorrections(songId: string): Promise<number> {
  const orphans = await listOrphanedCorrections(songId);
  await guard(async () => {
    await getDb().corrections.bulkDelete(orphans.map((c) => c.id));
  });
  return orphans.length;
}
