import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import type { PageWithAllow } from './fixtures';
import { KO, expectAxeClean, expectNoOverflow } from './helpers';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'retry-after',
};

const RESULTS = [
  {
    id: 101,
    trackName: 'Test Song',
    artistName: 'Test Artist',
    albumName: 'Test Album',
    duration: 221,
    instrumental: false,
    plainLyrics: '사랑해 요\n나는 노래해',
    syncedLyrics: '[00:01.00] 사랑해 요',
  },
  {
    id: 102,
    trackName: 'Wordless',
    artistName: 'Test Artist',
    albumName: null,
    duration: 100,
    instrumental: true,
    plainLyrics: null,
  },
  {
    id: 103,
    trackName: 'Not transcribed',
    artistName: 'Test Artist',
    albumName: null,
    duration: 90,
    instrumental: false,
    plainLyrics: null,
  },
];

function api(
  page: Page,
  handler: (route: Route, headers: Record<string, string>) => Promise<void> | void,
) {
  return page.route('https://lrclib.net/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return handler(route, req.headers());
  });
}

const ok = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  });

async function openSearch(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add song', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Song' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(450); // let the sheet's slide-in finish: a forced click on a moving target misses
  await dialog.getByRole('radio', { name: 'Search online' }).check({ force: true });
  await expect(dialog.getByLabel('Song title')).toBeVisible();
  return dialog;
}

test.describe('Online lyrics search (J3)', () => {
  test('search, pick a result, review and save; the source is kept and shown', async ({ page }) => {
    let seen: { url: string; client: string | undefined } | null = null;
    await api(page, (route, headers) => {
      seen = { url: route.request().url(), client: headers['lrclib-client'] };
      return ok(route, RESULTS);
    });
    const dialog = await openSearch(page);
    await expect(dialog.getByText(/community-contributed database/)).toBeVisible();
    await dialog.getByLabel('Song title').fill('Test Song');
    await dialog.getByLabel('Artist').fill('Test Artist');
    await expectAxeClean(page, 'search tab');
    await dialog.getByRole('button', { name: 'Search', exact: true }).click();

    const results = dialog.getByRole('list', { name: 'Search results' });
    await expect(results.getByRole('button')).toHaveCount(3);
    await expect(results.getByRole('button', { name: /Test Song/ })).toContainText('3:41');
    // Instrumental and lyric-less tracks are shown but cannot be picked (J3.4).
    await expect(results.getByRole('button', { name: /Wordless/ })).toBeDisabled();
    await expect(results.getByRole('button', { name: /Wordless/ })).toContainText('Instrumental');
    await expect(results.getByRole('button', { name: /Not transcribed/ })).toBeDisabled();
    await expect(results.getByRole('button', { name: /Not transcribed/ })).toContainText(
      'No plain lyrics',
    );
    await expectNoOverflow(page, 'search results');

    await results.getByRole('button', { name: /Test Song/ }).click();
    // Back on the editable form, prefilled; nothing is saved yet (J3.3).
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Test Song');
    await expect(dialog.getByLabel('Artist (optional)')).toHaveValue('Test Artist');
    await expect(dialog.getByLabel('Lyrics')).toHaveValue('사랑해 요\n나는 노래해');
    await expect(dialog.getByText(/Lyrics from LRCLIB/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Test Song/ })).toHaveCount(0);
    await dialog.getByLabel('Lyrics').fill('사랑해 요\n나는 노래해\n내가 고친 줄');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Test Song' })).toBeVisible();
    await expect(page.getByText('Lyrics from LRCLIB')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Lyrics' })).toContainText('고친');

    const request = seen as { url: string; client: string | undefined } | null;
    expect(new URL(request!.url).searchParams.get('track_name')).toBe('Test Song');
    expect(request!.client).toMatch(/^Overtone\/\d/);

    // The source (with untouched synced lyrics) is stored with the song.
    const stored = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('overtone');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      return await new Promise<unknown>((resolve) => {
        const req = db.transaction('songs').objectStore('songs').getAll();
        req.onsuccess = () => resolve((req.result as { source: unknown }[])[0]?.source);
      });
    });
    expect(stored).toMatchObject({
      kind: 'lrclib',
      trackId: 101,
      syncedLyrics: '[00:01.00] 사랑해 요',
    });
  });

  test('a server error shows a specific message and Retry works', async ({ page }) => {
    let calls = 0;
    await api(page, (route) => {
      calls++;
      return calls === 1
        ? route.fulfill({ status: 503, headers: CORS, body: '' })
        : ok(route, RESULTS);
    });
    (page as PageWithAllow).allowConsoleError(/lrclib.net|503|Failed to load resource/);
    const dialog = await openSearch(page);
    await dialog.getByLabel('Song title').fill('x');
    await dialog.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(dialog.getByText('The lyrics service is having trouble right now.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByRole('list', { name: 'Search results' })).toBeVisible();
  });

  test('a rate-limit reply disables Retry for the Retry-After time, then it recovers', async ({
    page,
  }) => {
    let calls = 0;
    await api(page, (route) => {
      calls++;
      return calls === 1
        ? route.fulfill({ status: 429, headers: { ...CORS, 'retry-after': '2' }, body: '' })
        : ok(route, RESULTS);
    });
    (page as PageWithAllow).allowConsoleError(/lrclib.net|429|Failed to load resource/);
    const dialog = await openSearch(page);
    await dialog.getByLabel('Song title').fill('x');
    await dialog.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(dialog.getByText(/asked us to slow down/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Retry in \d+ s/ })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(dialog.getByRole('list', { name: 'Search results' })).toBeVisible();
  });

  test('an unreadable reply is reported, and no results says so', async ({ page }) => {
    let calls = 0;
    await api(page, (route) => {
      calls++;
      return calls === 1
        ? route.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: '<html>' })
        : ok(route, []);
    });
    const dialog = await openSearch(page);
    await dialog.getByLabel('Song title').fill('x');
    await dialog.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(dialog.getByText(/reply Overtone could not read/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByText(/No songs found/)).toBeVisible();
  });

  test('offline: search says so and makes no request, while pasting lyrics still saves', async ({
    page,
    context,
  }) => {
    let requests = 0;
    await api(page, (route) => {
      requests++;
      return ok(route, RESULTS);
    });
    // Be controlled by the service worker first, as an installed app always is: its precache then serves the Song
    // screen's code while offline.
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const dialog = await openSearch(page);
    await context.setOffline(true);
    await expect(dialog.getByText(/You are offline/)).toBeVisible();
    await dialog.getByLabel('Song title').fill('x');
    await expect(dialog.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
    expect(requests).toBe(0);

    await dialog.getByRole('radio', { name: 'Paste text' }).check({ force: true });
    await dialog.getByLabel('Title', { exact: true }).fill('Typed offline');
    await dialog.getByLabel('Lyrics').fill(KO);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Typed offline' })).toBeVisible();
    await expect(page.getByText('Lyrics from LRCLIB')).toHaveCount(0);
    await context.setOffline(false);
  });

  test('manual entry does not depend on the service: with it blocked, pasting works and no request is needed', async ({
    page,
  }) => {
    let requests = 0;
    await page.route('https://lrclib.net/**', (route) => {
      requests++;
      return route.fulfill({ status: 503, headers: CORS, body: '' });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add song', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New Song' });
    await dialog.getByLabel('Title', { exact: true }).fill('Manual');
    await dialog.getByLabel('Lyrics').fill(KO);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Manual' })).toBeVisible();
    expect(requests).toBe(0);
  });
});
