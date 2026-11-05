import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { JA, KO, addSong, backupJson, importBackup, showClean } from './helpers';

// Playwright's Chromium may or may not implement Web Share; force the download path unless a test stubs share.
const noShare = () => {
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
};

test.describe('backup', () => {
  test('export downloads overtone-backup-YYYY-MM-DD.json and records the time (J11.1, J11.7)', async ({
    page,
  }) => {
    await page.addInitScript(noShare);
    await page.goto('/');
    await addSong(page, { title: 'Exported', artist: 'A', lyrics: KO });
    await page.goto('/settings');
    await expect(page.getByText('Last backup: Never')).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export backup' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^overtone-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const doc = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
      format: string;
      schemaVersion: number;
      songs: { title: string; rawLyrics: string }[];
    };
    expect(doc.format).toBe('overtone-backup');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.songs.map((s) => s.title)).toEqual(['Exported']);
    expect(doc.songs[0]!.rawLyrics).toBe(KO);
    await expect(page.getByText('Last backup: Just now')).toBeVisible();
  });

  test('uses the Web Share sheet with the file when the browser can share files (J11.2)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        value: async (data: { files: File[] }) => {
          (window as unknown as { __shared: unknown[] }).__shared.push(
            data.files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
          );
        },
        configurable: true,
      });
    });
    await page.goto('/');
    await addSong(page, { title: 'Shared', lyrics: KO });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Export backup' }).click();
    await expect(page.getByText('Last backup: Just now')).toBeVisible();
    const shared = await page.evaluate(
      () =>
        (window as unknown as { __shared: { name: string; type: string; size: number }[][] })
          .__shared,
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]![0]!.name).toMatch(/^overtone-backup-.*\.json$/);
    expect(shared[0]![0]!.type).toBe('application/json');
  });

  test('cancelling the share sheet does not count as a backup', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        value: async () => {
          throw new DOMException('cancelled', 'AbortError');
        },
        configurable: true,
      });
    });
    await page.goto('/');
    await addSong(page, { title: 'Cancelled', lyrics: KO });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Export backup' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Last backup: Never')).toBeVisible();
  });

  test('round trip across a wiped browser profile: export → fresh storage → import (J11.6)', async ({
    page,
    browser,
  }) => {
    await page.addInitScript(noShare);
    await page.goto('/');
    await addSong(page, { title: 'Song KO', artist: 'K', lyrics: KO });
    await page.goto('/');
    await addSong(page, { title: 'Song JA', lyrics: JA });
    await page.goto('/settings');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export backup' }).click(),
    ]);
    const text = readFileSync((await download.path())!, 'utf8');

    const fresh = await browser.newContext({ ...(test.info().project.use as object) });
    const page2 = await fresh.newPage();
    await importBackup(page2, text);
    await page2.goto('/');
    const list = page2.getByRole('list', { name: 'Songs' });
    await expect(list).toContainText('Song KO');
    await expect(list).toContainText('Song JA');
    await page2.getByRole('link', { name: /Song KO/ }).click();
    await showClean(page2);
    await expect(page2.locator('article[aria-label="Lyrics"] p')).toHaveText([
      '[Chorus]',
      '사랑해 요',
      '나는 노래해',
      '[Verse 1]',
      '  leading spaces',
      '사랑해 요',
    ]);
    await fresh.close();
  });

  test('import preview, Merge by default; existing songs are matched by id (J11.4)', async ({
    page,
  }) => {
    const id = '11111111-1111-4111-8111-111111111111';
    await page.goto('/');
    await importBackup(
      page,
      await backupJson([{ id, title: 'Original', rawLyrics: 'a\nb', updatedAt: 1 }]),
    );
    await page.locator('input[type=file]').setInputFiles({
      name: 'b.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        await backupJson([
          { id, title: 'Newer copy', rawLyrics: 'a\nb', updatedAt: 9_000_000_000_000 },
          { title: 'Brand new', rawLyrics: 'x' },
        ]),
      ),
    });
    const dialog = page.getByRole('dialog', { name: 'Import backup' });
    await expect(dialog).toContainText('2 songs in this file: 1 new, 1 already in your library.');
    await expect(dialog.getByRole('radio', { name: 'Merge' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /updated 1/ })).toBeVisible();
    await page.goto('/');
    const list = page.getByRole('list', { name: 'Songs' });
    await expect(list).toContainText('Newer copy');
    await expect(list).toContainText('Brand new');
    await expect(list).not.toContainText('Original');
  });

  test('Replace library needs confirmation and removes songs not in the file', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Local only', lyrics: KO });
    await importBackup(page, await backupJson([{ title: 'From file', rawLyrics: 'x' }]), 'replace');
    await page.goto('/');
    const list = page.getByRole('list', { name: 'Songs' });
    await expect(list).toContainText('From file');
    await expect(list).not.toContainText('Local only');
  });

  test('declining the Replace confirmation changes nothing', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Stays', lyrics: KO });
    await page.goto('/settings');
    await page.locator('input[type=file]').setInputFiles({
      name: 'b.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await backupJson([{ title: 'X', rawLyrics: 'x' }])),
    });
    const dialog = page.getByRole('dialog', { name: 'Import backup' });
    await dialog.getByRole('radio', { name: 'Replace library' }).check({ force: true });
    await expect(
      dialog.getByRole('button', { name: 'Export current library first' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Replace library…' }).click();
    await page
      .getByRole('dialog', { name: 'Replace your library?' })
      .getByRole('button', { name: 'Cancel' })
      .click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('Stays');
  });

  test('invalid files are rejected with a specific reason and nothing is written (J11.3, J11.5)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Safe', lyrics: KO });
    await page.goto('/settings');
    const input = page.locator('input[type=file]');
    const cases: [string, string][] = [
      ['not json {', 'This file is not valid JSON.'],
      [JSON.stringify({ hello: 'world' }), 'This file is not an Overtone backup.'],
      [
        JSON.stringify({ format: 'overtone-backup', schemaVersion: 99 }),
        'This backup was made by a newer version of Overtone.',
      ],
    ];
    for (const [content, reason] of cases) {
      await input.setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from(content),
      });
      await expect(page.getByRole('alert').filter({ hasText: reason })).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Import backup' })).toBeHidden();
    }
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('Safe');
  });

  test('a checksum mismatch warns but can still be imported', async ({ page }) => {
    await page.goto('/settings');
    await page.locator('input[type=file]').setInputFiles({
      name: 'edited.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await backupJson([{ title: 'Hand edited', rawLyrics: 'x' }], true)),
    });
    const dialog = page.getByRole('dialog', { name: 'Import backup' });
    await expect(dialog.getByText(/checksum doesn.t match/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /Imported/ })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('Hand edited (edited)');
  });
});
