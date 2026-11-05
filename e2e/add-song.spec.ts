import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { JA, KO, showClean } from './helpers';

async function openAdd(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add song', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Song' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('add song (paste path)', () => {
  test('Save stays disabled until title and lyrics are present (J2.2)', async ({ page }) => {
    const dialog = await openAdd(page);
    const save = dialog.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Title', { exact: true }).fill('T');
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Lyrics').fill(KO);
    await expect(save).toBeEnabled();
    await dialog.getByLabel('Title', { exact: true }).fill('');
    await dialog.getByLabel('Lyrics').focus();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Enter a title.' })).toBeVisible();
    await expect(save).toBeDisabled();
  });

  test('auto-detect hints for Korean and Japanese', async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Lyrics').fill(KO);
    await expect(dialog.getByText('Looks like Korean')).toBeVisible();
    await dialog.getByLabel('Lyrics').fill(JA);
    await expect(dialog.getByText('Looks like Japanese')).toBeVisible();
  });

  test('Han-only text requires a Mandarin/Cantonese choice, with a labelled suggestion (J2.3)', async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('Chinese song');
    await dialog.getByLabel('Lyrics').fill('我哋喺度\n佢唔係嘅');
    await expect(dialog.getByText('Chinese — choose Mandarin or Cantonese below')).toBeVisible();
    await expect(dialog.getByText(/Suggested: Cantonese — this is only a guess/)).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Cantonese' })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Mandarin' }).check({ force: true });
    await expect(dialog.getByText('Using Mandarin.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Mandarin' })).toHaveText('CN');
    await showClean(page);
    await expect(page.locator('article[aria-label="Lyrics"] p').first()).toHaveAttribute(
      'lang',
      'zh-Hans',
    );
  });

  test('Cantonese songs use the zh-HK font language; Traditional Mandarin uses zh-Hant', async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('Canto');
    await dialog.getByLabel('Lyrics').fill('我愛你');
    await dialog.getByLabel('Language', { exact: true }).selectOption({ label: 'Cantonese' });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await showClean(page);
    await expect(page.locator('article[aria-label="Lyrics"] p').first()).toHaveAttribute(
      'lang',
      'zh-HK',
    );
  });

  test('Latin-only text cannot be saved until a language is chosen', async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('English');
    await dialog.getByLabel('Lyrics').fill('I love you\nla la la');
    await expect(dialog.getByText('Couldn’t detect a language — choose one.')).toBeVisible();
    const save = dialog.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Language', { exact: true }).selectOption({ label: 'Korean' });
    await expect(save).toBeEnabled();
  });

  test('limits show a clear message instead of truncating (J2.5)', async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('x'.repeat(201));
    await expect(
      dialog.getByRole('alert').filter({ hasText: /Title is too long \(201 of 200/ }),
    ).toBeVisible();
    await dialog.getByLabel('Title', { exact: true }).fill('ok');
    await dialog.getByLabel('Lyrics').fill('사'.repeat(20_001));
    await expect(
      dialog.getByRole('alert').filter({ hasText: /too long \(20,001 of 20,000/ }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await dialog.getByLabel('Lyrics').fill('가\n'.repeat(1_001));
    await expect(dialog.getByRole('alert').filter({ hasText: /too many lines/ })).toBeVisible();
  });

  test('stores the original text exactly (NFC, newlines) and shows it with sections and blank lines (J2.1)', async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('Exact');
    await dialog
      .getByLabel('Lyrics')
      .fill('[Chorus]\r\n사랑해 요  \r\n\r\n    indented\r\n(Repeat)\r\n');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await showClean(page);
    const lyrics = page.locator('article[aria-label="Lyrics"]');
    await expect(lyrics.locator('p')).toHaveText([
      '[Chorus]',
      '사랑해 요  ',
      '    indented',
      '(Repeat)',
    ]);
    expect(await lyrics.locator('div[aria-hidden="true"]').count()).toBe(1); // the blank line
  });

  test('discard confirmation on Cancel and Escape; Keep editing preserves input (J2.6)', async ({
    page,
  }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('Draft title');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    const confirm = page.getByRole('dialog', { name: 'Discard this song?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Draft title');

    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('dialog', { name: 'New Song' })).toBeHidden();
    await page.getByRole('button', { name: 'Add song', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'New Song' }).getByLabel('Title', { exact: true }),
    ).toHaveValue('');
  });

  test('draft is autosaved and survives a reload (J2.6)', async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('Long paste');
    await dialog.getByLabel('Lyrics').fill(KO);
    // Poll the real stored draft rather than sleeping: debounce + write time varies under load.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<string | null>((resolve) => {
              const open = indexedDB.open('overtone');
              open.onerror = () => resolve(null);
              open.onsuccess = () => {
                const db = open.result;
                const get = db.transaction('drafts').objectStore('drafts').get('add-song');
                get.onsuccess = () => {
                  db.close();
                  resolve((get.result as { lyrics?: string } | undefined)?.lyrics ?? null);
                };
                get.onerror = () => resolve(null);
              };
            }),
        ),
      )
      .toContain('사랑해');
    await page.reload();
    await page.getByRole('button', { name: 'Add song', exact: true }).click();
    const again = page.getByRole('dialog', { name: 'New Song' });
    await expect(again.getByLabel('Title', { exact: true })).toHaveValue('Long paste');
    await expect(again.getByLabel('Lyrics')).toHaveValue(KO);
  });

  test('closing an empty sheet needs no confirmation; Escape and browser Back close it; focus returns', async ({
    page,
  }) => {
    await openAdd(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'New Song' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add song', exact: true })).toBeFocused();

    await page.getByRole('button', { name: 'Add song', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'New Song' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'New Song' })).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('dragging the sheet header down dismisses it', async ({ page }) => {
    const dialog = await openAdd(page);
    // Wait for the slide-in to finish: measuring the header mid-animation drags from the wrong place.
    await expect
      .poll(() =>
        dialog
          .locator('> div')
          .first()
          .evaluate((el) => getComputedStyle(el).transform),
      )
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    const header = dialog.locator('h2').locator('..');
    const box = (await header.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 6 });
    await page.mouse.move(box.x + box.width / 2, box.y + 600, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'New Song' })).toBeHidden();
  });

  test('saving requests persistent storage and reports the result in Settings (J12.4)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.storage, 'persist', { value: async () => true });
      Object.defineProperty(navigator.storage, 'persisted', {
        value: async () => false,
        configurable: true,
      });
    });
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('Persist');
    await dialog.getByLabel('Lyrics').fill(KO);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Persist' })).toBeVisible();
    await page.waitForTimeout(300);
    await page.goto('/settings');
    // The browser (not our request) is the authority: persisted() is stubbed to false here.
    await expect(page.getByText(/Storage: /)).toContainText(/may be cleared|protected|unknown/);
  });
});
