import type { Line, LineKind } from '@/db/types';

export interface LyricItem {
  line: Line;
  kind: LineKind;
  /** 1-based position among learnable lines (null for sections and blanks). */
  ordinal: number | null;
}

/** Effective kinds plus lyric ordinals ("line 3 of the song" for assistive tech). */
export function toItems(lines: readonly Line[]): LyricItem[] {
  let n = 0;
  return lines.map((line) => {
    const kind = line.kindOverride ?? line.kind;
    return { line, kind, ordinal: kind === 'lyric' ? ++n : null };
  });
}

/** The first lyric element that starts at or below `topOffset` (fully clear of the sticky bars), and its top (for scroll anchoring). */
export function firstVisibleLine(
  root: ParentNode,
  topOffset: number,
): { index: number; top: number } | null {
  for (const el of root.querySelectorAll<HTMLElement>('[data-line-index]')) {
    const r = el.getBoundingClientRect();
    if (r.top >= topOffset - 2) return { index: Number(el.dataset['lineIndex']), top: r.top };
  }
  return null;
}
