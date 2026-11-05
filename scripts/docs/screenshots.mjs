// Regenerates docs/screenshots/*.png for the README from the production build.
// Usage: npm run build && npx vite preview --port 4173 (in another terminal), then: node scripts/docs/screenshots.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { devices, webkit } from '@playwright/test';

const base = process.env.BASE ?? 'http://127.0.0.1:4173';
const out = path.resolve(import.meta.dirname, '..', '..', 'docs', 'screenshots');
mkdirSync(out, { recursive: true });

// Original, public-domain-style practice text written for this project (not a real song's lyrics).
const SONG = {
  title: 'Practice Song',
  artist: 'Overtone',
  lyrics: '[Verse]\n나는 노래해\n사랑해 요\n\n[Chorus]\nbaby 좋다 같이 가자\n',
};

const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices['iPhone 15'],
  deviceScaleFactor: 2,
  colorScheme: 'light',
});
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem('overtone:installTipDismissed', '1'));
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

await page.goto(base + '/');
await page.getByRole('button', { name: 'Add song', exact: true }).click();
const dialog = page.getByRole('dialog', { name: 'New Song' });
await page.waitForTimeout(500);
await dialog.getByLabel('Title', { exact: true }).fill(SONG.title);
await dialog.getByLabel('Artist (optional)').fill(SONG.artist);
await dialog.getByLabel('Lyrics').fill(SONG.lyrics);
await shot('add-song');
await dialog.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('heading', { level: 1, name: SONG.title }).waitFor();
await page.waitForSelector('rt');
await page.waitForTimeout(400);
await shot('learn');

await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
await page.getByRole('button', { name: 'Split into syllables' }).click();
await page.waitForTimeout(300);
await shot('karaoke');

await page.getByRole('radio', { name: 'Learn' }).check({ force: true });
await page.getByRole('button', { name: /^노래해/ }).click();
await page.getByRole('button', { name: /Download Korean dictionary/ }).click();
await page
  .getByText(/Source: (Wiktionary|kengdic)/)
  .first()
  .waitFor({ timeout: 60_000 });
await page.waitForTimeout(500);
await shot('word-sheet');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

await page.goto(base + '/');
await page.waitForTimeout(300);
await shot('library');
await page.goto(base + '/settings');
await page.getByRole('heading', { level: 1, name: 'Settings' }).waitFor();
await page.waitForTimeout(400);
await shot('settings');

await browser.close();
console.log(`screenshots written to ${out}`);
