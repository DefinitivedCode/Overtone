import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import type { PageWithAllow } from './fixtures';
import {
  addSong,
  expectAxeClean,
  expectNoOverflow,
  setTheme,
  WIDTHS,
  openPronunciation,
} from './helpers';

const MANDARIN = '我爱你\n你好吗';
const CANTONESE = '我哋喺度\n唔該晒';

const packRow = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Offline language downloads' })
    .getByRole('listitem')
    .filter({ hasText: name });

async function addHan(
  page: Page,
  title: string,
  lyrics: string,
  language: 'Mandarin' | 'Cantonese',
) {
  await addSong(page, { title, lyrics, language });
}

test.describe('language packs (Mandarin, Cantonese)', () => {
  test('Settings lists each pack with its size; download shows progress; Remove asks first (J12.2)', async ({
    page,
  }) => {
    await page.goto('/settings');
    const group = packRow(page, 'Mandarin');
    await expect(group.getByText('Mandarin')).toBeVisible();
    await expect(group.getByText(/Not downloaded · ≈ [\d.]+ MB/).first()).toBeVisible();
    await group
      .getByRole('button', { name: /Download · [\d.]+ MB/ })
      .first()
      .click();
    await expect(group.getByRole('progressbar', { name: /Downloading|Installing/ })).toBeVisible();
    await expect(group.getByText(/Downloaded · [\d.]+ MB/).first()).toBeVisible({
      timeout: 15_000,
    });
    await group.getByRole('button', { name: 'Remove' }).click();
    const dlg = page.getByRole('dialog', { name: 'Remove language data?' });
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(group.getByText(/^Downloaded ·/)).toBeVisible();
    await group.getByRole('button', { name: 'Remove' }).click();
    await dlg.getByRole('button', { name: 'Remove' }).click();
    await expect(group.getByText(/Not downloaded/).first()).toBeVisible();
  });

  test('a Mandarin song shows the download notice, then readings appear after installing (J12.3)', async ({
    page,
  }) => {
    await page.goto('/');
    await addHan(page, 'Mandarin song', MANDARIN, 'Mandarin');
    await expect(
      page.getByText(/Pronunciation for Mandarin needs a one-time download \(≈ [\d.]+ MB\)/),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'Lyrics' })).toContainText('我爱你'); // original text meanwhile
    await expect(page.locator('rt')).toHaveCount(0);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.locator('rt', { hasText: 'wǒ' })).toBeVisible({ timeout: 15_000 }); // processing resumed on its own
    await expect(page.locator('rt', { hasText: 'nǐ' }).first()).toBeVisible();
    await expect(page.getByText(/needs a one-time download/)).toHaveCount(0);

    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText('wǒ ài nǐ');
  });

  test('Cantonese shows jyutping with tone numbers', async ({ page }) => {
    await page.goto('/settings');
    const group = packRow(page, 'Cantonese');
    await group
      .getByRole('button', { name: /Download/ })
      .last()
      .click();
    await expect(group.getByText(/^Downloaded ·/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: /Library/ }).click();
    await addHan(page, 'Canto', CANTONESE, 'Cantonese');
    await expect(page.locator('rt', { hasText: 'ngo5' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('rt', { hasText: 'dei6' })).toBeVisible();
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      'ngo5 dei6 hai2 dou6',
    );
  });

  test('Mandarin options: tone numbers and 一/不 tone changes apply without reprocessing (J13.3)', async ({
    page,
  }) => {
    await page.goto('/settings');
    const group = packRow(page, 'Mandarin');
    await group
      .getByRole('button', { name: /Download/ })
      .first()
      .click();
    await expect(group.getByText(/^Downloaded ·/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: /Library/ }).click();
    await addHan(page, 'Tones', '一个不是', 'Mandarin');
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    const group2 = page.getByRole('group', { name: 'Romanised lyrics' });
    await expect(group2).toContainText('yī ge bù shì', { timeout: 30_000 });

    await page.getByRole('link', { name: /Library/ }).click();
    await page.getByRole('link', { name: 'Settings' }).click();
    await openPronunciation(page, 'Mandarin');
    await page.getByRole('switch', { name: /Apply 一 \/ 不 tone changes/ }).check({ force: true });
    await page.getByRole('radio', { name: /Numbers/ }).check({ force: true });
    await page.getByRole('link', { name: /Library/ }).click();
    await page.getByRole('link', { name: /Tones/ }).click();
    // CC-CEDICT's 一個/一个 entry is yi1 ge5. Sandhi changes 一 and 不, preserving neutral 個.
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      'yi2 ge5 bu2 shi4',
    );
  });

  for (const [language, lyrics, reading, newText, newReading] of [
    ['Mandarin', MANDARIN, 'wǒ', '你好世界', 'shì'],
    ['Cantonese', CANTONESE, 'ngo5', '佢唔係嘅', 'keoi5'],
  ] as const)
    test(`after installing, ${language} songs open and are analysed offline (J12.1)`, async ({
      page,
      context,
    }) => {
      await page.goto('/settings');
      const row = page.getByRole('listitem').filter({ hasText: language });
      await row.getByRole('button', { name: /Download/ }).click();
      await expect(row.getByRole('button', { name: 'Remove' })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('link', { name: /Library/ }).click();
      await addHan(page, 'Offline song', lyrics, language);
      await expect(page.locator('rt', { hasText: reading })).toBeVisible({ timeout: 15_000 });

      // Make sure the service worker has installed and controls the page, then go offline.
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      await page.reload();
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await context.setOffline(true);
      await page.reload(); // the song page itself, from the service worker's cached shell
      await expect(page.locator('rt', { hasText: reading })).toBeVisible();
      await page.getByRole('link', { name: /Library/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
      await page.getByRole('link', { name: /Offline song/ }).click();
      await expect(page.locator('rt', { hasText: reading })).toBeVisible();

      // A brand-new song is analysed offline too (dictionary in IndexedDB, code cached by the service worker).
      await page.getByRole('link', { name: /Library/ }).click();
      await addHan(page, 'New offline', newText, language);
      await expect(page.locator('rt', { hasText: newReading })).toBeVisible({ timeout: 15_000 });
      await context.setOffline(false);
    });

  test('offline without the pack: the Download button explains it needs a connection (J12.3)', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await addHan(page, 'No data', MANDARIN, 'Mandarin');
    await expect(page.getByText(/needs a one-time download/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
    await context.setOffline(true);
    // WebKit's offline emulation can leave navigator.onLine true.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    await expect(page.getByRole('button', { name: 'Connect to download' })).toBeDisabled();
    await expect(page.getByRole('list', { name: 'Lyrics' })).toContainText('我爱你');
    await context.setOffline(false);
  });

  test('a failed download shows a clear error and can be retried', async ({ page }) => {
    (page as PageWithAllow).allowConsoleError(/Failed to load resource|ERR_FAILED/);
    let fail = true;
    await page.route('**/packs/zh-core/**/dict.pack', (route) =>
      fail ? route.abort() : route.continue(),
    );
    await page.goto('/settings');
    const group = packRow(page, 'Mandarin');
    await group
      .getByRole('button', { name: /Download/ })
      .first()
      .click();
    await expect(group.getByText(/download failed/i)).toBeVisible();
    fail = false;
    await group.getByRole('button', { name: 'Try again' }).click();
    await expect(group.getByText(/^Downloaded ·/)).toBeVisible({ timeout: 15_000 });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`Chinese modes wrap and pass accessibility checks in ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await setTheme(page, theme);
      const settings = page.getByRole('region', { name: 'Offline language downloads' });
      await expect(settings.getByRole('button', { name: /Download ·/ })).toHaveCount(3);
      await expectAxeClean(page, `pack settings before install, ${theme}`);
      for (const language of ['Mandarin', 'Cantonese'] as const) {
        const row = settings.getByRole('listitem').filter({ hasText: language });
        await row.getByRole('button', { name: /Download ·/ }).click();
        await expect(row.getByRole('button', { name: 'Remove' })).toBeVisible({ timeout: 15_000 });
      }
      await expectAxeClean(page, `pack settings after install, ${theme}`);
      if (info.project.name === 'webkit-iphone') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`pack-settings-${theme}.png`),
          fullPage: true,
        });
      }
      await page.getByRole('link', { name: /Library/ }).click();
      for (const [language, phrase, roman] of [
        ['Mandarin', '我爱你', 'wǒ ài nǐ'],
        ['Cantonese', '我哋喺度', 'ngo5 dei6 hai2 dou6'],
      ] as const) {
        await addHan(page, `${language} layout`, `${phrase.repeat(8)}\n${phrase}`, language);
        await expect(page.locator('rt').first()).toHaveText(roman.split(' ')[0]!);
        const layout = async (mode: string) => {
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 812 });
            await expectNoOverflow(page, `${language} ${mode} at ${width}px`);
          }
          await page.setViewportSize({ width: 375, height: 812 });
          await expectAxeClean(page, `${language} ${mode}, ${theme}`);
          if (info.project.name === 'webkit-iphone') {
            await page.screenshot({ path: info.outputPath(`${language}-${mode}-${theme}.png`) });
          }
        };
        await layout('Learn');
        await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
        await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(roman);
        await layout('Karaoke');
        await page.getByRole('radio', { name: 'Clean' }).check({ force: true });
        const clean = page.getByRole('article', { name: 'Lyrics' });
        await expect(clean).toContainText(phrase);
        await layout('Clean');
        await page.getByRole('radio', { name: 'Romanised' }).check({ force: true });
        await expect(clean).toContainText(roman);
        await layout('Clean-romanised');
        await page.getByRole('link', { name: /Library/ }).click();
      }
    });
  }
});
