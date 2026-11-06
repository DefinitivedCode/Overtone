import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { addSong } from './helpers';

// Issue #2: switching Learn / Karaoke / Clean, the Karaoke syllable toggle and the Clean Original/Romanised
// toggle must keep a predictable reading position: the line the reader was on stays where it was on screen, and
// a reader at the top stays at the top.

const LONG = Array.from({ length: 160 }, (_, i) =>
  i % 8 === 0 ? `[Verse ${i / 8 + 1}]` : `사랑해 요 ${'노래해 '.repeat((i % 3) + 1)}`.trim(),
).join('\n');
const SHORT = '사랑해 요\n나는 노래해';

interface Pos {
  scrollY: number;
  index: number | null;
  top: number;
  modesTop: number;
}

/** The first lyric line clear of the sticky bars (or line `only`), and where it sits on screen. */
async function pos(page: Page, only?: number | null): Promise<Pos> {
  return page.evaluate((only) => {
    let index: number | null = null;
    let top = 0;
    for (const el of document.querySelectorAll<HTMLElement>('[data-line-index]')) {
      const r = el.getBoundingClientRect();
      if (only != null ? Number(el.dataset['lineIndex']) === only : r.top >= 110) {
        index = Number(el.dataset['lineIndex']);
        top = r.top;
        break;
      }
    }
    const modes = document.querySelector('[role="radiogroup"][aria-label="Mode"]');
    return {
      scrollY: window.scrollY,
      index,
      top,
      modesTop: modes?.getBoundingClientRect().top ?? 0,
    };
  }, only);
}

const mode = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: 'Mode' }).locator('label', { hasText: name }).click();

/** Taps a control where it is on screen (a plain click would make Playwright scroll it into view first). */
async function tap(page: Page, text: RegExp) {
  const box = (await page.locator('label', { hasText: text }).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function settle(page: Page) {
  await page.waitForTimeout(500);
}

async function open(page: Page, lyrics: string) {
  await page.goto('/');
  await addSong(page, { title: 'Scroll', lyrics });
  await page.getByRole('list', { name: 'Lyrics' }).waitFor();
}

function expectSameSpot(before: Pos, after: Pos, what: string) {
  expect(after.index, `${what}:`).toBe(before.index);
  expect(
    Math.abs(after.top - before.top),
    `${what}: line moved on screen ${JSON.stringify([before, after])}`,
  ).toBeLessThanOrEqual(3);
}

test.describe('scroll position is stable across presentation changes', () => {
  test('at the top, nothing scrolls and the mode selector stays put', async ({ page }) => {
    await open(page, LONG);
    const start = await pos(page);
    expect(start.scrollY).toBe(0);
    for (const m of ['Karaoke', 'Clean', 'Learn']) {
      await mode(page, m);
      await settle(page);
      const p = await pos(page);
      expect(p.scrollY, `scrollY after ${m}`).toBeLessThanOrEqual(1);
      expect(p.modesTop, `mode selector after ${m}`).toBeCloseTo(start.modesTop, 0);
    }
  });

  test('mid-song, the line being read stays in place across modes and toggles', async ({
    page,
  }) => {
    await open(page, LONG);
    await page.evaluate(() => window.scrollTo(0, 700));
    await settle(page);
    let before = await pos(page);
    expect(before.scrollY).toBeGreaterThan(500);

    await mode(page, 'Karaoke');
    await settle(page);
    expectSameSpot(before, await pos(page, before.index), 'Learn → Karaoke');
    expect((await pos(page)).modesTop, 'selector stays visible').toBeGreaterThanOrEqual(0);

    before = await pos(page);
    await page.getByRole('button', { name: 'Split into syllables' }).click();
    await settle(page);
    expectSameSpot(before, await pos(page, before.index), 'syllable toggle on');
    before = await pos(page);
    await page.getByRole('button', { name: 'Split into syllables' }).click();
    await settle(page);
    expectSameSpot(before, await pos(page, before.index), 'syllable toggle off');

    before = await pos(page);
    await mode(page, 'Clean');
    await settle(page);
    expectSameSpot(before, await pos(page, before.index), 'Karaoke → Clean');

    // The Original/Romanised control scrolls with the page: place it just below the sticky bars, as a reader
    // would, so the click itself does not scroll.
    await page.evaluate(() => {
      const l = [...document.querySelectorAll('label')].find((x) => x.textContent === 'Romanised')!;
      window.scrollTo(0, l.getBoundingClientRect().top + window.scrollY - 170);
    });
    await settle(page);
    before = await pos(page);
    await tap(page, /^Romanised$/);
    await settle(page);
    expectSameSpot(before, await pos(page, before.index), 'Clean → Romanised');
    before = await pos(page);
    await tap(page, /^Original$/);
    await settle(page);
    expectSameSpot(before, await pos(page, before.index), 'Clean → Original');
  });

  test('a short song never scrolls', async ({ page }) => {
    await open(page, SHORT);
    for (const m of ['Karaoke', 'Clean', 'Learn']) {
      await mode(page, m);
      await settle(page);
      expect((await pos(page)).scrollY).toBe(0);
    }
  });

  test('keyboard: arrow keys on the mode selector keep focus on it and the page still', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'WebKit does not tab to radios by default');
    await open(page, LONG);
    await page.getByRole('radio', { name: 'Learn' }).focus();
    await page.keyboard.press('ArrowRight');
    await settle(page);
    await expect(page.getByRole('radio', { name: 'Karaoke' })).toBeFocused();
    expect((await pos(page)).scrollY).toBeLessThanOrEqual(1);
  });
});
