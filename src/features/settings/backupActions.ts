export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Exports the library as `overtone-backup-YYYY-MM-DD.json` (J11.1/J11.2). Uses the Web Share sheet
 * with the file when the browser can share files (iOS: Save to Files / AirDrop); otherwise falls
 * back to a download link. The export time is recorded only once the file was really handed over.
 */
export async function exportBackupFile(now = new Date()): Promise<ExportOutcome> {
  const { backupFilename, buildBackup, recordExport, serializeBackup } =
    await import('@/db/backup/export');
  const text = serializeBackup(await buildBackup(now));
  const name = backupFilename(now);
  const file = new File([text], name, { type: 'application/json' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Overtone backup' });
      await recordExport(now.getTime());
      return 'shared';
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled';
      // Any other share failure: fall through to a plain download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await recordExport(now.getTime());
  return 'downloaded';
}
