import { APP_NAME, APP_VERSION } from '@/app/version';
import { guard } from '../errors';
import { getDb } from '../schema';
import { updateSettings, withDefaults } from '../repositories/settings';
import { backupChecksum } from './canonical';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION } from './format';
import type { Backup, BackupSong } from './format';

/**
 * Builds the backup document from IndexedDB. Derived data (analysis, searchText, counts, line rows)
 * is NOT exported — it is rebuilt on import (ARCHITECTURE §7). Output order is deterministic.
 */
export function buildBackup(now: Date = new Date()): Promise<Backup> {
  return guard(async () => {
    const db = getDb();
    const settings = withDefaults(await db.settings.get('app'));
    const songs = (await db.songs.filter((s) => s.deletedAt === null).toArray()).sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
    const out: BackupSong[] = [];
    for (const s of songs) {
      const lines = await db.lines.where('songId').equals(s.id).sortBy('index');
      const progress = await db.progress.where('songId').equals(s.id).toArray();
      const corrections = await db.corrections.where('songId').equals(s.id).toArray();
      out.push({
        id: s.id,
        title: s.title,
        artist: s.artist,
        language: s.language,
        languageDetected: s.languageDetected,
        rawLyrics: s.rawLyrics,
        lineKindOverrides: lines
          .filter((l) => l.kindOverride !== null)
          .map((l) => ({ index: l.index, kind: l.kindOverride! })),
        displayMode: s.displayMode,
        cleanVariant: s.cleanVariant,
        source: s.source,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        openedAt: s.openedAt,
        progress: progress
          .map((p) => ({ lineKey: p.lineKey, learnedAt: p.learnedAt }))
          .sort((a, b) => a.lineKey.localeCompare(b.lineKey)),
        corrections: corrections
          .map((c) => ({
            id: c.id,
            lineKey: c.lineKey,
            surface: c.surface,
            occurrence: c.occurrence,
            language: c.language,
            patch: c.patch,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      });
    }
    const backupSettings = {
      theme: settings.theme,
      textSize: settings.textSize,
      romanisation: settings.romanisation,
    };
    return {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      app: { name: APP_NAME, version: APP_VERSION },
      settings: backupSettings,
      songs: out,
      checksum: await backupChecksum(out, backupSettings),
    };
  });
}

/** Pretty-printed with 2-space indent so the file is human-inspectable. */
export const serializeBackup = (b: Backup): string => JSON.stringify(b, null, 2);

const pad = (n: number) => String(n).padStart(2, '0');
/** `overtone-backup-YYYY-MM-DD.json` in the user's local date. */
export function backupFilename(d: Date = new Date()): string {
  return `${BACKUP_FORMAT}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Call after the file was actually handed to the user (share sheet or download). */
export function recordExport(now = Date.now()): Promise<void> {
  return updateSettings((s) => ({
    ...s,
    backup: { ...s.backup, lastExportAt: now, changesSinceExport: 0, songsSinceExport: 0 },
  })).then(() => undefined);
}
