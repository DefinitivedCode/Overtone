import { expect, test } from './fixtures';

test('app boots to the Library', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
});
