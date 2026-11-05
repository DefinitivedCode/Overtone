const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

/** "Never" / "Just now" / "3 days ago" for the last-backup line. */
export function formatLastBackup(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'Never';
  const diff = Math.max(0, now - ts);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return 'Just now';
  if (diff < hour) return rtf.format(-Math.floor(diff / min), 'minute');
  if (diff < day) return rtf.format(-Math.floor(diff / hour), 'hour');
  if (diff < 60 * day) return rtf.format(-Math.floor(diff / day), 'day');
  return rtf.format(-Math.floor(diff / (30 * day)), 'month');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
