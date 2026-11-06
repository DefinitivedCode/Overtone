import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { addSong } from './helpers';

// Issue #1: sheets must open with stable geometry. The panel's own height must not change while it slides in
// (the Word sheet used to grow with late content) and it must come to rest flush with the bottom of the
// viewport, with a full sheet leaving only the safe-area/8px gap at the top.

interface Frame {
  h: number;
  top: number;
  bottom: number;
}

/** Records the panel rect on every animation frame from the moment `act` runs until it has settled. */
async function record(
  page: Page,
  act: () => Promise<void>,
): Promise<{ frames: Frame[]; ih: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    const tick = () => {
      const p = document.querySelector('dialog[open]')?.firstElementChild;
      if (p) {
        const r = p.getBoundingClientRect();
        w.__frames.push({ h: r.height, top: r.top, bottom: r.bottom });
      }
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await act();
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __stop: boolean };
    w.__stop = true;
    return { frames: w.__frames, ih: window.innerHeight };
  });
}

function expectStable({ frames, ih }: { frames: Frame[]; ih: number }, kind: 'full' | 'half') {
  expect(frames.length).toBeGreaterThan(0);
  const heights = frames.map((f) => Math.round(f.h * 2) / 2);
  expect(
    new Set(heights).size,
    `panel height changed while opening: ${[...new Set(heights)]}`,
  ).toBe(1);
  const last = frames.at(-1)!;
  expect(last.bottom).toBeCloseTo(ih, 0);
  if (kind === 'full') expect(last.top).toBeCloseTo(8, 0);
  else {
    expect(last.h).toBeGreaterThan(ih * 0.3);
    expect(last.h).toBeLessThanOrEqual(ih * 0.6);
  }
  // Never starts above its resting place (no overshoot / flash of a too-high sheet).
  for (const f of frames) expect(f.top).toBeGreaterThanOrEqual(last.top - 1);
}

for (const reduced of [false, true]) {
  test.describe(`sheet geometry (reduced motion: ${reduced})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    });

    test('Add song sheet opens at a stable full height', async ({ page }) => {
      await page.goto('/');
      const r = await record(page, () =>
        page
          .getByRole('button', { name: /^Add (a )?song$/i })
          .first()
          .click(),
      );
      expectStable(r, 'full');
      await expect(page.getByRole('dialog', { name: 'New Song' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'New Song' })).toBeFocused();
    });

    test('Word sheet opens at a stable half height and closes with Escape', async ({ page }) => {
      await page.goto('/');
      await addSong(page, { title: 'W', lyrics: '사랑해 baby\n노래해' });
      const word = page
        .getByRole('list', { name: 'Lyrics' })
        .getByRole('button', { name: /^(?!Mark line)/ })
        .filter({ hasText: '사랑해' });
      const r = await record(page, () => word.click());
      expectStable(r, 'half');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(word).toBeFocused();
    });
  });
}
