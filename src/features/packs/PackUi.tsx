import { useEffect, useState } from 'react';
import type { LangCode } from '@/db/types';
import type { PackInfo, PackManifest } from '@/engine/dict/types';
import { LANG_NAME } from '@/features/language';
import { formatBytes } from '@/features/settings/format';
import { isLowOnSpace } from '@/platform/storage';
import { Banner, Button, ConfirmDialog, ProgressBar, useToast } from '@/ui';
import {
  PACK_FOR_LANG,
  cancelInstall,
  fetchManifest,
  startInstall,
  uninstall,
  useInstallStates,
  useInstalledPacks,
} from './packs';
import s from './PackUi.module.css';

type ManifestState =
  { status: 'loading' } | { status: 'ready'; manifest: PackManifest } | { status: 'error' };

/** Loads packs/manifest.json (cached by the service worker once seen). */
export function useManifest(enabled = true): ManifestState {
  const [state, setState] = useState<ManifestState>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchManifest().then(
      (manifest) => active && setState({ status: 'ready', manifest }),
      () => active && setState({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}

const useOnline = () => {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
};

function Progress({ id }: { id: string }) {
  const st = useInstallStates().get(id);
  const p = st?.progress;
  if (!p) return null;
  const label =
    p.phase === 'download'
      ? `Downloading ${formatBytes(p.loaded)} of ${formatBytes(p.total)}`
      : `Installing ${p.loaded.toLocaleString('en')} of ${p.total.toLocaleString('en')} entries`;
  return (
    <div className={s['progress']}>
      <ProgressBar value={p.total ? p.loaded / p.total : 0} label={label} />
      <span className={s['sub']}>{label}</span>
      <Button variant="plain" onClick={() => cancelInstall(id)}>
        Cancel
      </Button>
    </div>
  );
}

/** Download button with the low-space warning (ARCHITECTURE §5.2). */
function DownloadButton({
  info,
  label,
  online,
}: {
  info: PackInfo;
  label?: string;
  online: boolean;
}) {
  const [low, setLow] = useState(false);
  const err = useInstallStates().get(info.id)?.error;
  const space = Math.max(info.bytes * 3, (info.unpackedBytes ?? 0) + info.bytes);
  const go = () => void startInstall(info);
  return (
    <div className={s['stack']}>
      {err ? <Banner tone="error">{err}</Banner> : null}
      {low ? (
        <Banner tone="warning">
          Your device is low on storage. Language data needs about {formatBytes(space)} of free
          space while installing.
        </Banner>
      ) : null}
      <Button
        variant={low ? 'secondary' : 'primary'}
        disabled={!online}
        onClick={() => {
          if (low) return go();
          void isLowOnSpace(space, 1).then((isLow) => (isLow ? setLow(true) : go()));
        }}
      >
        {!online
          ? 'Connect to download'
          : low
            ? 'Download anyway'
            : err
              ? 'Try again'
              : (label ?? `Download · ${formatBytes(info.bytes)}`)}
      </Button>
    </div>
  );
}

/** Settings → Offline language data (J12.2). */
export function PackSettingsRows() {
  const m = useManifest();
  const installed = useInstalledPacks();
  const states = useInstallStates();
  const toast = useToast();
  const online = useOnline();
  const [removing, setRemoving] = useState<string | null>(null);
  if (installed === undefined || (m.status === 'loading' && installed.length === 0))
    return <p className={s['sub']}>Checking…</p>;
  const available = m.status === 'ready' ? m.manifest.packs : [];
  const ids = [...new Set([...available, ...installed].map((pack) => pack.id))];
  return (
    <>
      {m.status === 'error' ? (
        <Banner tone="warning">
          Connect to the internet and reopen Settings to check for new language data.
        </Banner>
      ) : null}
      <ul className={s['list']}>
        {ids.map((id) => {
          const have = installed.find((pack) => pack.id === id);
          const info = available.find((pack) => pack.id === id);
          const pack = have ?? info;
          if (!pack) return null;
          const busy = states.get(id)?.progress;
          return (
            <li key={id} className={s['row']}>
              <div className={s['head']}>
                <strong>{LANG_NAME[pack.lang]}</strong>
                <span className={s['sub']}>
                  {have
                    ? `Downloaded · ${formatBytes(have.bytes)} · v${have.version}`
                    : `Not downloaded · ≈ ${formatBytes(pack.bytes)}`}
                </span>
              </div>
              {busy ? (
                <Progress id={id} />
              ) : (
                <>
                  {info && have?.version !== info.version ? (
                    <DownloadButton
                      info={info}
                      online={online}
                      label={have ? `Update · ${formatBytes(info.bytes)}` : undefined}
                    />
                  ) : null}
                  {have ? (
                    <Button variant="destructive" onClick={() => setRemoving(id)}>
                      Remove
                    </Button>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title="Remove language data?"
        message="Songs in this language show their original text again until you download the data. Your songs and progress are not affected."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          const id = removing;
          setRemoving(null);
          if (id)
            void uninstall(id).catch(() =>
              toast.show({ message: 'Could not remove the language data. Try again.' }),
            );
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

/** Song-screen notice when a language has no data: offers the one-time download, or says none exists yet. */
export function LanguageDataBanner({ language }: { language: LangCode }) {
  const installed = useInstalledPacks();
  const states = useInstallStates();
  const id = PACK_FOR_LANG[language];
  const have = installed?.some((p) => p.id === id);
  const m = useManifest(!!id && installed !== undefined && !have);
  const online = useOnline();
  const name = LANG_NAME[language];
  if (installed === undefined) return null;
  if (!id)
    return (
      <Banner>
        Pronunciation for {name} isn’t available yet, so the original text is shown. Marking lines
        as learned still works.
      </Banner>
    );
  if (have) return null;
  const info = m.status === 'ready' ? m.manifest.packs.find((p) => p.id === id) : undefined;
  const busy = states.get(id)?.progress;
  return (
    <Banner
      tone="warning"
      action={
        info && !busy ? <DownloadButton info={info} online={online} label="Download" /> : undefined
      }
    >
      Pronunciation for {name} needs a one-time download
      {info ? ` (≈ ${formatBytes(info.bytes)})` : ''}. Until then the original text is shown.
      {busy ? <Progress id={id} /> : null}
      {m.status === 'error' ? ' Connect to the internet to see the download.' : null}
    </Banner>
  );
}
