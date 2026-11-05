import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { backupChecksum } from '../src/db/backup/canonical';
import { expect } from './fixtures';

export const WIDTHS = [320, 375, 393, 430, 768] as const;

/** Document must not scroll horizontally (overflow-x: clip would hide the bug, so measure). */
export async function expectNoOverflow(page: Page, where: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${where}`).toBeLessThanOrEqual(innerWidth);
}

/** Switches theme through the Settings UI (the Settings record is the source of truth). */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.goto('/settings');
  await page
    .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light' })
    .check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Fails on serious/critical axe violations. */
export async function expectAxeClean(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.length} nodes) ${v.nodes[0]?.html.slice(0, 160)}`,
    ),
    `axe violations on ${where}`,
  ).toEqual([]);
}

export interface NewSong {
  title: string;
  artist?: string;
  lyrics: string;
  /** Explicit language (needed for Han-only text and Latin-only text). */
  language?: 'Korean' | 'Japanese' | 'Mandarin' | 'Cantonese';
}

export const KO = '[Chorus]\n사랑해 요\n나는 노래해\n\n[Verse 1]\n  leading spaces\n사랑해 요';
export const JA = '君の名前を呼んでいた\n空を見ていた';

/** Adds a song through the real UI and waits for the Song screen. */
export async function addSong(page: Page, song: NewSong): Promise<void> {
  await page.getByRole('button', { name: 'Add song', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Song' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title', { exact: true }).fill(song.title);
  if (song.artist) await dialog.getByLabel('Artist (optional)').fill(song.artist);
  await dialog.getByLabel('Lyrics').fill(song.lyrics);
  if (song.language)
    await dialog.getByLabel('Language', { exact: true }).selectOption({ label: song.language });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: song.title })).toBeVisible();
}

// ---------- backup files ----------

export interface FileSong {
  id?: string;
  title: string;
  artist?: string | null;
  language?: 'ko' | 'ja' | 'zh' | 'yue';
  rawLyrics: string;
  updatedAt?: number;
  progressKeys?: string[];
}

const SETTINGS = {
  theme: 'system',
  textSize: 2,
  romanisation: {
    ja: { longVowels: 'macron', showRomajiLine: true, furiganaForKanaWords: false },
    ko: { mode: 'pronunciation' },
    zh: { tones: 'marks', sandhi: false },
  },
};

/** A valid backup document (correct checksum) built from simple song descriptions. */
export async function backupJson(songs: FileSong[], tamper = false): Promise<string> {
  const full = songs.map((s, i) => ({
    id: s.id ?? randomUUID(),
    title: s.title,
    artist: s.artist ?? null,
    language: s.language ?? 'ko',
    languageDetected: false,
    rawLyrics: s.rawLyrics,
    lineKindOverrides: [],
    displayMode: 'learn',
    cleanVariant: 'original',
    source: { kind: 'manual' },
    createdAt: 1_700_000_000_000 + i,
    updatedAt: s.updatedAt ?? 1_700_000_000_000 + i,
    openedAt: 1_700_000_000_000 + i,
    progress: (s.progressKeys ?? []).map((lineKey) => ({ lineKey, learnedAt: 1 })),
    corrections: [],
  }));
  const doc = {
    format: 'overtone-backup',
    schemaVersion: 1,
    exportedAt: '2026-11-05T10:00:00.000Z',
    app: { name: 'Overtone', version: '0.1.0' },
    settings: SETTINGS,
    songs: full,
    checksum: await backupChecksum(full, SETTINGS),
  };
  if (tamper) doc.songs[0]!.title += ' (edited)';
  return JSON.stringify(doc, null, 2);
}

/** Imports a backup through Settings → Import (merge) and waits for the confirmation toast. */
export async function importBackup(page: Page, json: string, mode: 'merge' | 'replace' = 'merge') {
  await page.goto('/settings');
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  const dialog = page.getByRole('dialog', { name: 'Import backup' });
  await expect(dialog).toBeVisible();
  if (mode === 'replace') {
    await dialog.getByRole('radio', { name: 'Replace library' }).check({ force: true });
    await dialog.getByRole('button', { name: 'Replace library…' }).click();
    await page
      .getByRole('dialog', { name: 'Replace your library?' })
      .getByRole('button', { name: 'Replace library' })
      .click();
  } else {
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  }
  await expect(
    page.getByRole('status').filter({ hasText: /Imported|Library replaced/ }),
  ).toBeVisible();
}

/** Songs with awkward text used for overflow checks (long unbroken Latin, URL, long romanisation). */
export const LONG_TEXT_SONGS: FileSong[] = [
  {
    title:
      'A very long title with an unbrokenwordthatkeepsgoingandgoingandgoingandgoingandgoingandgoing',
    artist: 'https://example.com/a/very/long/url/that/should/never/force/horizontal/scrolling/ever',
    language: 'ko',
    rawLyrics:
      '[Chorus]\nhttps://example.com/some/really/long/path/without/spaces/that/goes/on/and/on/forever\nsaranghaesaranghaesaranghaesaranghaesaranghaesaranghaesaranghae\n사랑해사랑해사랑해사랑해사랑해사랑해사랑해사랑해사랑해사랑해사랑해사랑해\n\n    indented line with   many   spaces',
  },
  {
    title: '日本語のとても長いタイトルがここにあります日本語のとても長いタイトルがここにあります',
    artist: null,
    language: 'ja',
    rawLyrics: '君の名前を呼んでいた'.repeat(8) + '\n空を見ていた',
  },
];
