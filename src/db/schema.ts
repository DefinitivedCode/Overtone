import Dexie from 'dexie';
import type { Table } from 'dexie';
import type {
  Correction,
  Draft,
  Line,
  LineAnalysisCache,
  MetaRow,
  Progress,
  Settings,
  Song,
} from './types';

/**
 * Dexie schema (ARCHITECTURE §3.3). Never edit a shipped version: add `db.version(n)` with an
 * `.upgrade()` and a migration test seeded from a frozen fixture.
 */
export class OvertoneDB extends Dexie {
  songs!: Table<Song, string>;
  lines!: Table<Line, string>;
  progress!: Table<Progress, [string, string]>;
  corrections!: Table<Correction, string>;
  analysis!: Table<LineAnalysisCache, string>;
  settings!: Table<Settings, string>;
  drafts!: Table<Draft, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'overtone') {
    super(name);
    this.version(1).stores({
      songs: 'id, language, updatedAt, createdAt, openedAt, deletedAt',
      lines: 'id, songId, [songId+index], [songId+key]',
      progress: '[songId+lineKey], songId',
      corrections: 'id, songId, [songId+lineKey]',
      analysis: 'cacheKey, songId',
      settings: 'id',
      drafts: 'id',
      meta: 'key',
    });
  }
}

let current = new OvertoneDB();

/** The app-wide database. Repositories always go through this accessor. */
export const getDb = (): OvertoneDB => current;

/** Test seam: swap the database (fresh fake-indexeddb name per test). */
export function setDb(db: OvertoneDB): void {
  current = db;
}

/** Listeners notified when another tab upgrades the schema (this connection is then closed). */
const outdatedListeners = new Set<() => void>();
export function onDatabaseOutdated(listener: () => void): () => void {
  outdatedListeners.add(listener);
  return () => outdatedListeners.delete(listener);
}

export function watchVersionChange(db: OvertoneDB): void {
  db.on('versionchange', () => {
    db.close();
    outdatedListeners.forEach((l) => l());
    return false;
  });
}
