import { useEffect } from 'react';
import { getTextSize, getTheme, subscribePreferences, useTextSize, useTheme } from './preferences';
import type { ThemePref } from './preferences';

export const THEME_COLORS = { light: '#F6F2EC', dark: '#121014' } as const;

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/** Applies data-theme, data-text-size and the theme-color metas to <html>. */
export function applyAppearance(systemDark: boolean): void {
  const root = document.documentElement;
  const theme = resolveTheme(getTheme(), systemDark);
  root.dataset['theme'] = theme;
  root.dataset['textSize'] = String(getTextSize());
  const pref = getTheme();
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = meta.dataset['media'] ?? meta.getAttribute('media') ?? '';
    if (!meta.dataset['media']) meta.dataset['media'] = media;
    if (pref === 'system') {
      meta.setAttribute('media', media);
      meta.content = media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light;
    } else {
      // Forced theme: every meta matches and carries the forced colour.
      meta.setAttribute('media', 'all');
      meta.content = THEME_COLORS[theme];
    }
  }
}

/** Keeps <html> in sync with the preference and the system appearance. */
export function useAppearance(): void {
  const theme = useTheme();
  const size = useTextSize();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyAppearance(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    const unsub = subscribePreferences(apply);
    return () => {
      mq.removeEventListener('change', apply);
      unsub();
    };
  }, [theme, size]);
}
