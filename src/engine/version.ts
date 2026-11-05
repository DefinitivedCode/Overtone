/**
 * Bump the relevant number whenever an analyser's output changes: stale cache entries are then
 * ignored (ARCHITECTURE §4.3). Pack versions join the cache key once packs exist (M7+).
 */
export const ENGINE_VERSION = { ko: 1, ja: 2, zh: 1, yue: 1, segment: 1 } as const;

/** Reserved for settings that change analysis itself (none in v0.1; romanisation prefs are render-time). */
export const SETTINGS_HASH = '0';
