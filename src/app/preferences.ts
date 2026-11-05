import { useSyncExternalStore } from 'react';

/**
 * Appearance preferences. localStorage is the *pre-paint mirror* read by the inline script in
 * index.html (no flash). From M2 the Settings record in IndexedDB is the source of truth and
 * is mirrored here on every change.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type TextSize = 0 | 1 | 2 | 3 | 4;

const THEME_KEY = 'overtone:theme';
const SIZE_KEY = 'overtone:textSize';

export const TEXT_SIZE_LABELS = ['Smallest', 'Small', 'Default', 'Large', 'Largest'] as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); the preference then lasts for this session only.
  }
}

let theme: ThemePref = ((v) => (v === 'light' || v === 'dark' ? v : 'system'))(read(THEME_KEY));
export function parseTextSize(v: string | null): TextSize {
  if (v === null || v === '') return 2;
  const n = Number(v);
  return n === 0 || n === 1 || n === 3 || n === 4 ? n : 2;
}

let textSize: TextSize = parseTextSize(read(SIZE_KEY));

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getTheme(): ThemePref {
  return theme;
}
export function setTheme(next: ThemePref): void {
  theme = next;
  write(THEME_KEY, next);
  emit();
}
export function getTextSize(): TextSize {
  return textSize;
}
export function setTextSize(next: TextSize): void {
  textSize = next;
  write(SIZE_KEY, String(next));
  emit();
}

export const useTheme = () => useSyncExternalStore(subscribe, getTheme);
export const useTextSize = () => useSyncExternalStore(subscribe, getTextSize);
export const subscribePreferences = subscribe;
