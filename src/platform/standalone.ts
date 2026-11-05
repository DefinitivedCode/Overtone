/** True when running as an installed Home Screen / standalone app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/** True for iOS / iPadOS Safari-family browsers (iPadOS reports as MacIntel with touch). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Exposes standalone mode to CSS as `data-standalone` on <html>. */
export function markStandalone(): void {
  if (isStandalone()) document.documentElement.dataset['standalone'] = 'true';
}
