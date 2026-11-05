import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { installPack, PackInstallError } from '@/engine/dict/install';
import { evictPackFiles } from '@/engine/dict/resources';
import type { InstallProgress } from '@/engine/dict/install';
import { listInstalled, removePack } from '@/engine/dict/lookup';
import type { InstalledPack } from '@/engine/dict/db';
import type { PackInfo, PackManifest } from '@/engine/dict/types';
import type { LangCode } from '@/db/types';

/** Korean pronunciation runs without a pack. */
export const PACK_FOR_LANG: Partial<Record<LangCode, string>> = {
  ja: 'ja-core',
  zh: 'zh-core',
  yue: 'yue-core',
};

const base = () => import.meta.env.BASE_URL + 'packs/';

let manifest: Promise<PackManifest> | undefined;
export function fetchManifest(): Promise<PackManifest> {
  // The small manifest request may outlive a fast navigation out of a song or Settings.
  return (manifest ??= fetch(base() + 'manifest.json', { cache: 'no-cache', keepalive: true })
    .then(async (res) => {
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      return (await res.json()) as PackManifest;
    })
    .finally(() => {
      manifest = undefined;
    }));
}

/** A controlled document uses the persistent Cache Storage namespace in WebKit. */
async function controlForTokenizer(signal: AbortSignal): Promise<void> {
  if (!import.meta.env.PROD || !navigator.serviceWorker || navigator.serviceWorker.controller)
    return;
  const sw = navigator.serviceWorker;
  let changed: (() => void) | undefined;
  let abort: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      changed = () => {
        if (sw.controller) resolve();
      };
      abort = () => reject(new PackInstallError('aborted', 'Download cancelled'));
      sw.addEventListener('controllerchange', changed);
      signal.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(
        () =>
          reject(
            new PackInstallError(
              'storage',
              'Could not prepare offline storage. Reload and try again.',
            ),
          ),
        20_000,
      );
      void sw.ready.then((registration) => {
        if (signal.aborted) return;
        if (sw.controller) resolve();
        else registration.active?.postMessage('claim-for-pack-install');
      }, reject);
    });
  } finally {
    clearTimeout(timeout);
    if (changed) sw.removeEventListener('controllerchange', changed);
    if (abort) signal.removeEventListener('abort', abort);
  }
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
    if (info.files.some((file) => file.role === 'tokenizer')) await controlForTokenizer(ctl.signal);
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
