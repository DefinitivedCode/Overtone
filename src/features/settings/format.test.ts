import { describe, expect, it } from 'vitest';
import { formatBytes, formatLastBackup } from './format';

describe('formatLastBackup', () => {
  const now = 1_000_000_000_000;
  it('describes never, just now, minutes, hours, days, months', () => {
    expect(formatLastBackup(null, now)).toBe('Never');
    expect(formatLastBackup(now - 10_000, now)).toBe('Just now');
    expect(formatLastBackup(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(formatLastBackup(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(formatLastBackup(now - 3 * 86_400_000, now)).toBe('3 days ago');
    expect(formatLastBackup(now - 90 * 86_400_000, now)).toBe('3 months ago');
  });
});

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB');
  });
});
