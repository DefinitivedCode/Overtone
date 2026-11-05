import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb, makeSong } from '@/test/db';
import { StorageError, ValidationError } from '../errors';
import { openDatabase } from '../open';
import { OvertoneDB, setDb } from '../schema';
import type { OvertoneDB as DB } from '../schema';
import {
  createCorrection,
  deleteCorrection,
  deleteOrphanedCorrections,
  listActiveCorrections,
  listCorrections,
  listOrphanedCorrections,
  updateCorrection,
} from './corrections';
import { clearDraft, getDraft, saveDraft } from './drafts';
import { checkRecovery, clearLibraryMarker, syncLibraryMarker } from './meta';
import {
  getLearnedKeys,
  progressFraction,
  resetProgress,
  setLearned,
  toggleLearned,
} from './progress';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from './settings';
import {
  createSong,
  getLines,
  getSong,
  listSongs,
  purgeSoftDeleted,
  purgeSong,
  setLineKindOverride,
  softDeleteSong,
  undoDeleteSong,
  updateDetails,
  updateLyrics,
} from './songs';
import { lineKey } from '@/lyrics/parse';

let db: DB;
beforeEach(async () => {
  db = await freshDb();
});

const quota = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });

describe('songs: create and read', () => {
  it('stores normalised text, lines, counts and search text in one go', async () => {
    const s = await createSong({
      title: '  Title ',
      artist: ' ',
      language: 'ko',
      languageDetected: true,
      rawLyrics: '[Chorus]\r\n사랑해\r\n\r\nLa la  \r\n',
    });
    expect(s.title).toBe('Title');
    expect(s.artist).toBeNull();
    expect(s.rawLyrics).toBe('[Chorus]\n사랑해\n\nLa la');
    expect(s.lineCount).toBe(2);
    expect(s.learnedCount).toBe(0);
    expect(s.searchText).toContain('사랑해');
    const lines = await getLines(s.id);
    expect(lines.map((l) => [l.index, l.kind])).toEqual([
      [0, 'section'],
      [1, 'lyric'],
      [2, 'blank'],
      [3, 'lyric'],
    ]);
    expect(lines.map((l) => l.id)).toEqual([0, 1, 2, 3].map((i) => `${s.id}:${i}`));
    expect(await getSong(s.id)).toEqual(s);
  });

  it('rejects invalid input with a ValidationError and writes nothing', async () => {
    await expect(
      createSong({
        title: '',
        artist: null,
        language: 'ko',
        languageDetected: false,
        rawLyrics: 'x',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createSong({
        title: 't',
        artist: null,
        language: 'ko',
        languageDetected: false,
        rawLyrics: 'x'.repeat(20_001),
      }),
    ).rejects.toMatchObject({ errors: { lyrics: expect.stringMatching(/too long/) } });
    expect(await db.songs.count()).toBe(0);
    expect(await db.lines.count()).toBe(0);
  });

  it('listSongs hides soft-deleted songs; undo restores them', async () => {
    const a = await makeSong();
    const b = await makeSong();
    await softDeleteSong(a.id);
    expect((await listSongs()).map((s) => s.id)).toEqual([b.id]);
    expect(await getSong(a.id)).toBeUndefined();
    expect((await getSong(a.id, { includeDeleted: true }))?.deletedAt).not.toBeNull();
    await undoDeleteSong(a.id);
    expect((await listSongs()).length).toBe(2);
  });

  it('purgeSong removes the song and everything keyed to it, and only it', async () => {
    const a = await makeSong();
    const b = await makeSong();
    const [first] = await getLines(a.id);
    await setLearned(a.id, first!.key, true);
    await createCorrection({
      songId: a.id,
      lineKey: first!.key,
      surface: 'x',
      occurrence: null,
      language: 'ko',
      patch: { reading: 'y' },
    });
    await db.analysis.put({ cacheKey: 'k', songId: a.id, analysis: {}, createdAt: 1 });
    await purgeSong(a.id);
    expect(await db.songs.get(a.id)).toBeUndefined();
    expect(await db.lines.where('songId').equals(a.id).count()).toBe(0);
    expect(await db.progress.where('songId').equals(a.id).count()).toBe(0);
    expect(await db.corrections.where('songId').equals(a.id).count()).toBe(0);
    expect(await db.analysis.where('songId').equals(a.id).count()).toBe(0);
    expect(await db.lines.where('songId').equals(b.id).count()).toBe(3);
  });

  it('purgeSoftDeleted (launch) removes only soft-deleted songs', async () => {
    const keep = await makeSong();
    const gone = await makeSong();
    await softDeleteSong(gone.id);
    expect(await purgeSoftDeleted()).toBe(1);
    expect(await db.songs.count()).toBe(1);
    expect((await db.songs.toArray())[0]!.id).toBe(keep.id);
  });

  it('updateDetails edits title/artist, refreshes search text, and resets languageDetected on language change', async () => {
    const s = await makeSong({ languageDetected: true });
    const u = await updateDetails(s.id, { title: 'New Title', artist: null, language: 'ja' });
    expect(u.title).toBe('New Title');
    expect(u.language).toBe('ja');
    expect(u.languageDetected).toBe(false);
    expect(u.searchText).toContain('new title');
    await expect(
      updateDetails(s.id, { title: '', artist: null, language: 'ja' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('progress', () => {
  it('toggles learned and keeps cached counts in sync', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb\nc' });
    const lines = await getLines(s.id);
    expect(await toggleLearned(s.id, lines[0]!.key)).toBe(true);
    expect((await getSong(s.id))!.learnedCount).toBe(1);
    expect(await toggleLearned(s.id, lines[0]!.key)).toBe(false);
    expect((await getSong(s.id))!.learnedCount).toBe(0);
  });

  it('repeated lines share one state and count per occurrence (J7.3)', async () => {
    const s = await makeSong({
      rawLyrics: 'chorus line\nsome other words\nchorus line\nchorus line!\nthe end',
    });
    expect(s.lineCount).toBe(5);
    const key = (await getLines(s.id))[0]!.key;
    await setLearned(s.id, key, true);
    const after = (await getSong(s.id))!;
    expect(after.learnedCount).toBe(3); // 3 occurrences of the chorus key
    expect(progressFraction(after)).toBeCloseTo(3 / 5);
    expect(await db.progress.where('songId').equals(s.id).count()).toBe(1);
  });

  it('sections and blank lines are not learnable and do not count', async () => {
    const s = await makeSong({ rawLyrics: '[Chorus]\n\nreal line' });
    expect(s.lineCount).toBe(1);
    const [section, blank] = await getLines(s.id);
    expect(await setLearned(s.id, section!.key, true)).toBe(false);
    expect(await setLearned(s.id, blank!.key, true)).toBe(false);
    expect(await db.progress.count()).toBe(0);
  });

  it('a kind override changes what is learnable', async () => {
    const s = await makeSong({ rawLyrics: 'one\ntwo' });
    await setLineKindOverride(s.id, 0, 'section');
    expect((await getSong(s.id))!.lineCount).toBe(1);
    await setLineKindOverride(s.id, 0, null);
    expect((await getSong(s.id))!.lineCount).toBe(2);
  });

  it('resetProgress clears learned lines and reports how many keys', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb' });
    for (const l of await getLines(s.id)) await setLearned(s.id, l.key, true);
    expect(await resetProgress(s.id)).toBe(2);
    expect((await getSong(s.id))!.learnedCount).toBe(0);
    expect((await getLearnedKeys(s.id)).size).toBe(0);
  });

  it('progress is unchanged by corrections (J7.4)', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb' });
    const [a] = await getLines(s.id);
    await setLearned(s.id, a!.key, true);
    const c = await createCorrection({
      songId: s.id,
      lineKey: a!.key,
      surface: 'a',
      occurrence: null,
      language: 'ko',
      patch: { reading: 'x' },
    });
    await updateCorrection(c.id, { patch: { reading: 'y' } });
    await deleteCorrection(c.id);
    const after = (await getSong(s.id))!;
    expect(after.learnedCount).toBe(1);
    expect((await getLearnedKeys(s.id)).has(a!.key)).toBe(true);
  });
});

describe('edit lyrics: preservation matrix (J7.5, ARCHITECTURE §6.4)', () => {
  async function learnAll(songId: string) {
    for (const l of await getLines(songId)) await setLearned(songId, l.key, true);
  }

  it('unchanged text changes nothing', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb\nc' });
    await learnAll(s.id);
    const r = await updateLyrics(s.id, 'a\nb\nc');
    expect(r.diff).toEqual({ unchanged: 3, changed: 0, added: 0, removed: 0 });
    expect(r.progressReset).toBe(0);
    expect(r.song.learnedCount).toBe(3);
  });

  it('a changed line is reset; neighbours keep progress', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb\nc' });
    await learnAll(s.id);
    const r = await updateLyrics(s.id, 'a\nB changed\nc');
    expect(r.diff.changed).toBe(1);
    expect(r.progressReset).toBe(1);
    expect(r.song.learnedCount).toBe(2);
    expect((await getLearnedKeys(s.id)).has(await lineKey('b'))).toBe(false);
  });

  it('inserted lines start unlearned; others keep progress', async () => {
    const s = await makeSong({ rawLyrics: 'a\nc' });
    await learnAll(s.id);
    const r = await updateLyrics(s.id, 'a\nnew\nc');
    expect(r.diff.added).toBe(1);
    expect(r.song.lineCount).toBe(3);
    expect(r.song.learnedCount).toBe(2);
  });

  it('deleted lines lose their progress row', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb\nc' });
    await learnAll(s.id);
    const r = await updateLyrics(s.id, 'a\nc');
    expect(r.diff.removed).toBe(1);
    expect(r.progressReset).toBe(1);
    expect(await db.progress.where('songId').equals(s.id).count()).toBe(2);
  });

  it('reordered lines keep their progress (progress is keyed by content)', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb\nc' });
    await setLearned(s.id, await lineKey('a'), true);
    const r = await updateLyrics(s.id, 'c\nb\na');
    expect(r.progressReset).toBe(0);
    expect(r.song.learnedCount).toBe(1);
    expect((await getLines(s.id)).map((l) => l.text)).toEqual(['c', 'b', 'a']);
  });

  it('duplicating a learned line marks the duplicate learned too (shared key)', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb' });
    await setLearned(s.id, await lineKey('a'), true);
    const r = await updateLyrics(s.id, 'a\nb\na');
    expect(r.song.lineCount).toBe(3);
    expect(r.song.learnedCount).toBe(2);
  });

  it('keeps corrections (orphaned ones are reported, then removable)', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb' });
    const keyA = await lineKey('a');
    const keyB = await lineKey('b');
    await createCorrection({
      songId: s.id,
      lineKey: keyA,
      surface: 'a',
      occurrence: null,
      language: 'ko',
      patch: { reading: '1' },
    });
    await createCorrection({
      songId: s.id,
      lineKey: keyB,
      surface: 'b',
      occurrence: null,
      language: 'ko',
      patch: { reading: '2' },
    });
    await createCorrection({
      songId: s.id,
      lineKey: null,
      surface: 'z',
      occurrence: null,
      language: 'ko',
      patch: { reading: '3' },
    });
    await updateLyrics(s.id, 'a\nnew');
    expect((await listCorrections(s.id)).length).toBe(3);
    expect((await listOrphanedCorrections(s.id)).map((c) => c.lineKey)).toEqual([keyB]);
    expect(await deleteOrphanedCorrections(s.id)).toBe(1);
    expect((await listCorrections(s.id)).length).toBe(2);
  });

  it('carries manual kind overrides to lines with identical text', async () => {
    const s = await makeSong({ rawLyrics: 'keep me\nother' });
    await setLineKindOverride(s.id, 0, 'section');
    await updateLyrics(s.id, 'prefix\nkeep me\nother');
    const lines = await getLines(s.id);
    expect(lines.find((l) => l.text === 'keep me')!.kindOverride).toBe('section');
    expect(lines.find((l) => l.text === 'prefix')!.kindOverride).toBeNull();
  });

  it('validates the new lyrics', async () => {
    const s = await makeSong();
    await expect(updateLyrics(s.id, '   ')).rejects.toBeInstanceOf(ValidationError);
    expect((await getSong(s.id))!.rawLyrics).toBe(s.rawLyrics);
  });
});

describe('corrections', () => {
  it('are inactive after a language change and active again on switching back (J9.1)', async () => {
    const s = await makeSong({ language: 'ko' });
    await createCorrection({
      songId: s.id,
      lineKey: null,
      surface: 'x',
      occurrence: null,
      language: 'ko',
      patch: { reading: 'r' },
    });
    expect((await listActiveCorrections(s.id, 'ko')).length).toBe(1);
    await updateDetails(s.id, { title: s.title, artist: s.artist, language: 'ja' });
    expect((await listActiveCorrections(s.id, 'ja')).length).toBe(0);
    expect((await listCorrections(s.id)).length).toBe(1);
    await updateDetails(s.id, { title: s.title, artist: s.artist, language: 'ko' });
    expect((await listActiveCorrections(s.id, 'ko')).length).toBe(1);
  });

  it('survive clearing the derived analysis cache (engine upgrades)', async () => {
    const s = await makeSong();
    await createCorrection({
      songId: s.id,
      lineKey: null,
      surface: 'x',
      occurrence: 0,
      language: 'ko',
      patch: { gloss: 'g', glossMode: 'prepend' },
    });
    await db.analysis.clear();
    expect((await listCorrections(s.id))[0]!.patch.gloss).toBe('g');
  });

  it('updateCorrection merges and bumps updatedAt', async () => {
    const s = await makeSong();
    const c = await createCorrection(
      {
        songId: s.id,
        lineKey: null,
        surface: 'x',
        occurrence: null,
        language: 'ko',
        patch: { reading: 'r' },
      },
      1000,
    );
    const u = await updateCorrection(c.id, { patch: { reading: 'r2' } }, 2000);
    expect(u.patch.reading).toBe('r2');
    expect(u.createdAt).toBe(1000);
    expect(u.updatedAt).toBe(2000);
  });
});

describe('settings and drafts', () => {
  it('returns defaults, persists updates, and fills missing fields of older records', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await updateSettings((s) => ({
      ...s,
      theme: 'dark',
      romanisation: { ...s.romanisation, zh: { tones: 'numbers', sandhi: true } },
    }));
    const s = await getSettings();
    expect(s.theme).toBe('dark');
    expect(s.romanisation.zh).toEqual({ tones: 'numbers', sandhi: true });
    // An older record lacking newer fields still loads.
    await db.settings.put({ id: 'app', theme: 'light' } as never);
    const old = await getSettings();
    expect(old.theme).toBe('light');
    expect(old.romanisation.ja.longVowels).toBe('macron');
    expect(old.backup.songsSinceExport).toBe(0);
  });

  it('tracks unexported changes for the backup reminder', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb' });
    await setLearned(s.id, await lineKey('a'), true);
    const b = (await getSettings()).backup;
    expect(b.songsSinceExport).toBe(1);
    expect(b.changesSinceExport).toBe(1);
  });

  it('saves, restores and clears the add-song draft', async () => {
    expect(await getDraft()).toBeUndefined();
    await saveDraft({ title: 't', artist: 'a', language: 'auto', lyrics: 'long paste' }, 5);
    expect(await getDraft()).toEqual({
      id: 'add-song',
      title: 't',
      artist: 'a',
      language: 'auto',
      lyrics: 'long paste',
      updatedAt: 5,
    });
    await clearDraft();
    expect(await getDraft()).toBeUndefined();
  });
});

describe('failure handling: no partial writes, typed errors (J12.6)', () => {
  it('quota error during createSong → StorageError(quota) and nothing stored', async () => {
    vi.spyOn(db.lines, 'bulkAdd').mockRejectedValueOnce(quota());
    const err = await makeSong().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).kind).toBe('quota');
    expect((err as StorageError).message).toMatch(/Nothing was saved/);
    expect(await db.songs.count()).toBe(0);
    expect(await db.lines.count()).toBe(0);
  });

  it('failure during updateLyrics leaves text, lines and progress untouched', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb' });
    await setLearned(s.id, await lineKey('a'), true);
    vi.spyOn(db.lines, 'bulkAdd').mockRejectedValueOnce(quota());
    await expect(updateLyrics(s.id, 'x\ny\nz')).rejects.toBeInstanceOf(StorageError);
    expect((await getSong(s.id))!.rawLyrics).toBe('a\nb');
    expect((await getLines(s.id)).map((l) => l.text)).toEqual(['a', 'b']);
    expect((await getSong(s.id))!.learnedCount).toBe(1);
  });

  it('failure while toggling progress rolls back the progress row', async () => {
    const s = await makeSong({ rawLyrics: 'a\nb' });
    vi.spyOn(db.songs, 'update').mockRejectedValueOnce(quota());
    await expect(setLearned(s.id, await lineKey('a'), true)).rejects.toBeInstanceOf(StorageError);
    expect(await db.progress.count()).toBe(0);
  });

  it('openDatabase retries once, then reports unavailable and never deletes the database', async () => {
    const broken = new OvertoneDB(`broken-${Math.random()}`);
    const del = vi.spyOn(broken, 'delete');
    const open = vi
      .spyOn(broken, 'open')
      .mockRejectedValue(Object.assign(new Error('x'), { name: 'InvalidStateError' }));
    setDb(broken);
    const err = await openDatabase(broken, 0).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).kind).toBe('unavailable');
    expect(open).toHaveBeenCalledTimes(2);
    expect(del).not.toHaveBeenCalled();
  });

  it('openDatabase recovers when the retry succeeds', async () => {
    const flaky = new OvertoneDB(`flaky-${Math.random()}`);
    const real = flaky.open.bind(flaky);
    vi.spyOn(flaky, 'open')
      .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'UnknownError' }))
      .mockImplementation(real);
    await expect(openDatabase(flaky, 0)).resolves.toBeUndefined();
    expect(flaky.isOpen()).toBe(true);
  });
});

describe('library marker and recovery (J12.5)', () => {
  it('fresh install: empty database and no marker → no recovery', async () => {
    expect((await checkRecovery()).needsRecovery).toBe(false);
  });

  it('empty database + marker from a previous library → recovery', async () => {
    await makeSong();
    await db.songs.clear();
    await db.lines.clear();
    const r = await checkRecovery();
    expect(r.needsRecovery).toBe(true);
    expect(r.evidence).toEqual(['indexeddb', 'localstorage']);
  });

  it('either marker alone is enough (partial eviction)', async () => {
    await makeSong();
    await db.songs.clear();
    await db.meta.clear();
    expect((await checkRecovery()).evidence).toEqual(['localstorage']);
    await syncLibraryMarker();
    localStorage.clear();
    // The sync above recorded count 0, so only after restoring the old state would it matter:
    await db.meta.put({
      key: 'libraryMarker',
      value: { everHadSongs: true, lastCount: 4, lastSeenAt: 1 },
    });
    expect((await checkRecovery()).evidence).toEqual(['indexeddb']);
  });

  it('deliberately deleting every song is not data loss', async () => {
    const s = await makeSong();
    await softDeleteSong(s.id);
    await purgeSong(s.id);
    expect((await checkRecovery()).needsRecovery).toBe(false);
  });

  it('clearing the marker ends the recovery state', async () => {
    await makeSong();
    await db.songs.clear();
    expect((await checkRecovery()).needsRecovery).toBe(true);
    await clearLibraryMarker();
    expect((await checkRecovery()).needsRecovery).toBe(false);
  });
});

describe('schema migrations', () => {
  it('opens a frozen v1 database (schema drift guard) and reads its rows', async () => {
    const name = `frozen-v1-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      songs: 'id, language, updatedAt, createdAt, openedAt, deletedAt',
      lines: 'id, songId, [songId+index], [songId+key]',
      progress: '[songId+lineKey], songId',
      corrections: 'id, songId, [songId+lineKey]',
      analysis: 'cacheKey, songId',
      settings: 'id',
      drafts: 'id',
      meta: 'key',
    });
    await old.open();
    await old.table('songs').add({
      id: 's1',
      title: 'Old',
      deletedAt: null,
      language: 'ko',
      createdAt: 1,
      updatedAt: 1,
      openedAt: 1,
    });
    await old.table('progress').add({ songId: 's1', lineKey: 'k', learnedAt: 1 });
    old.close();
    const current = new OvertoneDB(name);
    await current.open();
    expect((await current.songs.get('s1'))!.title).toBe('Old');
    expect(await current.progress.get(['s1', 'k'])).toBeDefined();
    current.close();
  });
});
