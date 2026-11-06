import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { JA, KO, addSong } from './helpers';

// Issue #5: the Library sort menu overflowed the left edge on narrow phones (it was right-anchored to a
// trigger that wraps onto its own line at the left of the screen).

async function expectInsideViewport(page: Page, menu: Locator, where: string): Promise<void> {
  const box = await menu.boundingBox();
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  expect(box, `${where}: menu has a box`).not.toBeNull();
  expect(box!.x, `${where}: left edge`).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width, `${where}: right edge`).toBeLessThanOrEqual(vw - 8);
  // Every label must be fully visible, not clipped by an ancestor.
  for (const item of await menu.getByRole('menuitemradio').all()) {
    const b = await item.boundingBox();
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(vw);
  }
}

test.describe('popover menus stay inside the viewport', () => {
  for (const width of [320, 360, 375, 430]) {
    test(`library sort menu @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/');
      await addSong(page, { title: 'Menu song', lyrics: KO });
      await page.getByRole('link', { name: /Library/ }).click();
      const trigger = page.getByRole('button', { name: /^Sort:/ });
      await trigger.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expectInsideViewport(page, menu, `sort @${width}`);
      // Still associated with its trigger: it opens directly below it.
      const t = (await trigger.boundingBox())!;
      const m = (await menu.boundingBox())!;
      expect(m.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
      expect(m.y).toBeLessThanOrEqual(t.y + t.height + 24);
      // Keyboard + selection + dismissal still work.
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.getByRole('menuitemradio', { name: 'Title A–Z' }).click();
      await expect(trigger).toHaveAccessibleName('Sort: Title A–Z');
    });
  }

  test('song row and song screen menus fit at 320', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await addSong(page, { title: 'Row menu', lyrics: JA });
    const song = page.getByRole('button', { name: 'Song options' });
    await song.click();
    await expectInsideViewport(page, page.getByRole('menu'), 'song options');
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: /Library/ }).click();
    await page.getByRole('button', { name: 'More options for Row menu' }).click();
    await expectInsideViewport(page, page.getByRole('menu'), 'row options');
  });
});
