import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { KO, addSong, backupJson } from './helpers';

/** Simulates the OS clearing IndexedDB while localStorage survives (partial eviction). */
async function evictIndexedDb(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('overtone');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

test.describe('recovery (J12.5)', () => {
  test('empty database + library marker → recovery screen → import brings songs back', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Lost song', lyrics: KO });
    await evictIndexedDb(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your library looks empty' })).toBeVisible();
    await expect(page.getByText(/may have cleared this app.s storage/)).toBeVisible();

    await page.locator('input[type=file]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await backupJson([{ title: 'Restored', rawLyrics: KO }])),
    });
    await page
      .getByRole('dialog', { name: 'Import backup' })
      .getByRole('button', { name: 'Import', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('Restored');
  });

  test('Start fresh forgets the marker so the screen does not return', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Lost song', lyrics: KO });
    await evictIndexedDb(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Start fresh' }).click();
    await page
      .getByRole('dialog', { name: 'Start with an empty library?' })
      .getByRole('button', { name: 'Start fresh' })
      .click();
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
  });

  test('deliberately deleting every song is not treated as data loss', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await addSong(page, { title: 'Temp', lyrics: KO });
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Delete song' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.clock.fastForward(9_000);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
  });

  test('a brand new install shows the normal empty library', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your library looks empty' })).toHaveCount(0);
  });
});
