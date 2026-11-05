import { z } from 'zod';
import { LIMITS } from '@/lyrics/parse';

/** Current backup schema version. Bump with a migration when the format or the line-key function changes. */
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'overtone-backup';
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_BACKUP_SONGS = 5_000;

const lang = z.enum(['ko', 'ja', 'zh', 'yue']);
const segLang = z.enum(['ko', 'ja', 'zh', 'yue', 'en', 'other', 'none']);
const lineKind = z.enum(['lyric', 'section', 'blank']);
const ts = z.number().int().min(0);
const keyStr = z.string().min(1).max(64);

const correction = z.object({
  id: z.uuid(),
  lineKey: keyStr.nullable(),
  surface: z.string().min(1).max(LIMITS.title),
  occurrence: z.number().int().min(0).nullable(),
  language: lang,
  patch: z.object({
    reading: z.string().max(500).optional(),
    romanisation: z.string().max(500).optional(),
    gloss: z.string().max(2000).optional(),
    glossMode: z.enum(['replace', 'prepend']).optional(),
    segLang: segLang.optional(),
    split: z.array(z.number().int().min(0)).max(200).optional(),
    mergeWithNext: z.number().int().min(1).max(50).optional(),
  }),
  createdAt: ts,
  updatedAt: ts,
});

const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }),
  z.object({
    kind: z.literal('lrclib'),
    trackId: z.number().int(),
    fetchedAt: ts,
    syncedLyrics: z.string().max(200_000).nullable(),
    duration: z.number().nullable(),
    album: z.string().max(500).nullable(),
  }),
]);

const song = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(LIMITS.title),
  artist: z.string().max(LIMITS.artist).nullable(),
  language: lang,
  languageDetected: z.boolean().default(false),
  rawLyrics: z.string().max(LIMITS.lyricsChars),
  lineKindOverrides: z
    .array(z.object({ index: z.number().int().min(0), kind: lineKind }))
    .max(LIMITS.lyricsLines),
  displayMode: z.enum(['learn', 'karaoke', 'clean']),
  cleanVariant: z.enum(['original', 'romanised']),
  source,
  createdAt: ts,
  updatedAt: ts,
  openedAt: ts,
  progress: z.array(z.object({ lineKey: keyStr, learnedAt: ts })).max(LIMITS.lyricsLines),
  corrections: z.array(correction).max(10_000),
});

/** Device-independent settings only: storage state, backup counters and library view state are excluded. */
export const backupSettings = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  textSize: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  romanisation: z.object({
    ja: z.object({
      longVowels: z.enum(['macron', 'doubled']),
      showRomajiLine: z.boolean(),
      furiganaForKanaWords: z.boolean(),
    }),
    ko: z.object({ mode: z.enum(['pronunciation', 'letters']) }),
    zh: z.object({ tones: z.enum(['marks', 'numbers']), sandhi: z.boolean() }),
  }),
});

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string().max(40),
  app: z.object({ name: z.string().max(100), version: z.string().max(50) }),
  settings: backupSettings,
  songs: z.array(song).max(MAX_BACKUP_SONGS),
  checksum: z.string().max(128),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupSong = Backup['songs'][number];
export type BackupSettings = z.infer<typeof backupSettings>;
export type BackupCorrection = BackupSong['corrections'][number];
