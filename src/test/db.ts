import { OvertoneDB, setDb } from '@/db/schema';
import { createSong } from '@/db/repositories/songs';
import type { CreateSongInput } from '@/db/repositories/songs';
import type { Song } from '@/db/types';

let counter = 0;

/** Installs a brand-new, empty fake-IndexedDB database as the app database. */
export async function freshDb(): Promise<OvertoneDB> {
  const db = new OvertoneDB(`overtone-test-${++counter}-${Math.random().toString(36).slice(2)}`);
  setDb(db);
  await db.open();
  try {
    localStorage.clear();
  } catch {
    // node environment without localStorage
  }
  return db;
}

let songCounter = 0;
export function makeSong(overrides: Partial<CreateSongInput> = {}): Promise<Song> {
  songCounter++;
  return createSong({
    title: `Song ${songCounter}`,
    artist: 'Artist',
    language: 'ko',
    languageDetected: false,
    rawLyrics: 'line one\nline two\nline three',
    ...overrides,
  });
}

/** Everything user-visible about the library, sorted, for equality checks. */
export async function dumpLibrary(db: OvertoneDB) {
  const songs = (await db.songs.toArray()).sort((a, b) => a.id.localeCompare(b.id));
  const lines = (await db.lines.toArray()).sort((a, b) => a.id.localeCompare(b.id));
  const progress = (await db.progress.toArray()).sort((a, b) =>
    `${a.songId}${a.lineKey}`.localeCompare(`${b.songId}${b.lineKey}`),
  );
  const corrections = (await db.corrections.toArray()).sort((a, b) => a.id.localeCompare(b.id));
  const settings = await db.settings.get('app');
  return {
    songs,
    lines,
    progress,
    corrections,
    settings: settings && {
      theme: settings.theme,
      textSize: settings.textSize,
      romanisation: settings.romanisation,
    },
  };
}
