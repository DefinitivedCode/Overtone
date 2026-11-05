import { expect, test } from './fixtures';
import { JA, KO, addSong, backupJson, importBackup } from './helpers';

test.describe('library', () => {
  test('empty state → add a song → it appears with chip and line count (J1, J2)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Add a song' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Song' });
    await dialog.getByLabel('Title', { exact: true }).fill('First song');
    await dialog.getByLabel('Artist (optional)').fill('Me');
    await dialog.getByLabel('Lyrics').fill(KO);
    await expect(dialog.getByText('Looks like Korean')).toBeVisible();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'First song' })).toBeVisible();

    await page.getByRole('link', { name: /Library/ }).click();
    const row = page.getByRole('list', { name: 'Songs' }).getByRole('listitem').first();
    await expect(row).toContainText('First song');
    await expect(row).toContainText('Me · 4 lines');
    await expect(row.getByRole('img', { name: 'Korean' })).toHaveText('KO');
  });

  test('Add song is reachable by keyboard (J1.2)', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'Safari tabs only to form controls by default; WebKit Tab order differs',
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Add a song' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'New Song' })).toBeVisible();
  });

  test('search is case-, diacritic- and script-aware; filters, sort and state persist', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Café Nights', artist: 'Zed', lyrics: KO });
    await page.goto('/');
    await addSong(page, { title: 'Alpha', artist: 'Amy', lyrics: JA });
    await page.goto('/');

    const search = page.getByRole('searchbox', { name: 'Search songs, artists, lyrics' });
    const rows = page.getByRole('list', { name: 'Songs' }).getByRole('listitem');
    const expectRows = async (expected: string[]) => {
      await expect(rows).toHaveCount(expected.length);
      for (const [i, title] of expected.entries()) await expect(rows.nth(i)).toContainText(title);
    };
    await search.fill('cafe');
    await expectRows(['Café Nights']);
    await search.fill('空を');
    await expectRows(['Alpha']);
    await search.fill('사랑해');
    await expectRows(['Café Nights']);
    await search.fill('amy alpha');
    await expectRows(['Alpha']);

    await search.fill('');
    await expect(page.getByRole('button', { name: 'Japanese, 1 songs' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Mandarin, 0 songs' })).toBeDisabled();
    await page.getByRole('button', { name: 'Japanese, 1 songs' }).click();
    await expectRows(['Alpha']);

    await page.getByRole('button', { name: 'All 2' }).click();
    await page.getByRole('button', { name: /^Sort:/ }).click();
    await page.getByRole('menuitemradio', { name: 'Title A–Z' }).click();
    await expectRows(['Alpha', 'Café Nights']);

    await search.fill('night');
    await page.getByRole('button', { name: 'Korean, 1 songs' }).click();
    await page.waitForTimeout(500); // let the debounced query persist
    await page.reload();
    await expect(search).toHaveValue('night');
    await expect(page.getByRole('button', { name: /^Sort: Title A–Z/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Korean, 1 songs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectRows(['Café Nights']);
  });

  test('no results shows a message and Clear restores the list (J10.5)', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Only', lyrics: KO });
    await page.goto('/');
    await page.getByRole('searchbox').fill('zzzz');
    await expect(page.getByRole('heading', { name: 'No songs match' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Songs' })).toBeVisible();
  });

  test('row menu: delete asks for confirmation and offers Undo (J9.2, J9.3)', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Doomed', lyrics: KO });
    await page.goto('/');
    await page.getByRole('button', { name: 'More options for Doomed' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete this song?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Doomed').first()).toBeVisible();

    await page.getByRole('button', { name: 'More options for Doomed' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog', { name: 'Delete this song?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('Doomed');
  });

  test('a deleted song is permanently removed after the Undo window', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await addSong(page, { title: 'Gone for good', lyrics: KO });
    await page.goto('/');
    await page.getByRole('button', { name: 'More options for Gone for good' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.mouse.move(0, 0); // Toasts pause while the pointer is over them.
    await page.clock.fastForward(9_000);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
  });

  test('long-press (or right-click) on a row opens its menu instead of the song', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Press me', lyrics: KO });
    await page.goto('/');
    const row = page.getByRole('link', { name: /Press me/ });
    await row.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Edit details' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('edit details from the row menu', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Before', lyrics: KO });
    await page.goto('/');
    await page.getByRole('button', { name: 'More options for Before' }).click();
    await page.getByRole('menuitem', { name: 'Edit details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit details' });
    await dialog.getByLabel('Title', { exact: true }).fill('After');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('After');
  });

  test('Library rows from an import show progress and a Learned badge (J7.7)', async ({ page }) => {
    await page.goto('/');
    const key = await page.evaluate(async () => {
      const bytes = new TextEncoder().encode('la la');
      const d = await crypto.subtle.digest('SHA-1', bytes);
      return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    });
    await importBackup(
      page,
      await backupJson([{ title: 'Done', rawLyrics: 'la la', progressKeys: [key] }]),
    );
    await page.goto('/');
    const row = page.getByRole('listitem').filter({ hasText: 'Done' });
    await expect(row).toContainText('Learned');
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
