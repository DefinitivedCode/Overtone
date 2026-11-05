import { guard } from '../errors';
import { getDb } from '../schema';
import type { LibraryMarker } from '../types';

const MARKER_KEY = 'libraryMarker';
const LS_KEY = 'overtone:libraryMarker';

function readMirror(): LibraryMarker | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as LibraryMarker) : null;
  } catch {
    return null;
  }
}

function writeMirror(marker: LibraryMarker): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(marker));
  } catch {
    // The IndexedDB copy still exists; the mirror is best-effort.
  }
}

export async function countLiveSongs(): Promise<number> {
  return getDb()
    .songs.filter((s) => s.deletedAt === null)
    .count();
}

/**
 * Records how many songs exist, in IndexedDB AND a localStorage mirror (ARCHITECTURE §10.2).
 * `lastCount` is kept current on every change so deliberately emptying the library (count 0)
 * is not mistaken for data loss.
 */
export function syncLibraryMarker(now = Date.now()): Promise<LibraryMarker> {
  return guard(async () => {
    const count = await countLiveSongs();
    const previous = (await getDb().meta.get(MARKER_KEY))?.value as LibraryMarker | undefined;
    const marker: LibraryMarker = {
      everHadSongs: count > 0 || previous?.everHadSongs === true,
      lastCount: count,
      lastSeenAt: now,
    };
    await getDb().meta.put({ key: MARKER_KEY, value: marker });
    writeMirror(marker);
    return marker;
  });
}

export interface RecoveryState {
  needsRecovery: boolean;
  /** Which marker(s) indicated a previous library. */
  evidence: ('indexeddb' | 'localstorage')[];
}

/** Empty database + a marker saying songs existed ⇒ storage was probably cleared (J12.5). */
export function checkRecovery(): Promise<RecoveryState> {
  return guard(async () => {
    if ((await countLiveSongs()) > 0) return { needsRecovery: false, evidence: [] };
    const idb = (await getDb().meta.get(MARKER_KEY))?.value as LibraryMarker | undefined;
    const ls = readMirror();
    const evidence: RecoveryState['evidence'] = [];
    if ((idb?.lastCount ?? 0) > 0) evidence.push('indexeddb');
    if ((ls?.lastCount ?? 0) > 0) evidence.push('localstorage');
    return { needsRecovery: evidence.length > 0, evidence };
  });
}

/** After the user dismisses the recovery screen without importing, forget the stale marker. */
export function clearLibraryMarker(): Promise<void> {
  return guard(async () => {
    await getDb().meta.delete(MARKER_KEY);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
  });
}
