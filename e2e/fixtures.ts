import { expect, test as base } from '@playwright/test';

/** Fails any test that logs console.error or throws a page error (AUTONOMOUS_AGENT §5). */
export const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await run(page);
    expect(errors, 'console errors during test').toEqual([]);
  },
});
export { expect };
