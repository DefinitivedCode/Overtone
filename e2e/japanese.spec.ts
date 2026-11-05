import { expect, test } from './fixtures';
import { addSong, expectAxeClean, expectNoOverflow, setTheme, WIDTHS } from './helpers';

test('Japanese resources load on demand, resume analysis, and survive offline reload and worker idle', async ({
  page,
  context,
}) => {
  const packRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/packs/ja-core/')) packRequests.push(r.url());
  });
  await page.clock.install();
  await page.goto('/');
  await addSong(page, { title: 'Korean', lyrics: '사랑해' });
  await expect(page.locator('rt')).toHaveText('saranghae');
  expect(packRequests).toEqual([]);

  await page.getByRole('link', { name: 'Library' }).click();
  await addSong(page, { title: 'Japanese', lyrics: '東京へ行きます', language: 'Japanese' });
  await expect(page.getByText(/Japanese needs a one-time download/)).toBeVisible();
  await expect(page.locator('rt')).toHaveCount(0);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: /Downloading|Installing/ })).toBeVisible();
  await expect(page.locator('rt').first()).toHaveText('とうきょう', { timeout: 30_000 });
  await expect(page.getByText('tōkyō', { exact: true })).toBeVisible();
  expect(packRequests.some((url) => url.endsWith('ipadic.pack'))).toBe(true);
  expect(packRequests.some((url) => url.endsWith('dict.pack'))).toBe(true);

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('rt').first()).toHaveText('とうきょう');
  await page.getByRole('link', { name: 'Library' }).click();
  await addSong(page, { title: 'Fresh offline', lyrics: '昨日の雨', language: 'Japanese' });
  await expect(page.locator('rt').first()).toHaveText('きのう', { timeout: 15_000 });
  await expect.poll(() => page.workers().length).toBe(1);
  await page.clock.fastForward(61_000);
  await expect.poll(() => page.workers().length).toBe(0);
  await page.getByRole('link', { name: 'Library' }).click();
  await addSong(page, { title: 'After idle', lyrics: '名前を呼ぶ', language: 'Japanese' });
  await expect(page.locator('rt').first()).toHaveText('なまえ', { timeout: 15_000 });
  await context.setOffline(false);
});

test('pasted readings survive reload and Edit toggles interpretation (J2.8)', async ({ page }) => {
  await page.goto('/');
  await addSong(page, {
    title: 'Pasted',
    lyrics: '|運命《さだめ》\n運命《うんめい》',
    language: 'Japanese',
  });
  await expect(page.locator('rt')).toHaveText(['さだめ', 'うんめい']);
  await expect(page.getByRole('list', { name: 'Lyrics' })).not.toContainText('《');
  await page.reload();
  await expect(page.locator('rt')).toHaveText(['さだめ', 'うんめい']);
  await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
  await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText('sadame');
  await page.getByRole('button', { name: 'Song options' }).click();
  await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit lyrics' });
  const use = dialog.getByRole('switch', { name: 'Use readings from pasted text' });
  await expect(use).toBeChecked();
  await use.press('Space');
  await expect(use).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
    '運命《さだめ》',
  );
});

for (const theme of ['light', 'dark'] as const) {
  test(`Japanese modes align and wrap in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setTheme(page, theme);
    const pack = page.getByRole('listitem').filter({ hasText: 'Japanese' });
    await pack.getByRole('button', { name: /Download ·/ }).click();
    await expect(pack.getByRole('button', { name: 'Remove' })).toBeVisible({ timeout: 30_000 });
    await expectAxeClean(page, `Japanese preferences ${theme}`);
    // Cold offline path: install from Settings before any Japanese worker has loaded the tokenizer.
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.context().setOffline(true);
    await page.reload();
    await expect(pack.getByRole('button', { name: 'Remove' })).toBeVisible();
    await page.getByRole('link', { name: 'Library' }).click();
    await addSong(page, {
      title: 'Japanese layout',
      lyrics: `I love you ${'東京へ行きます。'.repeat(7)}\n空を見る`,
      language: 'Japanese',
    });
    const readings = page.locator('rt');
    await expect(readings.first()).toHaveText('とうきょう', { timeout: 15_000 });
    await page.context().setOffline(false);
    await expect(page.locator('span[lang="en"]').first()).toHaveText('I');
    await expect(page.locator('rt').filter({ hasText: /^へ$/u })).toHaveCount(0);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await expectNoOverflow(page, `Japanese Learn @${width}`);
      const misaligned = await readings.evaluateAll(
        (nodes) =>
          nodes.filter((rt) => {
            const base = rt.previousElementSibling?.getBoundingClientRect();
            const reading = rt.getBoundingClientRect();
            return (
              !base ||
              reading.right <= base.left ||
              reading.left >= base.right ||
              reading.top >= base.top
            );
          }).length,
      );
      expect(misaligned, `ruby @${width}`).toBe(0);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await expectAxeClean(page, `Japanese Learn ${theme}`);
    if (info.project.name === 'webkit-iphone')
      await page.screenshot({ path: info.outputPath(`learn-${theme}.png`) });
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      'I love you tōkyō e ikimasu',
    );
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await expectNoOverflow(page, `Japanese Karaoke @${width}`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await expectAxeClean(page, `Japanese Karaoke ${theme}`);
    if (info.project.name === 'webkit-iphone')
      await page.screenshot({ path: info.outputPath(`karaoke-${theme}.png`) });
    await page.getByRole('radio', { name: 'Clean' }).check({ force: true });
    const clean = page.getByRole('article', { name: 'Lyrics' });
    await expect(clean).toContainText('I love you 東京へ行きます');
    await page.getByRole('radio', { name: 'Romanised' }).check({ force: true });
    await expect(clean).toContainText('I love you tōkyō e ikimasu');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await expectNoOverflow(page, `Japanese Clean @${width}`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await expectAxeClean(page, `Japanese Clean ${theme}`);
    if (info.project.name === 'webkit-iphone')
      await page.screenshot({ path: info.outputPath(`clean-${theme}.png`) });

    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: /Doubled/ }).check({ force: true });
    await page.getByRole('switch', { name: 'Show romaji in Learn mode' }).uncheck({ force: true });
    await page
      .getByRole('switch', { name: 'Show furigana for kana-only words' })
      .check({ force: true });
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: /Japanese layout/ }).click();
    await expect(clean).toContainText('toukyou e ikimasu');
    await page.getByRole('radio', { name: 'Learn' }).check({ force: true });
    await expect(page.locator('rt').filter({ hasText: /^へ$/u }).first()).toBeVisible();
    await expect(page.getByText('toukyou', { exact: true })).toHaveCount(0);
  });
}
