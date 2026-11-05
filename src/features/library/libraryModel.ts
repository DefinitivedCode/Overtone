import { progressFraction } from '@/db/repositories/progress';
import type { LangCode, LibraryFilter, LibrarySort, Settings, Song } from '@/db/types';
import { matchesQuery } from '@/search/fold';

const COLLATOR_TAG: Record<LangCode, string> = { ko: 'ko', ja: 'ja', zh: 'zh', yue: 'zh-HK' };
const collators = new Map<string, Intl.Collator>();
function collator(lang: LangCode): Intl.Collator {
  const tag = COLLATOR_TAG[lang];
  let c = collators.get(tag);
  if (!c) {
    c = new Intl.Collator(tag, { sensitivity: 'base', numeric: true });
    collators.set(tag, c);
  }
  return c;
}

export const SORT_LABEL: Record<LibrarySort, string> = {
  opened: 'Recently opened',
  added: 'Recently added',
  title: 'Title A–Z',
  artist: 'Artist A–Z',
  progress: 'Progress',
};

export function filterSongs(songs: readonly Song[], query: string, filter: LibraryFilter): Song[] {
  return songs.filter(
    (s) => (filter === 'all' || s.language === filter) && matchesQuery(s.searchText, query),
  );
}

/** Titles sort with the song's own language collation; romanised titles are never invented (J10.3). */
export function sortSongs(songs: readonly Song[], sort: LibrarySort): Song[] {
  const out = [...songs];
  switch (sort) {
    case 'opened':
      return out.sort((a, b) => b.openedAt - a.openedAt);
    case 'added':
      return out.sort((a, b) => b.createdAt - a.createdAt);
    case 'title':
      return out.sort((a, b) => collator(a.language).compare(a.title, b.title));
    case 'artist':
      return out.sort((a, b) => {
        if (a.artist === null || b.artist === null) {
          if (a.artist === b.artist) return collator(a.language).compare(a.title, b.title);
          return a.artist === null ? 1 : -1; // songs without an artist go last
        }
        return collator(a.language).compare(a.artist, b.artist);
      });
    case 'progress':
      return out.sort(
        (a, b) => progressFraction(b) - progressFraction(a) || b.openedAt - a.openedAt,
      );
  }
}

export function languageCounts(songs: readonly Song[]): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = { all: songs.length, ko: 0, ja: 0, zh: 0, yue: 0 };
  for (const s of songs) counts[s.language]++;
  return counts;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Backup reminder (J11.7): after ≥ 1 new song or ≥ 10 progress/correction changes, and ≥ 7 days since
 * the last export (or since the oldest song when never exported). Dismissal silences it for 7 days.
 */
export function shouldRemindBackup(
  backup: Settings['backup'],
  songs: readonly Song[],
  now = Date.now(),
): boolean {
  if (songs.length === 0) return false;
  if (backup.songsSinceExport < 1 && backup.changesSinceExport < 10) return false;
  const reference = backup.lastExportAt ?? Math.min(...songs.map((s) => s.createdAt));
  if (now - reference < 7 * DAY) return false;
  if (backup.reminderDismissedAt !== null && now - backup.reminderDismissedAt < 7 * DAY)
    return false;
  return true;
}
