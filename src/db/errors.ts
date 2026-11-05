import type { SongInputErrors } from '@/lyrics/parse';

export type StorageErrorKind = 'quota' | 'unavailable' | 'blocked' | 'unknown';

/** Typed storage failure surfaced to the UI (PRODUCT_SPEC J12.6): the app never pretends to have saved. */
export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  constructor(kind: StorageErrorKind, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StorageError';
    this.kind = kind;
  }
}

export class ValidationError extends Error {
  readonly errors: SongInputErrors;
  constructor(errors: SongInputErrors) {
    super(Object.values(errors).join(' '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const UNAVAILABLE = new Set([
  'OpenFailedError',
  'DatabaseClosedError',
  'InvalidStateError',
  'UnknownError',
  'SecurityError',
  'MissingAPIError',
  'NotFoundError',
]);

function errorName(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { name?: unknown; inner?: unknown };
    if (o.name === 'AbortError' && o.inner) return errorName(o.inner);
    if (typeof o.name === 'string') return o.name;
  }
  return '';
}

export function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = errorName(e);
  if (name === 'QuotaExceededError')
    return new StorageError(
      'quota',
      'This device is out of storage space. Nothing was saved. Export a backup or free up space (language data can be removed in Settings).',
      e,
    );
  if (name === 'VersionError' || name === 'BlockedError')
    return new StorageError(
      'blocked',
      'Overtone is open in another window with an older version. Close it and reload.',
      e,
    );
  if (UNAVAILABLE.has(name))
    return new StorageError(
      'unavailable',
      'Overtone could not use on-device storage (private browsing or storage is unavailable). Nothing was saved.',
      e,
    );
  return new StorageError('unknown', 'Something went wrong while saving. Nothing was saved.', e);
}

/** Runs a storage operation, mapping low-level failures to StorageError. Validation errors pass through. */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof StorageError || e instanceof ValidationError) throw e;
    throw toStorageError(e);
  }
}
