import { useRef, useState } from 'react';
import { applyImport, previewImport, readBackupFile } from '@/db/backup/import';
import type { ImportMode, ImportPreview } from '@/db/backup/import';
import type { Backup } from '@/db/backup/format';
import { StorageError } from '@/db/errors';
import { Banner, Button, ConfirmDialog, Sheet, SegmentedControl, useToast } from '@/ui';
import { exportBackupFile } from './backupActions';
import s from './ImportFlow.module.css';

interface Pending {
  backup: Backup;
  checksumOk: boolean;
  migratedFrom: number | null;
  preview: ImportPreview;
}

export interface ImportFlowProps {
  label?: string;
  variant?: 'primary' | 'secondary';
  /** Called after a successful import. */
  onImported?: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** File pick → validate → preview → Merge (default) / Replace (confirmed) (PRODUCT_SPEC J11.3–J11.5). */
export function ImportFlow({
  label = 'Import backup…',
  variant = 'secondary',
  onImported,
}: ImportFlowProps) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const r = await readBackupFile(file);
    if (!r.ok) {
      setError(r.reason);
      return;
    }
    try {
      setPending({
        backup: r.backup,
        checksumOk: r.checksumOk,
        migratedFrom: r.migratedFrom,
        preview: await previewImport(r.backup),
      });
      setMode('merge');
    } catch (e) {
      setError(e instanceof StorageError ? e.message : 'Could not read the current library.');
    }
  }

  async function run() {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await applyImport(pending.backup, mode);
      const n = pending.backup.songs.length;
      toast.show({
        message:
          mode === 'replace'
            ? `Library replaced · ${plural(n, 'song')} imported`
            : `Imported ${plural(result.added, 'new song')}${result.updated ? `, updated ${result.updated}` : ''}`,
      });
      setPending(null);
      setConfirmReplace(false);
      onImported?.();
    } catch (e) {
      setError(
        e instanceof StorageError ? e.message : 'The import failed and nothing was changed.',
      );
      setPending(null);
      setConfirmReplace(false);
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    if (!busy) setPending(null);
  };

  return (
    <div className={s['wrap']}>
      <Button variant={variant} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Choose a backup file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error ? (
        <Banner tone="error" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      <Sheet
        open={pending !== null}
        onClose={close}
        title="Import backup"
        detent="half"
        trailing={
          <Button variant="plain" onClick={close}>
            Cancel
          </Button>
        }
      >
        {pending ? (
          <div className={s['body']}>
            <p>
              <strong>{plural(pending.preview.total, 'song')}</strong> in this file:{' '}
              {pending.preview.newSongs} new, {pending.preview.existingSongs} already in your
              library.
            </p>
            {!pending.checksumOk ? (
              <Banner tone="warning">
                This file&rsquo;s checksum doesn&rsquo;t match. It may have been edited by hand. You
                can still import it.
              </Banner>
            ) : null}
            {pending.migratedFrom !== null ? (
              <Banner>This backup is from an older version and was upgraded while reading.</Banner>
            ) : null}
            <SegmentedControl
              label="Import mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'merge', label: 'Merge' },
                { value: 'replace', label: 'Replace library' },
              ]}
            />
            <p className={s['hint']}>
              {mode === 'merge'
                ? 'Keeps your current songs. For songs in both, the newer edit wins and learned lines from both are combined.'
                : 'Deletes every song currently in Overtone and uses only this file.'}
            </p>
            {mode === 'replace' ? (
              <Button
                variant="secondary"
                onClick={() => void exportBackupFile().catch(() => undefined)}
              >
                Export current library first
              </Button>
            ) : null}
            <Button
              variant={mode === 'replace' ? 'destructiveFilled' : 'primary'}
              disabled={busy}
              onClick={() => (mode === 'replace' ? setConfirmReplace(true) : void run())}
            >
              {mode === 'replace' ? 'Replace library…' : 'Import'}
            </Button>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={confirmReplace}
        title="Replace your library?"
        message="Every song, progress and correction currently in Overtone will be deleted and replaced by this file. Export a backup first if you might need them."
        confirmLabel="Replace library"
        destructive
        onConfirm={() => void run()}
        onCancel={() => setConfirmReplace(false)}
      />
    </div>
  );
}
