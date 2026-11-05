import { useLiveQuery } from 'dexie-react-hooks';
import { isUnloading } from '@/platform/lifecycle';
import { getDb } from './schema';
import { listAnalyses } from './repositories/analysis';
import { getLearnedKeys } from './repositories/progress';
import { getSettings } from './repositories/settings';
import { getLines, getSong, listSongs } from './repositories/songs';
import type { Line, LineAnalysisCache, Settings, Song } from './types';

const never = <T>() => new Promise<T>(() => undefined);

/**
 * Live queries rethrow errors into render, which would blank the screen for a transient IndexedDB failure.
 * So: stay quiet (pending) if the page is going away or the database was closed on purpose (another tab
 * upgraded it), retry once after a short pause, and only then let the error reach the error boundary.
 */
async function safe<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    if (isUnloading() || !getDb().isOpen()) return never<T>();
    await new Promise((r) => setTimeout(r, 250));
    if (isUnloading() || !getDb().isOpen()) return never<T>();
    try {
      return await read();
    } catch (e2) {
      if (isUnloading()) return never<T>();
      throw e2 ?? e;
    }
  }
}

/** Reactive reads over IndexedDB (ARCHITECTURE §6.1). `undefined` means "still loading". */
export const useSongs = (): Song[] | undefined => useLiveQuery(() => safe(() => listSongs()), []);

/** undefined = loading, null = not found (or deleted). */
export const useSong = (id: string | undefined): Song | null | undefined =>
  useLiveQuery(() => safe(async () => (id ? ((await getSong(id)) ?? null) : null)), [id]);

export const useLines = (songId: string | undefined): Line[] | undefined =>
  useLiveQuery(() => safe(() => (songId ? getLines(songId) : Promise.resolve([]))), [songId]);

export const useLearnedKeys = (songId: string | undefined): Set<string> | undefined =>
  useLiveQuery(
    () => safe(() => (songId ? getLearnedKeys(songId) : Promise.resolve(new Set<string>()))),
    [songId],
  );

export const useSettings = (): Settings | undefined =>
  useLiveQuery(() => safe(() => getSettings()), []);

export const useAnalysisRows = (songId: string): LineAnalysisCache[] | undefined =>
  useLiveQuery(() => safe(() => listAnalyses(songId)), [songId]);
