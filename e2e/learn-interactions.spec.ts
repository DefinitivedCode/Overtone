import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import type { PageWithAllow } from './fixtures';
import { KO, addSong } from './helpers';

const learnList = (page: Page) => page.getByRole('list', { name: 'Lyrics' });

/** Makes IndexedDB writes to one store fail with a quota error once `window.__failWrites` is set. */
async function failWritesTo(page: Page, store: string) {
  await page.addInitScript((name) => {
    for (const method of ['add', 'put', 'delete'] as const) {
      const original = IDBObjectStore.prototype[method] as (...a: unknown[]) => IDBRequest;
      IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: unknown[]) {
        if ((window as unknown as { __failWrites?: boolean }).__failWrites && this.name === name)
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return original.apply(this, args);
      } as never;
    }
  }, store);
}

test.describe('Learn mode interactions', () => {
  test('word buttons are named with word, reading and action, and are large enough to tap (J4.3)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Names', lyrics: '사랑해 요' });
    const word = learnList(page).getByRole('button', {
      name: '사랑해, reading saranghae. Show meaning.',
    });
    await expect(word).toBeVisible();
    const box = (await word.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(24);
  });

  test('an unreadable word is marked "?", says "No reading found", and can be given a reading (J4.5)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Hanja', lyrics: `${KO}\n사랑 愛` });
    const hanja = learnList(page).getByRole('button', {
      name: '愛, no reading found. Show details.',
    });
    await expect(hanja).toBeVisible();
    await expect(hanja.locator('rt')).toHaveText('?');
    await hanja.click();
    const sheet = page.getByRole('dialog', { name: '愛' });
    await expect(sheet).toContainText('No reading found');
    await sheet.getByRole('button', { name: 'Correct…' }).click();
    const form = page.getByRole('dialog', { name: /^Correct / });
    await form.getByLabel('Romanisation', { exact: true }).fill('sarang');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(
      learnList(page)
        .locator('rt', { hasText: /^sarang$/ })
        .last(),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      'sarang sarang',
    );
  });

  test('a low-confidence word is underlined and explains itself in the Word sheet (J4.6)', async ({
    page,
  }) => {
    await page.goto('/');
    // Separate jamo (ㅋㅋ) are only read letter by letter, so they are flagged as uncertain.
    await addSong(page, { title: 'Guess', lyrics: '사랑해 ㅋㅋ' });
    const word = learnList(page).getByRole('button', { name: /ㅋㅋ/ });
    await expect(word).toBeVisible();
    expect(
      await word
        .locator('ruby')
        .first()
        .evaluate((el) => getComputedStyle(el).textDecorationLine),
    ).toBe('underline');
    await word.click();
    const sheet = page.getByRole('dialog', { name: 'ㅋㅋ' });
    await expect(sheet.getByText(/read letter by letter\. Check it\./)).toBeVisible();
  });

  test('the line menu (right-click / context-menu key) marks learned and copies (J4.8)', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await addSong(page, { title: 'Menu', lyrics: '나는 노래해\n사랑해 요' });
    await expect(learnList(page).locator('rt').first()).toBeVisible();

    await learnList(page).locator('li[data-line-index="0"] p').first().click({ button: 'right' });
    const menu = page.getByRole('dialog', { name: 'Line 1' });
    await expect(menu).toBeVisible();
    await page.waitForTimeout(450);
    await menu.getByRole('button', { name: 'Copy original' }).click();
    await expect(page.getByText(/Original copied|Could not copy/)).toBeVisible();
    if (browserName === 'chromium')
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('나는 노래해');
    await expect(menu).toBeHidden();

    // Keyboard: the context-menu key on the check button.
    const check = page.getByRole('button', { name: 'Mark line 2 as learned' });
    await check.focus();
    await page.keyboard.press('ContextMenu');
    const second = page.getByRole('dialog', { name: 'Line 2' });
    await expect(second).toBeVisible();
    await page.waitForTimeout(450);
    await second.getByRole('button', { name: 'Mark as learned' }).click();
    await expect(page.getByRole('button', { name: 'Mark line 2 as learned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('correcting a word never changes progress (J7.4)', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Progress', lyrics: '나는 노래해\n사랑해 요' });
    await expect(learnList(page).locator('rt').first()).toBeVisible();
    await page.getByRole('button', { name: 'Mark line 1 as learned' }).click();
    await expect(page.getByText('1 of 2 lines')).toBeVisible();
    await learnList(page)
      .getByRole('button', { name: /노래해/ })
      .click();
    await page.getByRole('button', { name: 'Correct…' }).click();
    const form = page.getByRole('dialog', { name: /^Correct / });
    await form.getByLabel('Romanisation', { exact: true }).fill('norae');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(learnList(page).locator('rt', { hasText: /^norae$/ })).toBeVisible();
    await expect(page.getByText('1 of 2 lines')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark line 1 as learned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('a failed progress write reverts the toggle and says so (J7.1)', async ({ page }) => {
    await failWritesTo(page, 'progress');
    await page.goto('/');
    await addSong(page, { title: 'Revert', lyrics: '나는 노래해' });
    const check = page.getByRole('button', { name: 'Mark line 1 as learned' });
    await expect(check).toBeVisible();
    await page.evaluate(
      () => ((window as unknown as { __failWrites: boolean }).__failWrites = true),
    );
    await check.click();
    await expect(
      page.getByText('Could not save your progress. Nothing was changed.'),
    ).toBeVisible();
    await expect(check).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('storage failures (J12.6, J2.4)', () => {
  test('a quota error while saving a song shows a clear message with Export, and nothing is pretended saved', async ({
    page,
  }) => {
    await failWritesTo(page, 'songs');
    (page as PageWithAllow).allowConsoleError(/quota|Quota/);
    await page.goto('/');
    await page.getByRole('button', { name: 'Add song', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New Song' });
    await page.waitForTimeout(450);
    await dialog.getByLabel('Title', { exact: true }).fill('Too big');
    await dialog.getByLabel('Lyrics').fill(KO);
    await page.evaluate(
      () => ((window as unknown as { __failWrites: boolean }).__failWrites = true),
    );
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      dialog
        .getByRole('alert')
        .or(dialog.getByText(/storage|space|saved/i))
        .first(),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export backup' })).toBeVisible();
    // Still on the form with the text intact; no song was created.
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Too big');
    await page.evaluate(
      () => ((window as unknown as { __failWrites: boolean }).__failWrites = false),
    );
  });
});
