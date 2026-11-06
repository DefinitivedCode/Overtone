import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectAxeClean, expectNoOverflow } from './helpers';

async function openAdd(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add song', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Song' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const ROMAJI = 'kimi wa utau\nitsumo soba ni iru yo\n[Chorus]\nshiawase ni naritai, I love you';

test.describe('romanised lyrics import (issue #4)', () => {
  test('offers a reviewable conversion and never replaces the paste silently', async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Title', { exact: true }).fill('Romaji song');
    await dialog.getByLabel('Lyrics').fill(ROMAJI);
    await expect(dialog.getByText(/These lyrics look romanised \(Japanese\)/)).toBeVisible();
    // Nothing has changed yet.
    await expect(dialog.getByLabel('Lyrics')).toHaveValue(ROMAJI);

    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Convert Lyrics' });
    await expect(review).toBeVisible();
    await expect(review.getByText(/converted to kana only/)).toBeVisible();
    await expectNoOverflow(page, 'romanised review');
    await expectAxeClean(page, 'romanised review');

    // The particle is ambiguous: は → わ is one tap away.
    const particle = review.getByRole('button', { name: /^wa: は/ });
    await particle.click();
    await expect(review.getByRole('button', { name: /^wa: わ/ })).toBeVisible();

    // Hand-editing a line works and the pasted source stays visible.
    await review.getByRole('button', { name: 'Edit line' }).first().click();
    await review.getByLabel('Edit line 1').fill('君は歌う');
    await review.getByRole('button', { name: 'Use these lyrics' }).click();

    await expect(dialog.getByLabel('Lyrics')).toHaveValue(
      /^君は歌う\nいつも そば に いる よ\n\[Chorus\]\nしあわせ に なりたい, I love you$/,
    );
    await expect(dialog.getByText(/Converted from the romanisation you pasted/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Restore pasted text' }).click();
    await expect(dialog.getByLabel('Lyrics')).toHaveValue(ROMAJI);
  });

  test('Keep pasted text leaves the lyrics exactly as pasted', async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Lyrics').fill('saranghae neoreul\nbogo sipeo jeongmal');
    await expect(dialog.getByText(/These lyrics look romanised \(Korean\)/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Convert Lyrics' });
    await expect(review.getByText('사랑해').first()).toBeVisible();
    await review.getByRole('button', { name: 'Keep pasted text' }).click();
    await expect(dialog.getByLabel('Lyrics')).toHaveValue('saranghae neoreul\nbogo sipeo jeongmal');
  });

  test('plain English lyrics are not treated as romanisation', async ({ page }) => {
    const dialog = await openAdd(page);
    await dialog.getByLabel('Lyrics').fill("I'm walking down the road tonight\nunder the stars");
    await expect(dialog.getByText('Couldn’t detect a language — choose one.')).toBeVisible();
    await expect(dialog.getByText(/look romanised/)).toHaveCount(0);
  });
});
