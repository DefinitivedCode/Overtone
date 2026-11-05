// M4 spike (ADR 0007): ruby rendering in WebKit and Chromium at 320/375 px. Screenshots go to docs/adr/assets/.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from '@playwright/test';
const here = import.meta.dirname;
const out = path.resolve(here, '..', '..', '..', 'docs', 'adr', 'assets');
for (const [name, type] of [
  ['webkit', webkit],
  ['chromium', chromium],
]) {
  const browser = await type.launch();
  for (const width of [320, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 760 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.join(here, 'harness.html')).href);
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => window.measure());
    console.log(`${name} ${width}px`, JSON.stringify(m));
    await page.screenshot({
      path: path.join(out, `0007-ruby-${name}-${width}.png`),
      fullPage: true,
    });
    await page.close();
  }
  await browser.close();
}
