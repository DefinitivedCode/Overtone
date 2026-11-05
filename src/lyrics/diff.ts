export interface LyricsDiff {
  /** Lines (by content key) present in both versions, in the same relative order. */
  unchanged: number;
  /** Old lines replaced by new ones in the same gap: their progress is reset. */
  changed: number;
  added: number;
  removed: number;
}

/**
 * LCS over lyric-line keys. Used only to produce the user-facing summary after an edit
 * (ARCHITECTURE §6.4); preservation itself is by key, independent of order. A moved line shows as
 * removed + added here, but keeps its progress because its key still exists.
 */
export function diffLyricKeys(oldKeys: readonly string[], newKeys: readonly string[]): LyricsDiff {
  const n = oldKeys.length;
  const m = newKeys.length;
  // dp[i][j] = LCS length of oldKeys[i..] and newKeys[j..]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        oldKeys[i] === newKeys[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: LyricsDiff = { unchanged: 0, changed: 0, added: 0, removed: 0 };
  let i = 0;
  let j = 0;
  let removed = 0;
  let added = 0;
  const flush = () => {
    const c = Math.min(removed, added);
    out.changed += c;
    out.removed += removed - c;
    out.added += added - c;
    removed = 0;
    added = 0;
  };
  while (i < n || j < m) {
    if (i < n && j < m && oldKeys[i] === newKeys[j]) {
      flush();
      out.unchanged++;
      i++;
      j++;
    } else if (j >= m || (i < n && dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      removed++;
      i++;
    } else {
      added++;
      j++;
    }
  }
  flush();
  return out;
}
