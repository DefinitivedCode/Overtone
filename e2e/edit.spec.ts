import { expect, test } from './fixtures';
import { KO, addSong, backupJson, importBackup, showClean } from './helpers';

test.describe('song screen: edit and delete', () => {
  test('menu offers Edit lyrics, Edit details and Delete (Reset only once something is learned)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Menu', lyrics: KO });
    await page.getByRole('button', { name: 'Song options' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([
      'Edit lyrics',
      'Edit details',
      'Delete song',
    ]);
  });

  test('Edit lyrics shows the change summary toast and keeps unchanged lines (J7.5)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Editable', lyrics: 'one\ntwo\nthree', language: 'Korean' });
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit lyrics' });
    const save = dialog.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled(); // nothing changed yet
    await dialog.getByLabel('Lyrics').fill('one\nTWO CHANGED\nthree\nfour');
    await save.click();
    await expect(page.getByRole('status')).toContainText(
      'Lyrics updated · 1 changed line reset to unlearned, 1 line added',
    );
    await showClean(page);
    await expect(page.locator('article[aria-label="Lyrics"] p')).toHaveText([
      'one',
      'TWO CHANGED',
      'three',
      'four',
    ]);
    await expect(page.getByText('4 lines')).toBeVisible();
  });

  test('cancelling edited lyrics asks before discarding, and reopening starts fresh', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Keep', lyrics: 'alpha\nbeta', language: 'Korean' });
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit lyrics' });
    await dialog.getByLabel('Lyrics').fill('changed');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    const confirm = page.getByRole('dialog', { name: 'Discard your changes?' });
    await confirm.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit lyrics' })).toBeHidden();
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Edit lyrics' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Edit lyrics' }).getByLabel('Lyrics'),
    ).toHaveValue('alpha\nbeta');
  });

  test('Edit details changes title, artist and language', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Old title', lyrics: KO });
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Edit details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit details' });
    await dialog.getByLabel('Title', { exact: true }).fill('New title');
    await dialog.getByLabel('Artist (optional)').fill('New artist');
    await dialog.getByLabel('Language', { exact: true }).selectOption({ label: 'Japanese' });
    await expect(dialog.getByText(/re-processes the song/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New title' })).toBeVisible();
    await expect(page.getByText('New artist')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Japanese' })).toBeVisible();
    await showClean(page);
    await expect(page.locator('article[aria-label="Lyrics"] p').first()).toHaveAttribute(
      'lang',
      'ja',
    );
  });

  test('Delete asks for confirmation, returns to the Library, and Undo restores the song (J9.2)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Bye', lyrics: KO });
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Delete song' }).click();
    await page
      .getByRole('dialog', { name: 'Delete this song?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('heading', { name: 'Your songbook is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('Bye');
  });

  test('Reset progress asks for confirmation (J7.6)', async ({ page }) => {
    await page.goto('/');
    const key = await page.evaluate(async () => {
      const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode('la la'));
      return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    });
    await importBackup(
      page,
      await backupJson([{ title: 'Learned', rawLyrics: 'la la\nother line', progressKeys: [key] }]),
    );
    await page.goto('/');
    await page.getByRole('link', { name: /Learned/ }).click();
    await page.getByRole('button', { name: 'Song options' }).click();
    await page.getByRole('menuitem', { name: 'Reset progress' }).click();
    const confirm = page.getByRole('dialog', { name: 'Reset progress?' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Song options' }).click();
    await expect(page.getByRole('menuitem', { name: 'Reset progress' })).toBeVisible(); // still learned
    await page.getByRole('menuitem', { name: 'Reset progress' }).click();
    await confirm.getByRole('button', { name: 'Reset progress' }).click();
    await expect(page.getByRole('status')).toContainText('Progress reset');
    await page.getByRole('button', { name: 'Song options' }).click();
    await expect(page.getByRole('menuitem', { name: 'Reset progress' })).toHaveCount(0);
  });

  test('opening a missing song shows a not-found state with a way back', async ({ page }) => {
    await page.goto('/song/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Song not found' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Library' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  });
});
