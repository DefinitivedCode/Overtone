import { useLiveQuery } from 'dexie-react-hooks';
import { getLearnedKeys } from './repositories/progress';
import { getSettings } from './repositories/settings';
import { getLines, getSong, listSongs } from './repositories/songs';
import type { Line, Settings, Song } from './types';

/** Reactive reads over IndexedDB (ARCHITECTURE §6.1). `undefined` means "still loading". */
export const useSongs = (): Song[] | undefined => useLiveQuery(() => listSongs(), []);

/** undefined = loading, null = not found (or deleted). */
export const useSong = (id: string | undefined): Song | null | undefined =>
  useLiveQuery(async () => (id ? ((await getSong(id)) ?? null) : null), [id]);

export const useLines = (songId: string | undefined): Line[] | undefined =>
  useLiveQuery(() => (songId ? getLines(songId) : Promise.resolve([])), [songId]);

export const useLearnedKeys = (songId: string | undefined): Set<string> | undefined =>
  useLiveQuery(
    () => (songId ? getLearnedKeys(songId) : Promise.resolve(new Set<string>())),
    [songId],
  );

export const useSettings = (): Settings | undefined => useLiveQuery(() => getSettings(), []);
