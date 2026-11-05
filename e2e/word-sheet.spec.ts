import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { addSong, expectAxeClean, expectNoOverflow } from './helpers';

const words = (page: Page) =>
  page.getByRole('list', { name: 'Lyrics' }).getByRole('button', { name: /^(?!Mark line)/ });

test.describe('Word sheet', () => {
  test('tapping a Korean word offers the dictionary download, then shows meanings, source and dictionary form', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Words', lyrics: '사랑해 baby\n노래해' });
    const word = words(page).filter({ hasText: '사랑해' });
    await expect(word).toBeVisible();
    await word.click();
    const sheet = page.getByRole('dialog', { name: '사랑해' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('saranghae');
    await expect(sheet).toContainText('Meanings need the Korean dictionary data');
    await expectAxeClean(page, 'word sheet without data');

    await sheet.getByRole('button', { name: /Download Korean dictionary/ }).click();
    await expect(sheet).toContainText('to love', { timeout: 30_000 });
    await expect(sheet).toContainText('Dictionary form');
    await expect(sheet).toContainText('사랑하다');
    await expect(sheet).toContainText(/Source: (Wiktionary|kengdic)/);
    await expectAxeClean(page, 'word sheet with meanings');

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // Focus returns to the word that was tapped.
    await expect(word).toBeFocused();

    // English is part of the line but is not a word to look up.
    await expect(words(page).filter({ hasText: 'baby' })).toHaveCount(0);
  });

  test('a word with no entry says so plainly, and the sheet fits narrow screens', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Missing', lyrics: '쀍쀍쀍' });
    await page.goto('/settings');
    await page
      .getByRole('region', { name: 'Offline language downloads' })
      .getByRole('listitem')
      .filter({ hasText: 'Korean dictionary' })
      .getByRole('button', { name: /Download ·/ })
      .click();
    await expect(page.getByText(/Downloaded · [\d.]+ MB/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: /Missing/ }).click();
    await words(page).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('No dictionary entry was found');
    await page.setViewportSize({ width: 320, height: 640 });
    await expectNoOverflow(page, 'word sheet @320');
  });

  test('Mandarin words show CC-CEDICT meanings once the pack is installed', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Chinese', lyrics: '我爱你\n你好吗', language: 'Mandarin' });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.locator('rt', { hasText: 'wǒ' })).toBeVisible({ timeout: 30_000 });
    await words(page).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Source: CC-CEDICT', { timeout: 15_000 });
  });
});

test('About & licences lists dictionaries, fonts and libraries and passes axe', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Licences and data sources' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'About & licences' })).toBeVisible();
  for (const name of ['CC-CEDICT', 'CC-Canto', 'JMdict (English)', 'kengdic', 'Wiktionary'])
    await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText('Instrument Serif').first()).toBeVisible();
  await expect(page.getByText('react-dom')).toBeVisible();
  await expectNoOverflow(page, 'licences');
  await expectAxeClean(page, 'licences');
});

test('Japanese words show JMdict meanings and the dictionary form', async ({ page }) => {
  await page.goto('/');
  await addSong(page, { title: 'Nihon', lyrics: '空を見ていた', language: 'Japanese' });
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.locator('rt').first()).toBeVisible({ timeout: 60_000 });
  await words(page).filter({ hasText: '見' }).first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Source: JMdict', { timeout: 15_000 });
  await expect(sheet).toContainText('見る');
  await expect(sheet).toContainText(/to (see|look|watch)/);
});
