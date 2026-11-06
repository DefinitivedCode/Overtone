import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { KO, addSong, expectAxeClean, expectNoOverflow } from './helpers';

// Issue #3: restrained motion. The mode selector's thumb slides with a transform (no layout shift), menus fade in
// briefly, and reduced motion makes both instant.

/** m41 of a computed `matrix(a, b, c, d, tx, ty)` string. */
const translateX = (m: string) => parseFloat(m.replace(/^matrix\(|\)$/g, '').split(',')[4] ?? '0');

const thumb = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[role="radiogroup"][aria-label="Mode"]') as HTMLElement;
    const cs = getComputedStyle(el, '::before');
    return {
      transform: cs.transform,
      transitionProperty: cs.transitionProperty,
      duration: cs.transitionDuration,
      width: cs.width,
    };
  });

const selectedBox = (page: Page) => page.locator('label:has(input:checked)').first().boundingBox();

for (const reduced of [false, true]) {
  test(`mode selector thumb follows the selection (reduced motion: ${reduced})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.goto('/');
    await addSong(page, { title: 'Motion', lyrics: KO });
    const group = page.getByRole('radiogroup', { name: 'Mode' });
    const before = await thumb(page);
    expect(before.transitionProperty).toBe('transform');
    // Only a transform animates, and not at all under reduced motion.
    expect(parseFloat(before.duration) === 0).toBe(reduced);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    for (const name of ['Karaoke', 'Clean', 'Learn']) {
      await group.locator('label', { hasText: name }).click();
      await page.waitForTimeout(350);
      const label = (await group.locator('label', { hasText: name }).boundingBox())!;
      const g = (await group.boundingBox())!;
      const t = await thumb(page);
      // At rest the thumb is exactly one third wide and sits under the chosen segment.
      const tx = translateX(t.transform);
      expect(Math.abs(g.x + 2 + tx - label.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(parseFloat(t.width) - label.width)).toBeLessThanOrEqual(1);
      expect((await selectedBox(page))!.x).toBeCloseTo(label.x, 0);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await expectNoOverflow(page, 'mode selector');
    await expectAxeClean(page, 'mode selector with thumb');
  });
}

test('mode selector stays keyboard-operable and keeps focus while the thumb moves', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'WebKit does not tab to radios by default');
  await page.goto('/');
  await addSong(page, { title: 'Keys', lyrics: KO });
  await page.getByRole('radio', { name: 'Learn' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Karaoke' })).toBeFocused();
  await expect(page.getByRole('radio', { name: 'Karaoke' })).toBeChecked();
});

test('menus fade in briefly and not at all under reduced motion', async ({ page }) => {
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.goto('/');
    await addSong(page, { title: `Menu ${reduced}`, lyrics: KO });
    await page.getByRole('button', { name: 'Song options' }).click();
    const d = await page
      .getByRole('menu')
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    if (reduced) expect(d).toBe(0);
    else expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.2);
    await page.keyboard.press('Escape');
    await page.goto('/');
  }
});
