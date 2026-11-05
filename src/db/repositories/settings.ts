import { guard } from '../errors';
import { getDb } from '../schema';
import type { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  theme: 'system',
  textSize: 2,
  romanisation: {
    ja: { longVowels: 'macron', showRomajiLine: true, furiganaForKanaWords: false },
    ko: { mode: 'pronunciation' },
    zh: { tones: 'marks', sandhi: false },
  },
  library: { query: '', filter: 'all', sort: 'opened' },
  backup: {
    lastExportAt: null,
    changesSinceExport: 0,
    songsSinceExport: 0,
    reminderDismissedAt: null,
  },
  storage: { persistRequested: false, persisted: null },
};

/** Fills fields missing from an older/partial stored record with defaults (one level deep). */
export function withDefaults(stored: Partial<Settings> | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  const s = stored ?? {};
  return {
    ...d,
    ...s,
    id: 'app',
    romanisation: {
      ja: { ...d.romanisation.ja, ...s.romanisation?.ja },
      ko: { ...d.romanisation.ko, ...s.romanisation?.ko },
      zh: { ...d.romanisation.zh, ...s.romanisation?.zh },
    },
    library: { ...d.library, ...s.library },
    backup: { ...d.backup, ...s.backup },
    storage: { ...d.storage, ...s.storage },
  };
}

export function getSettings(): Promise<Settings> {
  return guard(async () => withDefaults(await getDb().settings.get('app')));
}

/** Read-modify-write in one transaction. */
export function updateSettings(updater: (current: Settings) => Settings): Promise<Settings> {
  return guard(() => {
    const db = getDb();
    return db.transaction('rw', db.settings, async () => {
      const next = updater(withDefaults(await db.settings.get('app')));
      await db.settings.put({ ...next, id: 'app' });
      return next;
    });
  });
}
