import { expect, test } from './fixtures';

test('app boots and shows the product name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Overtone' })).toBeVisible();
});
