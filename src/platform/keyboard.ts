/**
 * iOS shrinks the visual viewport (not the layout viewport) when the keyboard opens.
 * Publishes the covered height as `--keyboard-inset` (DESIGN_SYSTEM §9.5).
 * Returns a cleanup function.
 */
export function trackKeyboardInset(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    document.documentElement.style.removeProperty('--keyboard-inset');
  };
}

/** After the keyboard animation settles, keep the focused field visible. */
export function scrollFocusedIntoView(el: Element): void {
  requestAnimationFrame(() => requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' })));
}
