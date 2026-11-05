import { normaliseLyrics, parseLyrics } from '@/lyrics/parse';
import type { ParsedLine } from '@/lyrics/parse';
import { buildSearchText } from '@/search/fold';
import { guard } from '../errors';
import { syncLibraryMarker } from '../repositories/meta';
import { effectiveKind, recomputeCounts } from '../repositories/internal';
import { withDefaults } from '../repositories/settings';
import { toLines } from '../repositories/songs';
import { getDb } from '../schema';
import type { LineKind, Song } from '../types';
import { backupChecksum } from './canonical';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, MAX_BACKUP_BYTES, backupSchema } from './format';
import type { Backup, BackupSong } from './format';
import { BackupMigrationError, migrateBackup } from './migrations';
import { LIMITS } from '@/lyrics/parse';

export type ParseResult =
  | { ok: true; backup: Backup; checksumOk: boolean; migratedFrom: number | null }
  | { ok: false; reason: string };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function findForbiddenKey(value: unknown, depth = 0): string | null {
  if (depth > 20 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = findForbiddenKey(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return key;
    const hit = findForbiddenKey((value as Record<string, unknown>)[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Validates a backup completely BEFORE anything is written (J11.3): size, JSON, forbidden keys,
 * format id, schema version (newer is rejected, older is migrated), structure and limits.
 * A checksum mismatch is not fatal — hand-edited backups are legitimate — so it is reported.
 */
export async function parseBackup(text: string): Promise<ParseResult> {
  if (text.length > MAX_BACKUP_BYTES)
    return {
      ok: false,
      reason: 'This file is larger than 50 MB, which is too big for an Overtone backup.',
    };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'This file is not valid JSON.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, reason: 'This file is not an Overtone backup.' };
  const forbidden = findForbiddenKey(raw);
  if (forbidden)
    return { ok: false, reason: `This file contains a disallowed key (“${forbidden}”).` };
  const doc = raw as Record<string, unknown>;
  if (doc['format'] !== BACKUP_FORMAT)
    return { ok: false, reason: 'This file is not an Overtone backup.' };
  const version = doc['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0)
    return { ok: false, reason: 'This backup has no valid schema version.' };
  if (version > BACKUP_SCHEMA_VERSION)
    return { ok: false, reason: 'This backup was made by a newer version of Overtone.' };

  // The producer computed the checksum over the document as written (before any migration).
  let checksumOk = false;
  try {
    checksumOk = (await backupChecksum(doc['songs'], doc['settings'])) === doc['checksum'];
  } catch {
    checksumOk = false;
  }

  let migrated: Record<string, unknown>;
  try {
    migrated = migrateBackup(doc);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof BackupMigrationError ? e.message : 'This backup could not be upgraded.',
    };
  }
  const parsed = backupSchema.safeParse(migrated);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.join('.') || 'the file' : 'the file';
    return {
      ok: false,
      reason: `This backup is not valid (${where}: ${issue?.message ?? 'unexpected value'}).`,
    };
  }
  const backup = parsed.data;

  const ids = new Set<string>();
  for (const [i, s] of backup.songs.entries()) {
    if (ids.has(s.id))
      return { ok: false, reason: `This backup lists the same song twice (songs.${i}).` };
    ids.add(s.id);
    if (normaliseLyrics(s.rawLyrics).split('\n').length > LIMITS.lyricsLines)
      return { ok: false, reason: `Song “${s.title}” has more than ${LIMITS.lyricsLines} lines.` };
  }
  return {
    ok: true,
    backup,
    checksumOk,
    migratedFrom: version < BACKUP_SCHEMA_VERSION ? version : null,
  };
}

/** Reads a user-picked file with a size guard. */
export async function readBackupFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_BACKUP_BYTES)
    return {
      ok: false,
      reason: 'This file is larger than 50 MB, which is too big for an Overtone backup.',
    };
  return parseBackup(await file.text());
}

export interface ImportPreview {
  total: number;
  newSongs: number;
  existingSongs: number;
  /** Existing songs where the file's copy has a newer `updatedAt` (Merge would take the file's text). */
  newerInFile: number;
}

export function previewImport(backup: Backup): Promise<ImportPreview> {
  return guard(async () => {
    const db = getDb();
    let existing = 0;
    let newer = 0;
    for (const s of backup.songs) {
      const local = await db.songs.get(s.id);
      if (local && local.deletedAt === null) {
        existing++;
        if (s.updatedAt > local.updatedAt) newer++;
      }
    }
    return {
      total: backup.songs.length,
      newSongs: backup.songs.length - existing,
      existingSongs: existing,
      newerInFile: newer,
    };
  });
}

interface Prepared {
  song: BackupSong;
  raw: string;
  lines: ParsedLine[];
  overrides: Map<number, LineKind>;
}

async function prepare(backup: Backup): Promise<Prepared[]> {
  const out: Prepared[] = [];
  for (const song of backup.songs) {
    const raw = normaliseLyrics(song.rawLyrics);
    out.push({
      song,
      raw,
      lines: await parseLyrics(raw),
      overrides: new Map(song.lineKindOverrides.map((o) => [o.index, o.kind])),
    });
  }
  return out;
}

export interface ImportResult {
  added: number;
  updated: number;
  keptLocal: number;
}

export type ImportMode = 'merge' | 'replace';

/**
 * Applies a validated backup in ONE transaction: any failure leaves the database untouched (J11.3).
 * Merge: newer `updatedAt` wins for text/details, learned keys are unioned, corrections unioned by id
 * (newer wins). Replace: the library is cleared first. Offering an automatic pre-import export is the
 * caller's (UI) responsibility.
 */
export async function applyImport(backup: Backup, mode: ImportMode): Promise<ImportResult> {
  const prepared = await prepare(backup); // keys computed before the transaction opens
  const result: ImportResult = { added: 0, updated: 0, keptLocal: 0 };

  await guard(() => {
    const db = getDb();
    return db.transaction(
      'rw',
      [db.songs, db.lines, db.progress, db.corrections, db.analysis, db.settings],
      async () => {
        if (mode === 'replace') {
          await Promise.all([
            db.songs.clear(),
            db.lines.clear(),
            db.progress.clear(),
            db.corrections.clear(),
            db.analysis.clear(),
          ]);
          const current = withDefaults(await db.settings.get('app'));
          await db.settings.put({ ...current, ...backup.settings, id: 'app' });
        }

        for (const p of prepared) {
          const s = p.song;
          const local = mode === 'merge' ? await db.songs.get(s.id) : undefined;
          const localLive = local && local.deletedAt === null ? local : undefined;
          const takeIncomingText = !localLive || s.updatedAt > localLive.updatedAt;

          if (!localLive) {
            // New (or previously soft-deleted): clear any leftovers for this id, then insert.
            await db.lines.where('songId').equals(s.id).delete();
            await db.progress.where('songId').equals(s.id).delete();
            await db.corrections.where('songId').equals(s.id).delete();
            result.added++;
          } else if (takeIncomingText) result.updated++;
          else result.keptLocal++;

          if (takeIncomingText) {
            const row: Song = {
              id: s.id,
              title: s.title,
              artist: s.artist,
              language: s.language,
              languageDetected: s.languageDetected,
              rawLyrics: p.raw,
              lineCount: 0,
              learnedCount: 0,
              displayMode: s.displayMode,
              cleanVariant: s.cleanVariant,
              source: s.source,
              searchText: buildSearchText(s.title, s.artist, p.raw),
              createdAt: localLive ? Math.min(localLive.createdAt, s.createdAt) : s.createdAt,
              updatedAt: s.updatedAt,
              openedAt: Math.max(s.openedAt, localLive?.openedAt ?? 0),
              deletedAt: null,
            };
            await db.songs.put(row);
            await db.lines.where('songId').equals(s.id).delete();
            await db.lines.bulkAdd(toLines(s.id, p.lines, p.overrides));
          } else if (localLive) {
            await db.songs.update(s.id, { openedAt: Math.max(s.openedAt, localLive.openedAt) });
          }

          // Learned keys: union, restricted to lyric keys of the final text.
          const finalKeys = new Set(
            (await db.lines.where('songId').equals(s.id).toArray())
              .filter((l) => effectiveKind(l) === 'lyric')
              .map((l) => l.key),
          );
          const have = new Set(
            (await db.progress.where('songId').equals(s.id).toArray()).map((r) => r.lineKey),
          );
          const stale = [...have]
            .filter((k) => !finalKeys.has(k))
            .map((k) => [s.id, k] as [string, string]);
          if (stale.length) await db.progress.bulkDelete(stale);
          const add = s.progress.filter((r) => finalKeys.has(r.lineKey) && !have.has(r.lineKey));
          if (add.length)
            await db.progress.bulkPut(
              add.map((r) => ({ songId: s.id, lineKey: r.lineKey, learnedAt: r.learnedAt })),
            );

          // Corrections: union by id, newer updatedAt wins.
          for (const c of s.corrections) {
            const existing = await db.corrections.get(c.id);
            if (!existing || c.updatedAt > existing.updatedAt)
              await db.corrections.put({ ...c, songId: s.id });
          }
          await recomputeCounts(db, s.id);
        }
      },
    );
  });
  await syncLibraryMarker();
  return result;
}
