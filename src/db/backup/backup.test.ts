import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dumpLibrary, freshDb, makeSong } from '@/test/db';
import { lineKey } from '@/lyrics/parse';
import { createCorrection, listCorrections } from '../repositories/corrections';
import { getSettings, updateSettings } from '../repositories/settings';
import {
  getLines,
  getSong,
  listSongs,
  setLineKindOverride,
  softDeleteSong,
  updateDetails,
} from '../repositories/songs';
import { setLearned } from '../repositories/progress';
import type { OvertoneDB } from '../schema';
import { backupChecksum } from './canonical';
import { backupFilename, buildBackup, recordExport, serializeBackup } from './export';
import { BACKUP_SCHEMA_VERSION, MAX_BACKUP_BYTES, MAX_BACKUP_SONGS, backupSchema } from './format';
import type { Backup, BackupSong } from './format';
import { applyImport, parseBackup, previewImport } from './import';
import { BackupMigrationError, migrateBackup } from './migrations';

let db: OvertoneDB;
beforeEach(async () => {
  db = await freshDb();
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function seedRichLibrary() {
  const a = await makeSong({
    id: uuid(1),
    now: 1_000,
    title: 'Korean Song',
    artist: 'Artist K',
    language: 'ko',
    languageDetected: true,
    rawLyrics: '[Chorus]\n사랑해\n보고 싶어\n\n사랑해\n（全角）  spaced  line\n',
  });
  await setLearned(a.id, await lineKey('사랑해'), true, 1_500);
  await setLineKindOverride(a.id, 5, 'section');
  await db.songs.update(a.id, {
    displayMode: 'karaoke',
    cleanVariant: 'romanised',
    openedAt: 1_700,
    updatedAt: 1_600,
  });
  const patches = [
    { reading: 'saranghae', romanisation: 'saranghae' },
    { gloss: 'to love', glossMode: 'replace' as const },
    { gloss: 'extra', glossMode: 'prepend' as const },
    { segLang: 'en' as const },
    { split: [1, 2] },
    { mergeWithNext: 2 },
  ];
  for (const [i, patch] of patches.entries()) {
    await createCorrection(
      {
        songId: a.id,
        lineKey: i === 0 ? null : await lineKey('사랑해'),
        surface: i === 0 ? '사랑' : '해',
        occurrence: i % 2 === 0 ? null : i,
        language: 'ko',
        patch,
      },
      2_000 + i,
    );
  }
  const b = await makeSong({
    id: uuid(2),
    now: 1_100,
    title: 'Japanese Song',
    artist: null,
    language: 'ja',
    rawLyrics: '君の名前を呼んでいた\n君の名前を呼んでいた\n運命《さだめ》',
    source: {
      kind: 'lrclib',
      trackId: 42,
      fetchedAt: 1_150,
      syncedLyrics: '[00:01.00] 君の名前',
      duration: 213,
      album: 'Album',
    },
  });
  await setLearned(b.id, await lineKey('君の名前を呼んでいた'), true, 1_200);
  await makeSong({
    id: uuid(3),
    now: 1_200,
    title: 'Mandarin',
    language: 'zh',
    rawLyrics: '我爱你\n你好',
  });
  await makeSong({
    id: uuid(4),
    now: 1_300,
    title: 'Cantonese',
    language: 'yue',
    rawLyrics: '我愛你\n你好',
  });
  await updateSettings((s) => ({
    ...s,
    theme: 'dark',
    textSize: 4,
    romanisation: {
      ...s.romanisation,
      zh: { tones: 'numbers', sandhi: true },
      ja: { ...s.romanisation.ja, longVowels: 'doubled' },
    },
  }));
}

async function wipe() {
  await Promise.all([
    db.songs.clear(),
    db.lines.clear(),
    db.progress.clear(),
    db.corrections.clear(),
    db.analysis.clear(),
    db.settings.clear(),
    db.meta.clear(),
  ]);
}

async function mkSong(n: number, over: Partial<BackupSong> = {}): Promise<BackupSong> {
  return {
    id: uuid(n),
    title: `Imported ${n}`,
    artist: null,
    language: 'ko',
    languageDetected: false,
    rawLyrics: 'a\nb\nc',
    lineKindOverrides: [],
    displayMode: 'learn',
    cleanVariant: 'original',
    source: { kind: 'manual' },
    createdAt: 100,
    updatedAt: 100,
    openedAt: 100,
    progress: [],
    corrections: [],
    ...over,
  };
}

async function mkBackup(songs: BackupSong[], extra: Record<string, unknown> = {}): Promise<Backup> {
  const settings = {
    theme: 'system',
    textSize: 2,
    romanisation: {
      ja: { longVowels: 'macron', showRomajiLine: true, furiganaForKanaWords: false },
      ko: { mode: 'pronunciation' },
      zh: { tones: 'marks', sandhi: false },
    },
  } as const;
  return {
    format: 'overtone-backup',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-11-05T10:00:00.000Z',
    app: { name: 'Overtone', version: '0.1.0' },
    settings,
    songs,
    checksum: await backupChecksum(songs, settings),
    ...extra,
  } as Backup;
}

const parseOk = async (b: unknown) => {
  const r = await parseBackup(typeof b === 'string' ? b : JSON.stringify(b));
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe('export', () => {
  it('round-trips v2 pasted reading choices, offsets and shared progress without derived rows', async () => {
    const rawLyrics = '運命《さだめ》\n|運命《うんめい》';
    const song = await makeSong({ language: 'ja', rawLyrics, usePastedReadings: true });
    const literal = await makeSong({ language: 'ja', rawLyrics, usePastedReadings: false });
    const key = await lineKey('運命');
    await setLearned(song.id, key, true);
    const file = await buildBackup();
    expect(file.schemaVersion).toBe(2);
    expect(serializeBackup(file)).not.toContain('"readings"');
    const parsed = await parseOk(file);
    expect(parsed.checksumOk).toBe(true);
    await freshDb();
    await applyImport(parsed.backup, 'replace');
    expect((await getSong(song.id))?.learnedCount).toBe(2);
    expect((await getLines(song.id)).map((l) => [l.key, l.readings?.[0]?.reading])).toEqual([
      [key, 'さだめ'],
      [key, 'うんめい'],
    ]);
    expect((await getLines(literal.id)).map((l) => l.text)).toEqual(rawLyrics.split('\n'));
  });
  it('produces a document that validates against the schema, without derived data', async () => {
    await seedRichLibrary();
    const backup = await buildBackup(new Date('2026-11-05T10:00:00Z'));
    expect(backupSchema.safeParse(backup).success).toBe(true);
    expect(backup.format).toBe('overtone-backup');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.songs).toHaveLength(4);
    const text = serializeBackup(backup);
    expect(text).toContain('\n  "format"'); // 2-space pretty print
    for (const derived of ['searchText', 'lineCount', 'learnedCount', 'analysis', '"lines"']) {
      expect(text).not.toContain(derived);
    }
  });

  it('is deterministic for a seeded library (same input → identical bytes)', async () => {
    await seedRichLibrary();
    const when = new Date('2026-11-05T10:00:00Z');
    const one = serializeBackup(await buildBackup(when));
    const two = serializeBackup(await buildBackup(when));
    expect(two).toBe(one);
  });

  it('exports a known small library exactly (format snapshot)', async () => {
    await makeSong({
      id: uuid(9),
      now: 5,
      title: 'T',
      artist: 'A',
      language: 'ko',
      rawLyrics: 'x\ny',
    });
    const b = await buildBackup(new Date('2026-01-02T03:04:05Z'));
    const { checksum, ...rest } = b;
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(rest).toEqual({
      format: 'overtone-backup',
      schemaVersion: 1,
      exportedAt: '2026-01-02T03:04:05.000Z',
      app: { name: 'Overtone', version: '0.1.0' },
      settings: {
        theme: 'system',
        textSize: 2,
        romanisation: {
          ja: { longVowels: 'macron', showRomajiLine: true, furiganaForKanaWords: false },
          ko: { mode: 'pronunciation' },
          zh: { tones: 'marks', sandhi: false },
        },
      },
      songs: [
        {
          id: uuid(9),
          title: 'T',
          artist: 'A',
          language: 'ko',
          languageDetected: false,
          rawLyrics: 'x\ny',
          lineKindOverrides: [],
          displayMode: 'learn',
          cleanVariant: 'original',
          source: { kind: 'manual' },
          createdAt: 5,
          updatedAt: 5,
          openedAt: 5,
          progress: [],
          corrections: [],
        },
      ],
    });
  });

  it('excludes soft-deleted songs', async () => {
    const a = await makeSong();
    await makeSong();
    await softDeleteSong(a.id);
    expect((await buildBackup()).songs).toHaveLength(1);
  });

  it('names the file overtone-backup-YYYY-MM-DD.json', () => {
    expect(backupFilename(new Date(2026, 10, 5))).toBe('overtone-backup-2026-11-05.json');
    expect(backupFilename(new Date(2026, 0, 9))).toBe('overtone-backup-2026-01-09.json');
  });

  it('recordExport stores the time and resets the reminder counters', async () => {
    await makeSong();
    expect((await getSettings()).backup.songsSinceExport).toBe(1);
    await recordExport(1234);
    const s = (await getSettings()).backup;
    expect(s).toMatchObject({ lastExportAt: 1234, songsSinceExport: 0, changesSinceExport: 0 });
  });
});

describe('round trip (J11.6)', () => {
  it('export → wipe → import (replace) yields an identical library', async () => {
    await seedRichLibrary();
    const before = await dumpLibrary(db);
    const text = serializeBackup(await buildBackup());
    await wipe();
    expect((await dumpLibrary(db)).songs).toHaveLength(0);

    const parsed = await parseOk(text);
    expect(parsed.checksumOk).toBe(true);
    const result = await applyImport(parsed.backup, 'replace');
    expect(result).toEqual({ added: 4, updated: 0, keptLocal: 0 });
    const after = await dumpLibrary(db);
    expect(after).toEqual(before);
    // Spot checks that the dump really covered the interesting parts.
    expect(after.corrections).toHaveLength(6);
    expect(after.songs.find((s) => s.id === uuid(2))!.source).toMatchObject({
      kind: 'lrclib',
      trackId: 42,
    });
    expect(after.lines.find((l) => l.id === `${uuid(1)}:5`)!.kindOverride).toBe('section');
    expect(after.settings!.romanisation.zh).toEqual({ tones: 'numbers', sandhi: true });
  });

  it('a second export of the re-imported library is byte-identical', async () => {
    await seedRichLibrary();
    const when = new Date('2026-11-05T10:00:00Z');
    const first = serializeBackup(await buildBackup(when));
    await wipe();
    await applyImport((await parseOk(first)).backup, 'replace');
    expect(serializeBackup(await buildBackup(when))).toBe(first);
  });
});

describe('merge (J11.4)', () => {
  it('inserts new songs and reports counts in the preview', async () => {
    const local = await makeSong({ id: uuid(1), now: 100 });
    const backup = await mkBackup([await mkSong(1), await mkSong(2)]);
    expect(await previewImport(backup)).toEqual({
      total: 2,
      newSongs: 1,
      existingSongs: 1,
      newerInFile: 0,
    });
    const r = await applyImport(backup, 'merge');
    expect(r.added).toBe(1);
    expect((await listSongs()).length).toBe(2);
    expect(local.id).toBe(uuid(1));
  });

  it('newer file copy wins for text/details; learned keys are unioned and pruned to existing lines', async () => {
    const s = await makeSong({ id: uuid(1), now: 100, title: 'Local', rawLyrics: 'a\nb\nc' });
    await setLearned(s.id, await lineKey('a'), true);
    const backup = await mkBackup([
      await mkSong(1, {
        title: 'From file',
        updatedAt: 500,
        rawLyrics: 'a\nb\nz',
        progress: [
          { lineKey: await lineKey('b'), learnedAt: 7 },
          { lineKey: await lineKey('c'), learnedAt: 8 }, // 'c' no longer exists in the newer text
        ],
      }),
    ]);
    expect((await previewImport(backup)).newerInFile).toBe(1);
    const r = await applyImport(backup, 'merge');
    expect(r).toEqual({ added: 0, updated: 1, keptLocal: 0 });
    const after = (await getSong(s.id))!;
    expect(after.title).toBe('From file');
    expect(after.rawLyrics).toBe('a\nb\nz');
    expect(after.learnedCount).toBe(2); // a (local) + b (file); c dropped
    expect((await getLines(s.id)).map((l) => l.text)).toEqual(['a', 'b', 'z']);
  });

  it('newer local copy keeps its text but still receives learned keys from the file', async () => {
    const s = await makeSong({ id: uuid(1), now: 900, title: 'Local newer', rawLyrics: 'a\nb\nc' });
    const backup = await mkBackup([
      await mkSong(1, {
        title: 'Old file',
        updatedAt: 50,
        rawLyrics: 'a\nq',
        progress: [
          { lineKey: await lineKey('a'), learnedAt: 1 },
          { lineKey: await lineKey('q'), learnedAt: 2 },
        ],
      }),
    ]);
    expect(await applyImport(backup, 'merge')).toEqual({ added: 0, updated: 0, keptLocal: 1 });
    const after = (await getSong(s.id))!;
    expect(after.title).toBe('Local newer');
    expect(after.rawLyrics).toBe('a\nb\nc');
    expect(after.learnedCount).toBe(1); // 'a'; 'q' does not exist locally
  });

  it('unions corrections by id; newer updatedAt wins; existing local-only ones survive', async () => {
    const s = await makeSong({ id: uuid(1), now: 100 });
    const localOnly = await createCorrection(
      {
        songId: s.id,
        lineKey: null,
        surface: 'L',
        occurrence: null,
        language: 'ko',
        patch: { reading: 'local' },
      },
      100,
    );
    const shared = await createCorrection(
      {
        songId: s.id,
        lineKey: null,
        surface: 'S',
        occurrence: null,
        language: 'ko',
        patch: { reading: 'old' },
      },
      200,
    );
    const mk = (id: string, reading: string, updatedAt: number) => ({
      id,
      lineKey: null,
      surface: 'S',
      occurrence: null,
      language: 'ko' as const,
      patch: { reading },
      createdAt: 1,
      updatedAt,
    });
    const backup = await mkBackup([
      await mkSong(1, {
        updatedAt: 50,
        corrections: [mk(shared.id, 'newer', 300), mk(uuid(77), 'fresh', 10)],
      }),
    ]);
    await applyImport(backup, 'merge');
    const all = (await listCorrections(s.id)).sort((a, b) => a.updatedAt - b.updatedAt);
    expect(all.map((c) => c.patch.reading).sort()).toEqual(['fresh', 'local', 'newer']);
    expect(all.find((c) => c.id === localOnly.id)).toBeDefined();
  });

  it('restores a song that was soft-deleted locally', async () => {
    const s = await makeSong({ id: uuid(1), now: 100 });
    await softDeleteSong(s.id);
    await applyImport(await mkBackup([await mkSong(1, { title: 'Back again' })]), 'merge');
    expect((await getSong(s.id))!.title).toBe('Back again');
  });

  it('leaves local settings alone', async () => {
    await updateSettings((x) => ({ ...x, theme: 'light' }));
    await applyImport(await mkBackup([await mkSong(1)]), 'merge');
    expect((await getSettings()).theme).toBe('light');
  });

  it('keeps the latest openedAt and the earliest createdAt', async () => {
    await makeSong({ id: uuid(1), now: 100 });
    await db.songs.update(uuid(1), { openedAt: 900, updatedAt: 100 });
    await applyImport(
      await mkBackup([await mkSong(1, { createdAt: 50, openedAt: 300, updatedAt: 200 })]),
      'merge',
    );
    const s = (await getSong(uuid(1)))!;
    expect(s.openedAt).toBe(900);
    expect(s.createdAt).toBe(50);
  });
});

describe('replace', () => {
  it('removes songs not in the file and applies the file’s settings, keeping device state', async () => {
    await makeSong({ id: uuid(5) });
    await updateSettings((s) => ({
      ...s,
      storage: { persistRequested: true, persisted: true },
      backup: { ...s.backup, lastExportAt: 77 },
    }));
    const b = await mkBackup([await mkSong(1)]);
    b.settings.theme = 'dark';
    await applyImport(b, 'replace');
    expect((await listSongs()).map((s) => s.id)).toEqual([uuid(1)]);
    const s = await getSettings();
    expect(s.theme).toBe('dark');
    expect(s.storage.persisted).toBe(true);
    expect(s.backup.lastExportAt).toBe(77);
  });
});

describe('rejections leave the database unchanged (J11.3)', () => {
  async function expectRejected(input: string | unknown, reason: RegExp) {
    await makeSong({ id: uuid(50), now: 1 });
    const before = await dumpLibrary(db);
    const r = await parseBackup(typeof input === 'string' ? input : JSON.stringify(input));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
    expect(await dumpLibrary(db)).toEqual(before);
  }

  it('malformed JSON', () => expectRejected('{ not json', /not valid JSON/));
  it('non-object JSON', () => expectRejected('[1,2]', /not an Overtone backup/));
  it('wrong format id', async () =>
    expectRejected(
      { ...(await mkBackup([])), format: 'something-else' },
      /not an Overtone backup/,
    ));
  it('newer schema version', async () =>
    expectRejected(
      { ...(await mkBackup([])), schemaVersion: BACKUP_SCHEMA_VERSION + 1 },
      /newer version of Overtone/,
    ));
  it('missing schema version', async () => {
    const { schemaVersion: _omit, ...rest } = await mkBackup([]);
    void _omit;
    await expectRejected(rest, /schema version/);
  });
  it('oversized file', () => expectRejected('x'.repeat(MAX_BACKUP_BYTES + 1), /larger than 50 MB/));
  it('over-long title', async () =>
    expectRejected(await mkBackup([await mkSong(1, { title: 'x'.repeat(201) })]), /title/));
  it('over-long lyrics', async () =>
    expectRejected(
      await mkBackup([await mkSong(1, { rawLyrics: 'x'.repeat(20_001) })]),
      /rawLyrics/,
    ));
  it('too many lines', async () =>
    expectRejected(
      await mkBackup([await mkSong(1, { rawLyrics: Array(1_001).fill('a').join('\n') })]),
      /more than 1000 lines/,
    ));
  it('invalid song UUID', async () =>
    expectRejected(await mkBackup([await mkSong(1, { id: 'not-a-uuid' })]), /songs\.0\.id/));
  it('invalid correction UUID', async () =>
    expectRejected(
      await mkBackup([
        await mkSong(1, {
          corrections: [
            {
              id: 'nope',
              lineKey: null,
              surface: 's',
              occurrence: null,
              language: 'ko',
              patch: {},
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        }),
      ]),
      /corrections/,
    ));
  it('duplicate song ids', async () =>
    expectRejected(await mkBackup([await mkSong(1), await mkSong(1)]), /same song twice/));
  it('too many songs', async () => {
    const many = await mkBackup(
      await Promise.all(Array.from({ length: MAX_BACKUP_SONGS + 1 }, (_, i) => mkSong(i + 1))),
    );
    await expectRejected(many, /songs/);
  });
  it('invalid enum value', async () =>
    expectRejected(await mkBackup([await mkSong(1, { language: 'xx' as never })]), /language/));
  it('__proto__ keys anywhere', async () => {
    const good = JSON.stringify(await mkBackup([await mkSong(1)]));
    await expectRejected(
      good.replace('"songs":', '"__proto__":{"polluted":true},"songs":'),
      /disallowed key/,
    );
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
  it('constructor keys nested in a song', async () => {
    const good = JSON.stringify(await mkBackup([await mkSong(1)]));
    await expectRejected(
      good.replace('"displayMode"', '"constructor":{},"displayMode"'),
      /disallowed key/,
    );
  });
});

describe('transactional import', () => {
  it('a failure part-way through a Replace rolls everything back', async () => {
    await seedRichLibrary();
    const before = await dumpLibrary(db);
    const backup = await mkBackup([await mkSong(1), await mkSong(2)]);
    vi.spyOn(db.lines, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    await expect(applyImport(backup, 'replace')).rejects.toThrow();
    expect(await dumpLibrary(db)).toEqual(before);
  });

  it('a failure part-way through a Merge rolls everything back', async () => {
    const s = await makeSong({ id: uuid(1), now: 100, rawLyrics: 'a\nb' });
    await setLearned(s.id, await lineKey('a'), true);
    const before = await dumpLibrary(db);
    const backup = await mkBackup([
      await mkSong(1, { updatedAt: 999, rawLyrics: 'z' }),
      await mkSong(2),
    ]);
    const original = db.songs.put.bind(db.songs);
    let calls = 0;
    vi.spyOn(db.songs, 'put').mockImplementation(((row, key) => {
      if (++calls === 2) return Promise.reject(new Error('boom'));
      return original(row, key);
    }) as typeof db.songs.put);
    await expect(applyImport(backup, 'merge')).rejects.toThrow();
    expect(await dumpLibrary(db)).toEqual(before);
  });
});

describe('checksum and migrations', () => {
  it('a checksum mismatch is reported but not fatal (hand-edited backups are legitimate)', async () => {
    const b = await mkBackup([await mkSong(1)]);
    b.songs[0]!.title = 'Edited by hand';
    const r = await parseOk(b);
    expect(r.checksumOk).toBe(false);
    expect(r.backup.songs[0]!.title).toBe('Edited by hand');
  });

  it('accepts a backup without languageDetected (hand-made files)', async () => {
    const b = await mkBackup([await mkSong(1)]);
    const raw = JSON.parse(JSON.stringify(b)) as { songs: Record<string, unknown>[] };
    delete raw.songs[0]!['languageDetected'];
    expect((await parseOk(raw)).backup.songs[0]!.languageDetected).toBe(false);
  });

  it('migration harness runs steps sequentially (v0 → v1 example)', () => {
    const v0 = { format: 'overtone-backup', schemaVersion: 0, legacy: true };
    const out = migrateBackup(v0, 1, { 0: (d) => ({ ...d, migrated: true }) });
    expect(out).toMatchObject({ schemaVersion: 1, migrated: true });
    const chain = migrateBackup({ schemaVersion: 0 }, 2, {
      0: (d) => ({ ...d, a: 1 }),
      1: (d) => ({ ...d, b: 2 }),
    });
    expect(chain).toMatchObject({ schemaVersion: 2, a: 1, b: 2 });
  });

  it('a missing migration step is an error, not a silent pass', () => {
    expect(() => migrateBackup({ schemaVersion: 0 }, 1, {})).toThrow(BackupMigrationError);
  });

  it('every frozen fixtures/backups/v{n}.json imports into the current version', async () => {
    const file = path.join(import.meta.dirname, '..', '..', '..', 'fixtures', 'backups', 'v1.json');
    const r = await parseOk(readFileSync(file, 'utf8'));
    expect(r.checksumOk).toBe(true);
    await applyImport(r.backup, 'replace');
    const songs = await listSongs();
    expect(songs.map((s) => s.title).sort()).toEqual(['Fixture JA', 'Fixture KO']);
    const ko = songs.find((s) => s.title === 'Fixture KO')!;
    expect(ko.learnedCount).toBe(2); // repeated chorus counted per occurrence
    expect((await listCorrections(ko.id)).length).toBe(1);
  });

  it('language change on an imported song still works (smoke)', async () => {
    await applyImport(await mkBackup([await mkSong(1)]), 'replace');
    expect(
      (await updateDetails(uuid(1), { title: 'x', artist: null, language: 'ja' })).language,
    ).toBe('ja');
  });
});
