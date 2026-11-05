import type { Token } from '@/engine/model';

/** A tapped word and where it came from (needed to scope and find its corrections). */
export interface WordTarget {
  /** The token as displayed, i.e. after any corrections. */
  token: Token;
  lineKey: string;
  lineIndex: number;
  /** Which occurrence of this surface it is within its line (0-based). */
  occurrence: number;
  /** How many tokens in the line share this surface. */
  repeats: number;
  /** The following token when it touches this one (the candidate for "merge with next"). */
  next: Token | null;
}
