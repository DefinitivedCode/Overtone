import { useEffect, useState } from 'react';
import { useSettings } from '@/db/hooks';
import { updateSettings } from '@/db/repositories/settings';
import { StorageError } from '@/db/errors';
import { estimateStorage, isPersisted } from '@/platform/storage';
import type { StorageEstimate } from '@/platform/storage';
import { Banner, Button, useToast } from '@/ui';
import { exportBackupFile } from './backupActions';
import { formatBytes, formatLastBackup } from './format';
import { ImportFlow } from './ImportFlow';
import s from './SettingsScreen.module.css';

/** Settings → Backup: export, import, last export time, storage protection status (J11, J12.4). */
export function BackupSection() {
  const toast = useToast();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);

  // Refresh what the browser actually says about persistence and quota.
  useEffect(() => {
    let live = true;
    void (async () => {
      const [persisted, est] = await Promise.all([isPersisted(), estimateStorage()]);
      if (!live) return;
      setEstimate(est);
      if (persisted !== null)
        await updateSettings((x) =>
          x.storage.persisted === persisted ? x : { ...x, storage: { ...x.storage, persisted } },
        ).catch(() => undefined);
    })();
    return () => {
      live = false;
    };
  }, []);

  async function doExport() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await exportBackupFile();
      if (outcome === 'downloaded') toast.show({ message: 'Backup downloaded' });
      else if (outcome === 'shared') toast.show({ message: 'Backup exported' });
    } catch (e) {
      setError(e instanceof StorageError ? e.message : 'The backup could not be created.');
    } finally {
      setBusy(false);
    }
  }

  const persisted = settings?.storage.persisted;
  const storageText =
    persisted === true
      ? 'Storage: protected'
      : persisted === false
        ? 'Storage: may be cleared by iOS — keep backups'
        : settings?.storage.persistRequested
          ? 'Storage: protection unknown — keep backups'
          : 'Storage: not requested yet (asked after you save your first song)';

  return (
    <section className={s['group']} aria-labelledby="backup-h">
      <h2 id="backup-h" className={s['groupTitle']}>
        Backup &amp; storage
      </h2>
      <div className={s['card']}>
        {error ? (
          <Banner tone="error" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}
        <Button onClick={() => void doExport()} disabled={busy}>
          Export backup
        </Button>
        <ImportFlow />
        <p className={s['row']}>
          Last backup: <strong>{formatLastBackup(settings?.backup.lastExportAt ?? null)}</strong>
        </p>
        <p className={s['row']}>{storageText}</p>
        {estimate?.usage != null && estimate.quota != null ? (
          <p className={s['row']}>
            Using {formatBytes(estimate.usage)} of about {formatBytes(estimate.quota)} available.
          </p>
        ) : null}
      </div>
      <p className={s['note']}>
        Overtone has no account or server. A backup file is the only way to move your songs to
        another device or recover them if this one clears its storage.
      </p>
    </section>
  );
}
