import { expect, test } from './fixtures';
import { KO, addSong } from './helpers';

test.describe('progress (J7)', () => {
  test('toggling a line persists, updates the header and library, and survives reload and mode changes', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, {
      title: 'Track me',
      lyrics: 'one line\ntwo line\nthree line',
      language: 'Korean',
    });
    await expect(page.getByText('0 of 3 lines')).toBeVisible();
    const check = (n: number) => page.getByRole('button', { name: `Mark line ${n} as learned` });
    await check(2).click();
    await expect(check(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 of 3 lines')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: '1 of 3 lines learned' })).toBeVisible();

    await page.reload();
    await expect(check(2)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await page.getByRole('radio', { name: 'Learn' }).check({ force: true });
    await expect(check(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(check(1)).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('link', { name: /Library/ }).click();
    const row = page.getByRole('listitem').filter({ hasText: 'Track me' });
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  });

  test('repeated lines share one learned state and count per occurrence (J7.3)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Chorus', lyrics: KO });
    // KO has 4 lyric lines; "사랑해 요" appears twice.
    await expect(page.getByText('0 of 4 lines')).toBeVisible();
    const first = page.getByRole('button', { name: 'Mark line 1 as learned' });
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Mark line 4 as learned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('2 of 4 lines')).toBeVisible();
    await first.click(); // unmark one → both unmarked
    await expect(page.getByRole('button', { name: 'Mark line 4 as learned' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByText('0 of 4 lines')).toBeVisible();
  });

  test('learned lines are marked by more than colour, and sections are not learnable (J4.4)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Marks', lyrics: KO });
    const first = page.getByRole('button', { name: 'Mark line 1 as learned' });
    await first.click();
    await expect(first.locator('svg')).toBeVisible(); // a check icon, not just a colour change
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Mark line \d+ as learned/ })).toHaveCount(4);
  });

  test('100 % shows a Learned badge in the header and the Library (J7.7)', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'All done', lyrics: 'a line\nb line', language: 'Korean' });
    await page.getByRole('button', { name: 'Mark line 1 as learned' }).click();
    await page.getByRole('button', { name: 'Mark line 2 as learned' }).click();
    await expect(page.getByText('Learned ✓')).toBeVisible();
    await page.getByRole('link', { name: /Library/ }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'All done' })).toContainText(
      'Learned',
    );
  });

  test('Reset progress asks for confirmation then clears everything (J7.6)', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Reset me', lyrics: 'a line\nb line', language: 'Korean' });
    await page.getByRole('button', { name: 'Mark line 1 as learned' }).click();
    await expect(page.getByText('1 of 2 lines')).toBeVisible();
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Reset progress' }).click();
    const confirm = page.getByRole('dialog', { name: 'Reset progress?' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('1 of 2 lines')).toBeVisible();
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Reset progress' }).click();
    await confirm.getByRole('button', { name: 'Reset progress' }).click();
    await expect(page.getByText('0 of 2 lines')).toBeVisible();
  });

  test('editing lyrics keeps learned lines whose text is unchanged (J7.5)', async ({ page }) => {
    await page.goto('/');
    await addSong(page, {
      title: 'Edit keeps',
      lyrics: 'keep this\nchange this',
      language: 'Korean',
    });
    await page.getByRole('button', { name: 'Mark line 1 as learned' }).click();
    await page.getByRole('button', { name: 'Mark line 2 as learned' }).click();
    await expect(page.getByText('2 of 2 lines')).toBeVisible();
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit lyrics' });
    await dialog.getByLabel('Lyrics').fill('keep this\nchanged!');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: '1 changed line reset to unlearned' }),
    ).toBeVisible();
    await expect(page.getByText('1 of 2 lines')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark line 1 as learned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Mark line 2 as learned' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
