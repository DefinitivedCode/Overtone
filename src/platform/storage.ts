/** Storage helpers (ARCHITECTURE §10). All functions tolerate missing APIs (private mode, older browsers). */

export interface StorageEstimate {
  usage: number | null;
  quota: number | null;
}

export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    const e = await navigator.storage?.estimate?.();
    return { usage: e?.usage ?? null, quota: e?.quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}

/** true = granted, false = refused, null = unsupported or failed. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}

/** Free quota is below `factor` × `bytes` (used before pack downloads; ARCHITECTURE §5.2). */
export async function isLowOnSpace(bytes: number, factor = 3): Promise<boolean> {
  const { usage, quota } = await estimateStorage();
  if (usage === null || quota === null) return false;
  return quota - usage < bytes * factor;
}
