import { useEffect, useState } from 'react';

/**
 * Large-title collapse (DESIGN_SYSTEM §7): true once the screen's large heading has scrolled under the top bar, so the
 * bar can show a compact title. An IntersectionObserver toggle (no scroll listener); without it the title stays large.
 */
export function useCollapsedTitle<T extends HTMLElement>() {
  // A callback ref: the heading may mount later than the screen (e.g. after a song has loaded).
  const [el, setEl] = useState<T | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setCollapsed(entry ? !entry.isIntersecting && entry.boundingClientRect.top < 0 : false),
      // The sticky bar is about 52 px plus the safe area; the heading counts as hidden once it passes under it.
      { rootMargin: '-60px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref: setEl, collapsed };
}
