import type { LineKind } from '@/lyrics/parse';
import type { ReadingSpan } from '@/engine/model';

export type { LineKind };

/** Song primary language. */
export type LangCode = 'ko' | 'ja' | 'zh' | 'yue';
/** Per-segment language. */
export type SegLang = LangCode | 'en' | 'other' | 'none';
export type DisplayMode = 'learn' | 'karaoke' | 'clean';
export type CleanVariant = 'original' | 'romanised';

export type SongSource =
  | { kind: 'manual' }
  | {
      kind: 'lrclib';
      trackId: number;
      fetchedAt: number;
      syncedLyrics: string | null;
      duration: number | null;
      album: string | null;
    };

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  language: LangCode;
  languageDetected: boolean;
  /** Normalised original text (source of truth). */
  rawLyrics: string;
  usePastedReadings?: boolean;
  /** Learnable (lyric) lines, counted per occurrence. Cached for the Library. */
  lineCount: number;
  /** Learned learnable lines, per occurrence. Cached; recomputed transactionally. */
  learnedCount: number;
  displayMode: DisplayMode;
  cleanVariant: CleanVariant;
  source: SongSource;
  /** Folded title + artist + lyrics, optionally followed by \u0001 + folded romanised text. */
  searchText: string;
  createdAt: number;
  /** Changes to text/details/mode — NOT progress. Drives backup merge conflicts. */
  updatedAt: number;
  openedAt: number;
  deletedAt: number | null;
}

export interface Line {
  /** `${songId}:${index}` — positions are rewritten on edit. */
  id: string;
  songId: string;
  index: number;
  text: string;
  kind: LineKind;
  kindOverride: LineKind | null;
  key: string;
  readings?: ReadingSpan[];
}

export interface Progress {
  songId: string;
  lineKey: string;
  learnedAt: number;
}

export interface CorrectionPatch {
  reading?: string;
  romanisation?: string;
  gloss?: string;
  glossMode?: 'replace' | 'prepend';
  segLang?: SegLang;
  split?: number[];
  mergeWithNext?: number;
}

export interface Correction {
  id: string;
  songId: string;
  /** null = applies to every line in the song. */
  lineKey: string | null;
  surface: string;
  /** nth occurrence of `surface` within the line (0-based); null = all in scope. */
  occurrence: number | null;
  /** Song language when created; inactive if the song language later differs. */
  language: LangCode;
  patch: CorrectionPatch;
  createdAt: number;
  updatedAt: number;
}

/** Derived data — safe to delete at any time. `analysis` is typed in M5 (engine model). */
export interface LineAnalysisCache {
  cacheKey: string;
  songId: string;
  analysis: unknown;
  createdAt: number;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface RomanisationSettings {
  ja: { longVowels: 'macron' | 'doubled'; showRomajiLine: boolean; furiganaForKanaWords: boolean };
  ko: { mode: 'pronunciation' | 'letters' };
  zh: { tones: 'marks' | 'numbers'; sandhi: boolean };
}

export type LibrarySort = 'opened' | 'added' | 'title' | 'artist' | 'progress';
export type LibraryFilter = 'all' | LangCode;

export interface Settings {
  id: 'app';
  theme: ThemePref;
  /** 0..4 (default 2). */
  textSize: 0 | 1 | 2 | 3 | 4;
  romanisation: RomanisationSettings;
  library: { query: string; filter: LibraryFilter; sort: LibrarySort };
  backup: {
    lastExportAt: number | null;
    /** Progress/correction changes since the last export. */
    changesSinceExport: number;
    /** Songs added since the last export (reminder rule, J11.7). */
    songsSinceExport: number;
    reminderDismissedAt: number | null;
  };
  storage: { persistRequested: boolean; persisted: boolean | null };
}

export interface Draft {
  id: 'add-song';
  title: string;
  artist: string;
  language: 'auto' | LangCode;
  lyrics: string;
  usePastedReadings?: boolean;
  updatedAt: number;
}

export interface LibraryMarker {
  everHadSongs: boolean;
  lastCount: number;
  lastSeenAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}
