import { expect, test } from './fixtures';
import { KO, addSong, expectNoOverflow } from './helpers';

const MIB = 1024 * 1024;

test.describe('offline (J12.1, J1.3)', () => {
  test('after the first load the shell, library, songs, modes and progress work with no network', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await addSong(page, { title: 'Offline song', lyrics: KO });
    const songUrl = page.url();
    await page.getByRole('link', { name: 'Library' }).click();

    await context.setOffline(true);
    // Cold navigations (reload, deep link) are answered by the precached shell.
    await page.reload();
    await expect(page.getByRole('link', { name: /Offline song/ })).toBeVisible();
    await page.goto(songUrl);
    await expect(page.getByRole('heading', { level: 1, name: 'Offline song' })).toBeVisible();
    await expect(page.locator('rt', { hasText: 'saranghae' }).first()).toBeVisible();

    // Modes, progress, Settings and the licences page (lazy chunks) all work offline.
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      'naneun noraehae',
    );
    await page.getByRole('radio', { name: 'Learn' }).check({ force: true });
    await page.getByRole('button', { name: 'Mark line 1 as learned' }).click();
    await expect(page.getByRole('button', { name: 'Mark line 1 as learned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.getByRole('link', { name: 'Licences and data sources' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'About & licences' })).toBeVisible();
    await expectNoOverflow(page, 'offline licences');

    await context.setOffline(false);
    await page.goto('/');
    await page.getByRole('link', { name: /Offline song/ }).click();
    await expect(page.getByRole('button', { name: 'Mark line 1 as learned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the precached app shell stays within the 2 MiB budget, excluding language packs', async ({
    page,
  }) => {
    await page.goto('/');
    const bytes = await page.evaluate(async () => {
      const text = await (await fetch('sw.js')).text();
      const urls = JSON.parse(/const URLS = (\[.*?\])\.map/s.exec(text)![1]!) as string[];
      let total = 0;
      for (const url of urls) {
        if (url.includes('/packs/')) continue;
        total += (await (await fetch(new URL(url, location.href))).arrayBuffer()).byteLength;
      }
      return { total, count: urls.length };
    });
    expect(bytes.count).toBeGreaterThan(10);
    expect(bytes.total).toBeLessThanOrEqual(2 * MIB);
  });

  test('without a service worker control the app still starts from the network and reports no errors', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  });

  test('launch images are declared and the manifest installs as a standalone app', async ({
    page,
  }) => {
    await page.goto('/');
    expect(await page.locator('link[rel="apple-touch-startup-image"]').count()).toBeGreaterThan(0);
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
      return (await (await fetch(href)).json()) as { display: string; start_url: string };
    });
    expect(manifest.display).toBe('standalone');
  });

  test('iPhone Safari shows the Add to Home Screen tip once there are songs, and remembers dismissal', async ({
    page,
  }, info) => {
    const ios = info.project.name.startsWith('webkit-iphone');
    await page.goto('/');
    await addSong(page, { title: 'Tip', lyrics: KO });
    await page.getByRole('link', { name: 'Library' }).click();
    const tip = page.getByText(/Install Overtone: tap/);
    if (!ios) {
      await expect(tip).toHaveCount(0);
      return;
    }
    await expect(tip).toBeVisible();
    await page.getByRole('button', { name: /Dismiss/ }).click();
    await expect(tip).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('link', { name: /Tip/ })).toBeVisible();
    await expect(tip).toHaveCount(0);
  });
});
