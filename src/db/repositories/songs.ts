import { diffLyricKeys } from '@/lyrics/diff';
import type { LyricsDiff } from '@/lyrics/diff';
import { normaliseLyrics, parseLyrics, validateSongInput } from '@/lyrics/parse';
import type { ParsedLine } from '@/lyrics/parse';
import { buildSearchText, withRomanised } from '@/search/fold';
import { ValidationError, guard } from '../errors';
import { getDb } from '../schema';
import type {
  CleanVariant,
  DisplayMode,
  LangCode,
  Line,
  LineKind,
  Song,
  SongSource,
} from '../types';
import { bumpBackupCounters, effectiveKind, recomputeCounts } from './internal';
import { syncLibraryMarker } from './meta';

const ROMAN_SEP = '\u0001';

export function toLines(
  songId: string,
  parsed: readonly ParsedLine[],
  overrides?: ReadonlyMap<number, LineKind>,
): Line[] {
  return parsed.map((l) => ({
    id: `${songId}:${l.index}`,
    songId,
    index: l.index,
    text: l.text,
    kind: l.kind,
    kindOverride: overrides?.get(l.index) ?? null,
    key: l.key,
    ...(l.readings ? { readings: l.readings } : {}),
  }));
}

export interface CreateSongInput {
  title: string;
  artist: string | null;
  language: LangCode;
  languageDetected: boolean;
  rawLyrics: string;
  usePastedReadings?: boolean;
  source?: SongSource;
  /** Test/import seams. */
  id?: string;
  now?: number;
}

/** Stores the song and its lines in one transaction. Never waits on language processing (J2.4). */
export async function createSong(input: CreateSongInput): Promise<Song> {
  const title = input.title.trim();
  const artist = input.artist?.trim() ? input.artist.trim() : null;
  const errors = validateSongInput({ title, artist, lyrics: input.rawLyrics });
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  const rawLyrics = normaliseLyrics(input.rawLyrics);
  const usePastedReadings = input.language === 'ja' && input.usePastedReadings === true;
  const parsed = await parseLyrics(rawLyrics, usePastedReadings); // keys are computed before the transaction opens
  const now = input.now ?? Date.now();
  const id = input.id ?? crypto.randomUUID();
  const song: Song = {
    id,
    title,
    artist,
    language: input.language,
    languageDetected: input.languageDetected,
    rawLyrics,
    ...(input.usePastedReadings !== undefined ? { usePastedReadings } : {}),
    lineCount: parsed.filter((l) => l.kind === 'lyric').length,
    learnedCount: 0,
    displayMode: 'learn',
    cleanVariant: 'original',
    source: input.source ?? { kind: 'manual' },
    searchText: buildSearchText(title, artist, parsed.map((line) => line.text).join('\n')),
    createdAt: now,
    updatedAt: now,
    openedAt: now,
    deletedAt: null,
  };
  await guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.songs, db.lines, db.settings], async () => {
      await db.songs.add(song);
      await db.lines.bulkAdd(toLines(id, parsed));
      await bumpBackupCounters(db, { songs: 1 });
    });
  });
  await syncLibraryMarker(now);
  return song;
}

export function getSong(
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<Song | undefined> {
  return guard(async () => {
    const s = await getDb().songs.get(id);
    return s && (opts.includeDeleted || s.deletedAt === null) ? s : undefined;
  });
}

/** All non-deleted songs. Libraries are small; callers filter/sort in memory (ARCHITECTURE §8). */
export function listSongs(): Promise<Song[]> {
  return guard(() =>
    getDb()
      .songs.filter((s) => s.deletedAt === null)
      .toArray(),
  );
}

export function getLines(songId: string): Promise<Line[]> {
  return guard(() => getDb().lines.where('songId').equals(songId).sortBy('index'));
}

export interface UpdateDetailsInput {
  title: string;
  artist: string | null;
  language: LangCode;
}

/**
 * Changing language keeps corrections (they become inactive, and reactivate if switched back)
 * and drops the romanised search suffix, which belonged to the old language.
 */
export async function updateDetails(
  songId: string,
  input: UpdateDetailsInput,
  now = Date.now(),
): Promise<Song> {
  const title = input.title.trim();
  const artist = input.artist?.trim() ? input.artist.trim() : null;
  const errors = validateSongInput({ title, artist, lyrics: 'x' });
  delete errors.lyrics;
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.songs, db.lines], async () => {
      const song = await db.songs.get(songId);
      if (!song || song.deletedAt !== null) throw new Error('Song not found');
      const languageChanged = song.language !== input.language;
      const suffix =
        !languageChanged && song.searchText.includes(ROMAN_SEP)
          ? ROMAN_SEP + song.searchText.split(ROMAN_SEP)[1]
          : '';
      const lyrics = song.usePastedReadings
        ? (await db.lines.where('songId').equals(songId).sortBy('index'))
            .map((line) => line.text)
            .join('\n')
        : song.rawLyrics;
      const next: Song = {
        ...song,
        title,
        artist,
        language: input.language,
        languageDetected: languageChanged ? false : song.languageDetected,
        searchText: buildSearchText(title, artist, lyrics) + suffix,
        updatedAt: now,
      };
      await db.songs.put(next);
      return next;
    });
  });
}

export interface UpdateLyricsResult {
  song: Song;
  diff: LyricsDiff;
  /** Learned lyric occurrences whose progress row was removed because their text changed or vanished. */
  progressReset: number;
}

/**
 * Edit lyrics with progress preservation (ARCHITECTURE §6.4): every line whose key still exists keeps
 * its learned state; progress for keys that no longer exist is deleted. Corrections are kept
 * (orphaned corrections are harmless and removable via "Clean up unused corrections").
 */
export async function updateLyrics(
  songId: string,
  rawNew: string,
  options: { now?: number; usePastedReadings?: boolean } = {},
): Promise<UpdateLyricsResult> {
  const song0 = await getSong(songId);
  if (!song0) throw new Error('Song not found');
  const errors = validateSongInput({ title: song0.title, artist: song0.artist, lyrics: rawNew });
  if (errors.lyrics) throw new ValidationError({ lyrics: errors.lyrics });

  const rawLyrics = normaliseLyrics(rawNew);
  const usePastedReadings = options.usePastedReadings ?? song0.usePastedReadings;
  const parsed = await parseLyrics(rawLyrics, usePastedReadings);
  const now = options.now ?? Date.now();
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.songs, db.lines, db.progress, db.settings], async () => {
      const song = await db.songs.get(songId);
      if (!song || song.deletedAt !== null) throw new Error('Song not found');
      const oldLines = await db.lines.where('songId').equals(songId).sortBy('index');

      // Carry manual kind overrides over to lines with identical text.
      const overrideByText = new Map<string, LineKind>();
      for (const l of oldLines) if (l.kindOverride) overrideByText.set(l.text, l.kindOverride);
      const overrides = new Map<number, LineKind>();
      for (const l of parsed) {
        const o = overrideByText.get(l.text);
        if (o) overrides.set(l.index, o);
      }
      const newLines = toLines(songId, parsed, overrides);

      const oldKeys = oldLines.filter((l) => effectiveKind(l) === 'lyric').map((l) => l.key);
      const newKeys = newLines.filter((l) => effectiveKind(l) === 'lyric').map((l) => l.key);
      const diff = diffLyricKeys(oldKeys, newKeys);

      await db.lines.where('songId').equals(songId).delete();
      await db.lines.bulkAdd(newLines);

      const keep = new Set(newKeys);
      const stale = (await db.progress.where('songId').equals(songId).toArray()).filter(
        (p) => !keep.has(p.lineKey),
      );
      await db.progress.bulkDelete(stale.map((p) => [p.songId, p.lineKey] as [string, string]));
      // Occurrences of the stale keys in the OLD lyrics = learned lines that were reset.
      const staleKeys = new Set(stale.map((p) => p.lineKey));
      const progressReset = oldKeys.filter((k) => staleKeys.has(k)).length;

      await db.songs.update(songId, {
        rawLyrics,
        usePastedReadings,
        searchText: buildSearchText(
          song.title,
          song.artist,
          parsed.map((line) => line.text).join('\n'),
        ),
        updatedAt: now,
      });
      await recomputeCounts(db, songId);
      if (stale.length > 0) await bumpBackupCounters(db, { changes: stale.length });
      const updated = (await db.songs.get(songId))!;
      return { song: updated, diff, progressReset };
    });
  });
}

export function setLineKindOverride(
  songId: string,
  index: number,
  kind: LineKind | null,
): Promise<void> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', [db.songs, db.lines, db.progress], async () => {
      await db.lines.update(`${songId}:${index}`, { kindOverride: kind });
      await recomputeCounts(db, songId);
    });
  });
}

export function touchOpened(songId: string, now = Date.now()): Promise<void> {
  return guard(async () => {
    await getDb().songs.update(songId, { openedAt: now });
  });
}

export function setDisplayMode(songId: string, mode: DisplayMode): Promise<void> {
  return guard(async () => {
    await getDb().songs.update(songId, { displayMode: mode });
  });
}

export function setCleanVariant(songId: string, variant: CleanVariant): Promise<void> {
  return guard(async () => {
    await getDb().songs.update(songId, { cleanVariant: variant });
  });
}

/** Adds the folded romanised text (filled in when analysis completes) so search finds e.g. "saranghae". */
export function setRomanisedSearchText(songId: string, romanised: string): Promise<void> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', db.songs, async () => {
      const s = await db.songs.get(songId);
      if (s) await db.songs.update(songId, { searchText: withRomanised(s.searchText, romanised) });
    });
  });
}

/** Soft delete (Undo window). The library marker follows the live count. */
export async function softDeleteSong(songId: string, now = Date.now()): Promise<void> {
  await guard(async () => {
    await getDb().songs.update(songId, { deletedAt: now });
  });
  await syncLibraryMarker(now);
}

export async function undoDeleteSong(songId: string): Promise<void> {
  await guard(async () => {
    await getDb().songs.update(songId, { deletedAt: null });
  });
  await syncLibraryMarker();
}

/** Permanently removes a song and everything keyed to it. */
export function purgeSong(songId: string): Promise<void> {
  return guard(() => {
    const db = getDb();
    return db.transaction(
      'rw',
      [db.songs, db.lines, db.progress, db.corrections, db.analysis],
      async () => {
        await db.lines.where('songId').equals(songId).delete();
        await db.progress.where('songId').equals(songId).delete();
        await db.corrections.where('songId').equals(songId).delete();
        await db.analysis.where('songId').equals(songId).delete();
        await db.songs.delete(songId);
      },
    );
  });
}

/** Run at launch: purges songs whose Undo window has passed (the only automatic deletion of user data). */
export async function purgeSoftDeleted(): Promise<number> {
  const ids = await guard(() =>
    getDb()
      .songs.filter((s) => s.deletedAt !== null)
      .primaryKeys(),
  );
  for (const id of ids) await purgeSong(id);
  return ids.length;
}
