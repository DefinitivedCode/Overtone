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

/** Index of the first lyric element whose bottom edge is below `topOffset` (for scroll anchoring). */
export function firstVisibleLineIndex(root: ParentNode, topOffset: number): number | null {
  for (const el of root.querySelectorAll<HTMLElement>('[data-line-index]')) {
    if (el.getBoundingClientRect().bottom > topOffset) return Number(el.dataset['lineIndex']);
  }
  return null;
}
