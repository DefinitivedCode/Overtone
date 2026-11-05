import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { JA, KO, addSong } from './helpers';

const learnList = (page: Page) => page.getByRole('list', { name: 'Lyrics' });

test.describe('Korean song: Learn, Karaoke, Clean', () => {
  test('Learn shows romanisation above each eojeol, aria-hidden, with sections, blanks and English as written', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Korean', lyrics: `${KO}\nbaby 愛 사랑` });
    const list = learnList(page);
    await expect(list.locator('ruby').first()).toBeVisible();
    // romanisation arrives progressively; wait for it
    await expect(list.locator('rt', { hasText: 'saranghae' }).first()).toBeVisible();
    await expect(list.locator('rt[aria-hidden="true"]', { hasText: 'naneun' })).toHaveCount(1);
    await expect(list.locator('rt', { hasText: 'noraehae' })).toHaveCount(1);
    await expect(list.getByText('[Chorus]')).toBeVisible();
    // English is shown as written, with no annotation; Hanja gets an unobtrusive "?" marker.
    await expect(
      list.locator('p', { hasText: 'baby' }).locator('rt', { hasText: 'baby' }),
    ).toHaveCount(0);
    await expect(list.locator('rt', { hasText: '?' })).toHaveCount(1);
    // sections have no check button; lyric lines do
    await expect(list.getByRole('button', { name: /Mark line \d+ as learned/ })).toHaveCount(5);
  });

  test('Karaoke shows romanised lines only, large, with zero interactive elements (J5)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Sing', lyrics: KO });
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    const group = page.getByRole('group', { name: 'Romanised lyrics' });
    await expect(group.getByText('saranghae yo', { exact: true }).first()).toBeVisible();
    await expect(group.getByText('naneun noraehae', { exact: true })).toBeVisible();
    await expect(group.getByText('[Chorus]')).toBeVisible();
    await expect(group.locator('button, a[href], input, select, textarea, [tabindex]')).toHaveCount(
      0,
    );
    const size = await group
      .locator('p')
      .nth(1)
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(28);
  });

  test('Karaoke never leaves a token blank: unreadable segments fall back to the original (J5.4)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Fallback', lyrics: '사랑해 愛してる' });
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      'saranghae 愛してる',
    );
  });

  test('Clean toggles Original ⇄ Romanised, is selectable, has no interactions, and remembers per song (J6)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Clean one', lyrics: KO });
    await page.getByRole('radio', { name: 'Clean' }).check({ force: true });
    const article = page.locator('article[aria-label="Lyrics"]');
    await expect(article.getByText('나는 노래해')).toBeVisible();
    await expect(article.locator('button, a, ruby, rt')).toHaveCount(0);
    expect(await article.evaluate((el) => getComputedStyle(el).userSelect)).toBe('text');

    await page.getByRole('radio', { name: 'Romanised' }).check({ force: true });
    await expect(article.getByText('naneun noraehae')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Clean' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Romanised' })).toBeChecked();
    await expect(
      page.locator('article[aria-label="Lyrics"]').getByText('naneun noraehae'),
    ).toBeVisible();
  });

  test('mode is remembered per song', async ({ page }) => {
    await page.goto('/');
    await addSong(page, { title: 'Song A', lyrics: KO });
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await page.getByRole('link', { name: /Library/ }).click(); // client-side, like a real user: the write completes
    await addSong(page, { title: 'Song B', lyrics: '사랑해' });
    await expect(page.getByRole('radio', { name: 'Learn' })).toBeChecked();
    await page.reload(); // proves it is stored, not just in memory
    await page.getByRole('link', { name: /Library/ }).click();
    await page.getByRole('link', { name: /Song A/ }).click();
    await expect(page.getByRole('radio', { name: 'Karaoke' })).toBeChecked();
  });

  test('the Korean romanisation setting applies in every mode without reprocessing (J13.3)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Mode test', lyrics: '좋아 꽃이' });
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    const group = page.getByRole('group', { name: 'Romanised lyrics' });
    await expect(group).toContainText('joa kkochi');
    await page.getByRole('link', { name: /Library/ }).click();
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'Letter by letter' }).check({ force: true });
    await page.getByRole('link', { name: /Library/ }).click();
    await page.getByRole('link', { name: /Mode test/ }).click();
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText('joha kkoch');
  });

  test('the lyric text size setting scales every mode (J13.2)', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('slider', { name: 'Lyric text size' }).fill('4');
    await page.getByRole('link', { name: /Library/ }).click();
    await addSong(page, { title: 'Big', lyrics: '사랑해' });
    const px = (sel: string) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await expect(page.locator('rt').first()).toBeVisible();
    expect(
      await page
        .getByRole('list', { name: 'Lyrics' })
        .locator('p')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeCloseTo(22 * 1.25, 0);
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    expect(
      await page
        .getByRole('group', { name: 'Romanised lyrics' })
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeCloseTo(30 * 1.25, 0);
    await page.getByRole('radio', { name: 'Clean' }).check({ force: true });
    expect(await px('article[aria-label="Lyrics"]')).toBeCloseTo(19 * 1.25, 0);
  });

  test('romanised text makes Korean songs searchable (saranghae finds 사랑해) (J10.1)', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Findable', lyrics: '사랑해' });
    await expect(page.locator('rt', { hasText: 'saranghae' })).toBeVisible();
    await page.waitForTimeout(500); // searchable text is written once analysis completes
    await page.goto('/');
    await page.getByRole('searchbox').fill('saranghae');
    await expect(page.getByRole('list', { name: 'Songs' })).toContainText('Findable');
  });

  test('a Japanese song shows its original text with an honest note until Japanese data exists', async ({
    page,
  }) => {
    await page.goto('/');
    await addSong(page, { title: 'Nihongo', lyrics: JA });
    await expect(page.getByText(/Pronunciation for Japanese isn.t available yet/)).toBeVisible();
    await expect(learnList(page)).toContainText('君の名前を呼んでいた');
    await expect(learnList(page).locator('rt')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    await expect(page.getByRole('group', { name: 'Romanised lyrics' })).toContainText(
      '君の名前を呼んでいた',
    );
  });

  test('switching mode keeps your place in a long song', async ({ page }) => {
    await page.goto('/');
    const long = Array.from({ length: 60 }, (_, i) => `사랑해 ${i}번째`).join('\n');
    await addSong(page, { title: 'Long', lyrics: long });
    const line = learnList(page).locator('li[data-line-index="40"]');
    await line.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -20));
    await page.getByRole('radio', { name: 'Karaoke' }).check({ force: true });
    const target = page
      .getByRole('group', { name: 'Romanised lyrics' })
      .locator('[data-line-index="40"], [data-line-index="39"], [data-line-index="41"]')
      .first();
    await expect(target).toBeInViewport();
  });
});
