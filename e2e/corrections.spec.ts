import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { addSong, expectAxeClean } from './helpers';

const word = (page: Page, text: string | RegExp) =>
  page
    .getByRole('list', { name: 'Lyrics' })
    .getByRole('button', { name: /^(?!Mark line)/ })
    .filter({ hasText: text });

async function openCorrect(page: Page, text: string | RegExp) {
  await word(page, text).first().click();
  await page.getByRole('button', { name: 'Correct…' }).click();
  return page.getByRole('dialog', { name: /^Correct / });
}

test.describe('Corrections (J8)', () => {
  test('a Korean romanisation correction shows in every mode, persists, and can be reverted', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Fix', lyrics: '나는 노래해\n사랑해' });
    await expect(page.locator('rt', { hasText: 'noraehae' })).toBeVisible();

    const form = await openCorrect(page, '노래해');
    await expectAxeClean(page, 'correction sheet');
    await form.getByLabel('Romanisation', { exact: true }).fill('norae-hae');
    await form.getByLabel('Meaning (optional)').fill('sing along');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(page.locator('rt', { hasText: 'norae-hae' })).toBeVisible();
    await expect(word(page, '노래해')).toHaveAttribute('data-corrected', 'true');
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      'naneun norae-hae',
    );
    await page.getByRole('radio', { name: 'Clean' }).check({ force: true });
    await page.getByRole('radio', { name: 'Romanised' }).check({ force: true });
    await expect(page.locator('article[aria-label="Lyrics"]')).toContainText('naneun norae-hae');

    await page.getByRole('link', { name: 'Library' }).click();
    await page.reload();
    await page.getByRole('link', { name: /Fix/ }).click();
    await expect(page.locator('article[aria-label="Lyrics"]')).toContainText('naneun norae-hae');
    await page.getByRole('radio', { name: 'Learn' }).check({ force: true });
    await word(page, '노래해').click();
    const sheet = page.getByRole('dialog', { name: '노래해' });
    await expect(sheet).toContainText('Edited by you');
    await expect(sheet).toContainText('sing along');
    await sheet.getByRole('button', { name: 'Revert' }).click();
    await expect(page.locator('rt', { hasText: /^noraehae$/ })).toBeVisible();
    await expect(page.locator('rt', { hasText: 'norae-hae' })).toHaveCount(0);
    await expect(word(page, '노래해')).not.toHaveAttribute('data-corrected', 'true');
  });

  test('"Every line in this song" applies on other lines; "This line" does not', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Scope', lyrics: '사랑 하나\n사랑 둘\n사랑 셋' });
    await expect(page.locator('rt', { hasText: 'sarang' })).toHaveCount(3);
    let form = await openCorrect(page, '사랑');
    await form.getByLabel('Romanisation', { exact: true }).fill('SA-rang');
    await form.getByRole('button', { name: 'Save' }).click();
    // Default scope is this line: only the first line changed.
    await expect(page.locator('rt', { hasText: /^SA-rang$/ })).toHaveCount(1);
    await expect(page.locator('rt', { hasText: /^sarang$/ })).toHaveCount(2);

    await word(page, '사랑').nth(1).click();
    await page.getByRole('button', { name: 'Correct…' }).click();
    form = page.getByRole('dialog', { name: /^Correct / });
    await form.getByLabel('Romanisation', { exact: true }).fill('sa-RANG');
    await form.getByRole('radio', { name: 'Every line in this song' }).check({ force: true });
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('rt', { hasText: /^sa-RANG$/ })).toHaveCount(2);
    await expect(page.locator('rt', { hasText: /^SA-rang$/ })).toHaveCount(1); // the line-specific one wins
  });

  test('"Do not annotate" removes the annotation; split divides a word; corrections survive lyric edits and unmatched ones are reviewable', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Edits', lyrics: '사랑해 노래\n나는 가자' });
    await expect(page.locator('rt', { hasText: 'saranghae' })).toBeVisible();

    let form = await openCorrect(page, '노래');
    await form.getByLabel('Treat this word as').selectOption('none');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('rt', { hasText: /^norae$/ })).toHaveCount(0);

    form = await openCorrect(page, '사랑해');
    await form
      .getByRole('button', { name: '랑 뒤에서 나누기' })
      .or(form.getByRole('button', { name: 'Split after 랑' }))
      .click();
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('rt', { hasText: /^sarang$/ })).toBeVisible();
    await expect(page.locator('rt', { hasText: /^hae$/ })).toBeVisible();

    // Edit the lyrics: unchanged lines keep their corrections (J8.2) …
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit lyrics' });
    await dialog.getByLabel('Lyrics').fill('사랑해 노래\n새로운 줄');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('rt', { hasText: /^hae$/ })).toBeVisible();
    await expect(page.locator('rt', { hasText: /^norae$/ })).toHaveCount(0);

    // … and changing the first line leaves corrections without a word: reported, never dropped.
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
    await dialog.getByLabel('Lyrics').fill('전혀 다른 줄\n새로운 줄');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/2 corrections couldn't be applied/)).toBeVisible();
    await page.getByRole('button', { name: 'Review' }).click();
    const review = page.getByRole('dialog', { name: 'Unused corrections' });
    await expect(review).toContainText('사랑해');
    await review.getByRole('button', { name: 'Clean up unused corrections' }).click();
    await expect(page.getByText(/couldn't be applied/)).toHaveCount(0);
  });

  test('typed readings are validated per language', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Han', lyrics: '银行', language: 'Mandarin' });
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.locator('rt').first()).toBeVisible({ timeout: 30_000 });
    const form = await openCorrect(page, /银.*行/);
    const field = form.getByLabel('Pinyin', { exact: true });
    await field.fill('yin2');
    await expect(form).toContainText('Give 2 syllables, one per character.');
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    await field.fill('yin2 xing2');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('rt', { hasText: 'xíng' })).toBeVisible();
  });
});
