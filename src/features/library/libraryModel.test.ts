import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/db/repositories/settings';
import type { Song } from '@/db/types';
import { buildSearchText } from '@/search/fold';
import { filterSongs, languageCounts, shouldRemindBackup, sortSongs } from './libraryModel';

let n = 0;
function song(over: Partial<Song> = {}): Song {
  n++;
  const title = over.title ?? `Song ${n}`;
  return {
    id: `id-${n}`,
    title,
    artist: 'Artist',
    language: 'ko',
    languageDetected: false,
    rawLyrics: 'x',
    lineCount: 10,
    learnedCount: 0,
    displayMode: 'learn',
    cleanVariant: 'original',
    source: { kind: 'manual' },
    searchText: buildSearchText(
      title,
      over.artist === undefined ? 'Artist' : over.artist,
      over.rawLyrics ?? 'x',
    ),
    createdAt: n,
    updatedAt: n,
    openedAt: n,
    deletedAt: null,
    ...over,
  };
}

describe('filterSongs', () => {
  const songs = [
    song({
      title: 'Hug',
      language: 'ko',
      rawLyrics: '사랑해',
      searchText: buildSearchText('Hug', 'A', '사랑해', 'saranghae'),
    }),
    song({ title: 'Tokyo', language: 'ja', rawLyrics: '東京' }),
    song({
      title: 'Ni Hao',
      language: 'zh',
      rawLyrics: '你好',
      searchText: buildSearchText('Ni Hao', 'A', '你好', 'nǐ hǎo'),
    }),
  ];
  it('matches by title, lyrics, and romanised text (saranghae finds 사랑해)', () => {
    expect(filterSongs(songs, 'hug', 'all').map((s) => s.title)).toEqual(['Hug']);
    expect(filterSongs(songs, 'saranghae', 'all').map((s) => s.title)).toEqual(['Hug']);
    expect(filterSongs(songs, '東京', 'all').map((s) => s.title)).toEqual(['Tokyo']);
  });
  it('is diacritic-insensitive (ai matches ài / ni hao matches nǐ hǎo)', () => {
    expect(filterSongs(songs, 'ni hao', 'all')).toHaveLength(1);
  });
  it('combines query and language filter', () => {
    expect(filterSongs(songs, '', 'ja').map((s) => s.title)).toEqual(['Tokyo']);
    expect(filterSongs(songs, 'hug', 'ja')).toEqual([]);
  });
});

describe('sortSongs', () => {
  it('sorts by recency, title, artist (artistless last), and progress', () => {
    const a = song({ title: 'b song', artist: 'Zed', openedAt: 5, createdAt: 1, learnedCount: 5 });
    const b = song({ title: 'A song', artist: null, openedAt: 9, createdAt: 3, learnedCount: 1 });
    const c = song({ title: 'c song', artist: 'Amy', openedAt: 1, createdAt: 2, learnedCount: 10 });
    const ids = (s: Song[]) => s.map((x) => x.title);
    expect(ids(sortSongs([a, b, c], 'opened'))).toEqual(['A song', 'b song', 'c song']);
    expect(ids(sortSongs([a, b, c], 'added'))).toEqual(['A song', 'c song', 'b song']);
    expect(ids(sortSongs([a, b, c], 'title'))).toEqual(['A song', 'b song', 'c song']);
    expect(ids(sortSongs([a, b, c], 'artist'))).toEqual(['c song', 'b song', 'A song']);
    expect(ids(sortSongs([a, b, c], 'progress'))).toEqual([
      'c song',
      'a song'.replace('a', 'b'),
      'A song',
    ]);
  });
  it('does not mutate its input', () => {
    const list = [song({ openedAt: 1 }), song({ openedAt: 2 })];
    const copy = [...list];
    sortSongs(list, 'opened');
    expect(list).toEqual(copy);
  });
  it('sorts Japanese titles with the Japanese collation', () => {
    const list = [song({ title: 'ん', language: 'ja' }), song({ title: 'あ', language: 'ja' })];
    expect(sortSongs(list, 'title').map((s) => s.title)).toEqual(['あ', 'ん']);
  });
});

describe('languageCounts', () => {
  it('counts per language and in total', () => {
    expect(languageCounts([song(), song({ language: 'ja' }), song({ language: 'ja' })])).toEqual({
      all: 3,
      ko: 1,
      ja: 2,
      zh: 0,
      yue: 0,
    });
  });
});

describe('shouldRemindBackup (J11.7)', () => {
  const day = 86_400_000;
  const now = 100 * day;
  const old = [song({ createdAt: 80 * day })];
  const b = DEFAULT_SETTINGS.backup;
  it('needs a new song or ≥ 10 changes', () => {
    expect(shouldRemindBackup({ ...b, lastExportAt: 0 }, old, now)).toBe(false);
    expect(shouldRemindBackup({ ...b, lastExportAt: 0, songsSinceExport: 1 }, old, now)).toBe(true);
    expect(shouldRemindBackup({ ...b, lastExportAt: 0, changesSinceExport: 9 }, old, now)).toBe(
      false,
    );
    expect(shouldRemindBackup({ ...b, lastExportAt: 0, changesSinceExport: 10 }, old, now)).toBe(
      true,
    );
  });
  it('needs ≥ 7 days since the last export', () => {
    expect(
      shouldRemindBackup({ ...b, lastExportAt: now - 6 * day, songsSinceExport: 1 }, old, now),
    ).toBe(false);
    expect(
      shouldRemindBackup({ ...b, lastExportAt: now - 7 * day, songsSinceExport: 1 }, old, now),
    ).toBe(true);
  });
  it('uses the oldest song when never exported', () => {
    expect(
      shouldRemindBackup({ ...b, songsSinceExport: 1 }, [song({ createdAt: now - 2 * day })], now),
    ).toBe(false);
    expect(shouldRemindBackup({ ...b, songsSinceExport: 1 }, old, now)).toBe(true);
  });
  it('stays quiet for 7 days after dismissal and for an empty library', () => {
    expect(
      shouldRemindBackup(
        { ...b, songsSinceExport: 1, reminderDismissedAt: now - 2 * day },
        old,
        now,
      ),
    ).toBe(false);
    expect(
      shouldRemindBackup(
        { ...b, songsSinceExport: 1, reminderDismissedAt: now - 8 * day },
        old,
        now,
      ),
    ).toBe(true);
    expect(shouldRemindBackup({ ...b, songsSinceExport: 1 }, [], now)).toBe(false);
  });
});
