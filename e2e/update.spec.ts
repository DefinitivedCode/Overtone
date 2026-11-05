import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { KO } from './helpers';

/**
 * Service-worker update flow (J12.7). The real build is served from dist/ by a small static server whose /sw.js can
 * be swapped for a byte-different one at will, i.e. "a new version was deployed". Nothing is mocked in the browser.
 */
const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

interface Host {
  server: Server;
  origin: string;
  deploy: () => void;
}

async function serveDist(): Promise<Host> {
  const original = await readFile(path.join(DIST, 'sw.js'), 'utf8');
  let sw = original;
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/sw.js') {
        res.writeHead(200, { 'content-type': TYPES['.js']!, 'cache-control': 'no-cache' });
        res.end(sw);
        return;
      }
      let file = path.join(DIST, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST)) file = path.join(DIST, 'index.html');
      const found = await stat(file).catch(() => null);
      if (!found?.isFile()) file = path.join(DIST, 'index.html'); // SPA fallback
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(await readFile(file));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    // A new deployment changes the worker script (its VERSION constant), so browsers treat it as an update.
    deploy: () => {
      sw = original.replace(/const VERSION = "[^"]*";/, 'const VERSION = "deployed-later";');
      expect(sw).not.toBe(original);
    },
  };
}

async function controlled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      // A navigation can destroy the page context between polls; treat that as "not yet".
      page.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false),
    )
    .toBe(true);
}

test.describe('app updates', () => {
  let host: Host;
  test.beforeEach(async () => {
    host = await serveDist();
  });
  test.afterEach(async () => {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  });

  test('a deployed update is announced, waits for the user, and keeps their data', async ({
    page,
  }) => {
    await page.goto(host.origin + '/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // the first load is uncontrolled; now the worker controls the page
    await controlled(page);

    await page.getByRole('button', { name: 'Add song', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New Song' });
    await dialog.getByLabel('Title', { exact: true }).fill('Keeps');
    await dialog.getByLabel('Lyrics').fill(KO);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Keeps' })).toBeVisible();
    await page.getByRole('link', { name: 'Library' }).click();

    // While the user is editing, the update is held back: open the Add sheet with unsaved text, then deploy.
    await page.getByRole('button', { name: 'Add song', exact: true }).click();
    const editing = page.getByRole('dialog', { name: 'New Song' });
    await editing.getByLabel('Title', { exact: true }).fill('Unsaved draft');
    host.deploy();
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });
    await expect
      .poll(() =>
        page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
      )
      .toBe(true);
    await page.waitForTimeout(2500);
    await expect(page.getByText('A new version is ready')).toHaveCount(0);
    await expect(editing.getByLabel('Title', { exact: true })).toHaveValue('Unsaved draft');

    // Once the sheet is closed the toast appears; nothing has reloaded on its own.
    await editing.getByRole('button', { name: 'Cancel' }).click();
    const discard = page.getByRole('dialog', { name: /Discard/ });
    if (await discard.isVisible().catch(() => false))
      await discard.getByRole('button', { name: /Discard/ }).click();
    await expect(page.getByText('A new version is ready')).toBeVisible({ timeout: 10_000 });

    const before = await page.evaluate(() => performance.timeOrigin);
    await page.getByRole('button', { name: 'Reload', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => performance.timeOrigin).catch(() => before), {
        timeout: 20_000,
      })
      .not.toBe(before);
    await controlled(page);
    await expect(page.getByRole('link', { name: /Keeps/ })).toBeVisible();
    await expect(page.getByText('A new version is ready')).toHaveCount(0);
    // The new worker is the active one.
    const active = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { waiting: !!reg?.waiting, active: !!reg?.active };
    });
    expect(active).toEqual({ waiting: false, active: true });
  });
});
