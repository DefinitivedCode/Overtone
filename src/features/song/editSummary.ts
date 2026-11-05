import type { LyricsDiff } from '@/lyrics/diff';

const lines = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`;

/** Toast text after saving edited lyrics (J7.5), e.g. "Lyrics updated · 2 changed lines reset to unlearned". */
export function summariseEdit(diff: LyricsDiff): string {
  const parts: string[] = [];
  if (diff.changed > 0)
    parts.push(
      `${diff.changed} changed ${diff.changed === 1 ? 'line' : 'lines'} reset to unlearned`,
    );
  if (diff.added > 0) parts.push(`${lines(diff.added)} added`);
  if (diff.removed > 0) parts.push(`${lines(diff.removed)} removed`);
  return `Lyrics updated · ${parts.length ? parts.join(', ') : 'no line changes'}`;
}
