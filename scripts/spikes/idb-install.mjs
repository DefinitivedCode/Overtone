// Build first with `npm run packs && npm run build`. Optionally pass a saved build and trial count.
import { chromium, webkit } from '@playwright/test';
import { preview } from 'vite';

const outDir = process.argv[2] ?? 'dist';
const trials = Number(process.argv[3] ?? '3');
const engine = process.argv[4];
const server = await preview({
  configFile: false,
  build: { outDir },
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
const url = `http://127.0.0.1:${server.httpServer.address().port}/settings`;

try {
  for (const type of [chromium, webkit]) {
    if (engine && engine !== type.name()) continue;
    const browser = await type.launch();
    try {
      for (const name of ['Mandarin', 'Cantonese']) {
        for (let i = 0; i < trials; i++) {
          const page = await browser.newPage();
          try {
            await page.goto(url);
            const row = page.getByRole('listitem').filter({ hasText: name });
            const button = row.getByRole('button', { name: /Download ·/ });
            await button.waitFor();
            const start = performance.now();
            await button.click();
            const done = row.getByRole('button', { name: 'Remove' });
            const error = row.getByRole('alert');
            await done.or(error).first().waitFor({ timeout: 180_000 });
            if (await error.isVisible()) throw new Error(await error.innerText());
            const ms = Math.round(performance.now() - start);
            console.log(`${type.name()} ${browser.version()} ${name} trial ${i + 1}: ${ms} ms`);
          } catch (error) {
            console.log(
              `${type.name()} ${browser.version()} ${name} trial ${i + 1}: ${error.message}`,
            );
          } finally {
            await page.context().close();
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
