import { expect, test } from './fixtures';
import { WIDTHS, expectAxeClean, expectNoOverflow, setTheme } from './helpers';

test.describe('app shell', () => {
  test('library shows the real empty state', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('settings is reachable and has a visible back control', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.getByRole('link', { name: /Library/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  });

  test('unknown routes fall back to the library', async ({ page }) => {
    await page.goto('/nope/not-here');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  });

  test('production CSP is present and the page logs no violations', async ({ page }) => {
    await page.goto('/');
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('connect-src');
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test('manifest is served and references icons that exist', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const res = await request.get(href!);
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { icons: { src: string }[]; display: string };
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    }
  });
});

test.describe('theme', () => {
  test('System follows the OS appearance', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('forced Dark/Light override the OS, persist across reload, and update theme-color', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Dark' }).check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      'content',
      '#121014',
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

    await page.getByRole('radio', { name: 'Light' }).check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      'content',
      '#F6F2EC',
    );
  });

  test('text size changes lyric preview size', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('slider', { name: 'Lyric text size' })).toHaveValue('2');
    const preview = page.getByLabel('Preview');
    const before = await preview.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.getByRole('slider', { name: 'Lyric text size' }).fill('4');
    await expect(page.locator('html')).toHaveAttribute('data-text-size', '4');
    const after = await preview.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(after).toBeGreaterThan(before);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text-size', '4');
  });
});

test.describe('accessibility and layout', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const route of ['/', '/settings']) {
      test(`axe: ${route} (${theme})`, async ({ page }) => {
        await setTheme(page, theme);
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectAxeClean(page, `${route} ${theme}`);
      });
    }
  }

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ['/', '/settings']) {
        await page.goto(route);
        await expectNoOverflow(page, `${route} @${width}`);
      }
    });
  }
});
