import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  JA,
  KO,
  LONG_TEXT_SONGS,
  WIDTHS,
  backupJson,
  expectAxeClean,
  expectNoOverflow,
  importBackup,
  setTheme,
} from './helpers';

async function seed(page: Page) {
  await page.goto('/');
  await importBackup(
    page,
    await backupJson([
      ...LONG_TEXT_SONGS,
      { title: 'Plain Korean', language: 'ko', rawLyrics: KO },
      { title: 'Plain Japanese', language: 'ja', rawLyrics: JA },
      { title: 'Mandarin', language: 'zh', rawLyrics: '我爱你\n你好吗' },
      { title: 'Cantonese', language: 'yue', rawLyrics: '我哋喺度\n佢唔係嘅' },
    ]),
  );
}

/** The sheet panel scrolls itself; its content must not overflow horizontally either. */
async function expectDialogNoOverflow(page: Page, where: string) {
  const over = await page.evaluate(() => {
    const d = document.querySelector('dialog[open]');
    return d
      ? Array.from(d.querySelectorAll('*')).some(
          (el) =>
            el.scrollWidth > el.clientWidth + 1 &&
            getComputedStyle(el).overflowX === 'visible' &&
            el.getBoundingClientRect().right > window.innerWidth + 1,
        )
      : false;
  });
  expect(over, `dialog content overflows on ${where}`).toBe(false);
}

test.describe('layout: no horizontal overflow with awkward text (J4.1)', () => {
  for (const width of WIDTHS) {
    test(`library, song, settings and sheets at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await seed(page);
      await page.goto('/');
      await expectNoOverflow(page, `library @${width}`);

      await page.getByRole('link', { name: /A very long title/ }).click();
      await expect(page.getByRole('list', { name: 'Lyrics' })).toBeVisible();
      await expectNoOverflow(page, `long Korean song @${width}`);
      await page.getByRole('button', { name: 'Song options' }).click();
      await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
      await expect(page.getByRole('dialog', { name: 'Edit lyrics' })).toBeVisible();
      await expectNoOverflow(page, `edit lyrics @${width}`);
      await expectDialogNoOverflow(page, `edit lyrics @${width}`);
      await page.keyboard.press('Escape');

      await page.goto('/');
      await page.getByRole('link', { name: /日本語のとても長い/ }).click();
      await expect(page.getByRole('list', { name: 'Lyrics' })).toBeVisible();
      await expectNoOverflow(page, `long Japanese song @${width}`);

      await page.goto('/');
      await page.getByRole('button', { name: 'Add song', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'New Song' })
        .getByLabel('Lyrics')
        .fill(LONG_TEXT_SONGS[0]!.rawLyrics);
      await expectNoOverflow(page, `add sheet @${width}`);
      await expectDialogNoOverflow(page, `add sheet @${width}`);

      await page.goto('/settings');
      await expectNoOverflow(page, `settings @${width}`);
    });
  }
});

test.describe('accessibility (axe: no serious/critical) on library, song, sheets and dialogs', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`all M3 screens and states (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await seed(page);
      await setTheme(page, theme);

      await page.goto('/');
      await expectAxeClean(page, `library ${theme}`);
      await page.getByRole('button', { name: 'More options for Plain Korean' }).click();
      await expectAxeClean(page, `row menu ${theme}`);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Add song', exact: true }).click();
      const add = page.getByRole('dialog', { name: 'New Song' });
      await add.getByLabel('Lyrics').fill('我哋喺度');
      await expect(add.getByText('Chinese — choose')).toBeVisible();
      await expectAxeClean(page, `add sheet (han choice) ${theme}`);
      await add.getByLabel('Title', { exact: true }).fill('x');
      await add.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('dialog', { name: 'Discard this song?' })).toBeVisible();
      await expectAxeClean(page, `discard confirm ${theme}`);
      await page.getByRole('button', { name: 'Discard' }).click();

      await page.getByRole('link', { name: /Plain Korean/ }).click();
      await expect(page.getByRole('list', { name: 'Lyrics' })).toBeVisible();
      await expect(page.locator('rt').first()).toBeVisible(); // wait for the romanisation to arrive
      await expectAxeClean(page, `song learn ${theme}`);
      await page.getByRole('button', { name: 'Mark line 1 as learned' }).click();
      await expectAxeClean(page, `song learn with a learned line ${theme}`);
      await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
      await expectAxeClean(page, `song karaoke ${theme}`);
      await page.getByRole('radio', { name: 'Clean' }).check({ force: true });
      await expectAxeClean(page, `song clean ${theme}`);
      await page.getByRole('radio', { name: 'Romanised' }).check({ force: true });
      await expectAxeClean(page, `song clean romanised ${theme}`);
      await page.getByRole('button', { name: 'Song options' }).click();
      await page.getByRole('menuitem', { name: 'Edit details' }).click();
      await expectAxeClean(page, `edit details ${theme}`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Song options' }).click();
      await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
      await expectAxeClean(page, `edit lyrics ${theme}`);
      await page.keyboard.press('Escape');

      await page.goto('/settings');
      await expectAxeClean(page, `settings with backup ${theme}`);
      await page.locator('input[type=file]').setInputFiles({
        name: 'b.json',
        mimeType: 'application/json',
        buffer: Buffer.from(await backupJson([{ title: 'Preview', rawLyrics: 'x' }], true)),
      });
      await expect(page.getByRole('dialog', { name: 'Import backup' })).toBeVisible();
      await expectAxeClean(page, `import preview ${theme}`);
    });

    test(`recovery screen (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto('/');
      await page.evaluate(() =>
        localStorage.setItem(
          'overtone:libraryMarker',
          JSON.stringify({ everHadSongs: true, lastCount: 3, lastSeenAt: 1 }),
        ),
      );
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Your library looks empty' })).toBeVisible();
      await expectAxeClean(page, `recovery ${theme}`);
    });
  }
});

test('keyboard-only: add a song and reach it (J1.2)', async ({ page, browserName }) => {
  test.skip(
    browserName === 'webkit',
    'WebKit only tabs to form controls unless the OS setting is enabled',
  );
  await page.goto('/');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    if (
      await page
        .getByRole('button', { name: 'Add song', exact: true })
        .evaluate((el) => el === document.activeElement)
    )
      break;
  }
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New Song' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab'); // Cancel
  await dialog.getByLabel('Title', { exact: true }).focus();
  await page.keyboard.type('Keyboard song');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab'); // Language
  await page.keyboard.press('Tab'); // Lyrics
  await page.keyboard.type('사랑해 요');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled(); // language detection is debounced
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Keyboard song' })).toBeVisible();
});
