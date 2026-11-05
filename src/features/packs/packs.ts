import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { evictPackFiles, installPack, PackInstallError } from '@/engine/dict/install';
import type { InstallProgress } from '@/engine/dict/install';
import { listInstalled, removePack } from '@/engine/dict/lookup';
import type { InstalledPack } from '@/engine/dict/db';
import type { PackInfo, PackManifest } from '@/engine/dict/types';
import type { LangCode } from '@/db/types';

/** Which pack serves which language (Japanese and Korean packs arrive in M8/M9). */
export const PACK_FOR_LANG: Partial<Record<LangCode, string>> = { zh: 'zh-core', yue: 'yue-core' };

const base = () => import.meta.env.BASE_URL + 'packs/';

export async function fetchManifest(signal?: AbortSignal): Promise<PackManifest> {
  const res = await fetch(base() + 'manifest.json', { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
  return (await res.json()) as PackManifest;
}

/** Installed packs, live (so UI and analysis react to installs/removals). */
export const useInstalledPacks = (): InstalledPack[] | undefined =>
  useLiveQuery(() => listInstalled().catch(() => []), []);

export interface InstallState {
  id: string;
  progress: InstallProgress | null;
  error: string | null;
}

let states: ReadonlyMap<string, InstallState> = new Map();
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();
const set = (id: string, s: InstallState | null) => {
  const next = new Map(states);
  if (s) next.set(id, s);
  else next.delete(id);
  states = next;
  listeners.forEach((l) => l());
};

export const useInstallStates = (): ReadonlyMap<string, InstallState> =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => states,
  );

/** Starts (or restarts) a pack install; progress and errors are published through `useInstallStates`. */
export async function startInstall(info: PackInfo): Promise<boolean> {
  if (controllers.has(info.id)) return false;
  const ctl = new AbortController();
  controllers.set(info.id, ctl);
  set(info.id, {
    id: info.id,
    progress: { phase: 'download', loaded: 0, total: info.bytes },
    error: null,
  });
  try {
    await installPack(info, {
      signal: ctl.signal,
      onProgress: (progress) => set(info.id, { id: info.id, progress, error: null }),
    });
    set(info.id, null);
    return true;
  } catch (e) {
    const aborted = e instanceof PackInstallError && e.kind === 'aborted';
    set(
      info.id,
      aborted
        ? null
        : {
            id: info.id,
            progress: null,
            error: e instanceof Error ? e.message : 'The download failed.',
          },
    );
    return false;
  } finally {
    controllers.delete(info.id);
  }
}

export const cancelInstall = (id: string) => controllers.get(id)?.abort();

export async function uninstall(id: string): Promise<void> {
  cancelInstall(id);
  const pack = await removePack(id);
  if (pack?.files) await evictPackFiles(pack.files.map((file) => base() + file));
}
