import type { Page } from '@playwright/test';
import { expect, test as base } from '@playwright/test';

/**
 * WebKit reports a module-worker script fetch that is aborted by a navigation as an "access control
 * checks" error (as a page error and/or console error). It only occurs when a test leaves the page
 * while the engine worker is still loading; the engine client falls back to the main thread and
 * nothing is lost. Every other error still fails the test.
 */
const BENIGN = /assets\/worker-[\w-]+\.js due to access control checks/;

export type PageWithAllow = Page & {
  /** Declares that a console error matching `pattern` is expected in this test (e.g. a deliberately failed request). */
  allowConsoleError: (pattern: RegExp) => void;
};

/** Fails any test that logs console.error or throws a page error (AUTONOMOUS_AGENT §5). */
export const test = base.extend({
  page: async ({ page }, run, testInfo) => {
    // The iPhone "Add to Home Screen" tip shifts the Library layout; only its own test wants to see it.
    if (!testInfo.title.includes('Add to Home Screen'))
      await page.addInitScript(() => {
        try {
          localStorage.setItem('overtone:installTipDismissed', '1');
        } catch {
          // storage unavailable: the tip simply shows
        }
      });
    const errors: string[] = [];
    const allowed: RegExp[] = [];
    const ok = (s: string) => BENIGN.test(s) || allowed.some((re) => re.test(s));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ok(msg.text())) errors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      if (!ok(err.message)) errors.push(err.message);
    });
    (page as PageWithAllow).allowConsoleError = (re) => void allowed.push(re);
    await run(page);
    expect(errors, 'console errors during test').toEqual([]);
  },
});
export { expect };
