import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageError, guard, toStorageError } from '@/db/errors';
import { estimateStorage, isLowOnSpace, requestPersistence } from './storage';

afterEach(() => vi.unstubAllGlobals());

const stubStorage = (storage: unknown) => vi.stubGlobal('navigator', { storage });

describe('requestPersistence', () => {
  it('returns true without re-requesting when already persisted', async () => {
    const persist = vi.fn();
    stubStorage({ persisted: async () => true, persist });
    expect(await requestPersistence()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });
  it('requests persistence and reports the outcome (granted / refused)', async () => {
    stubStorage({ persisted: async () => false, persist: async () => true });
    expect(await requestPersistence()).toBe(true);
    stubStorage({ persisted: async () => false, persist: async () => false });
    expect(await requestPersistence()).toBe(false);
  });
  it('returns null when unsupported or failing', async () => {
    stubStorage(undefined);
    expect(await requestPersistence()).toBeNull();
    stubStorage({
      persisted: async () => false,
      persist: async () => Promise.reject(new Error('x')),
    });
    expect(await requestPersistence()).toBeNull();
  });
});

describe('estimate / low space', () => {
  it('reports usage and quota, and warns when free space < 3× the download', async () => {
    stubStorage({ estimate: async () => ({ usage: 900, quota: 1000 }) });
    expect(await estimateStorage()).toEqual({ usage: 900, quota: 1000 });
    expect(await isLowOnSpace(100)).toBe(true); // 100 free < 300
    expect(await isLowOnSpace(10)).toBe(false); // 100 free >= 30
  });
  it('never claims low space when the estimate is unavailable', async () => {
    stubStorage(undefined);
    expect(await isLowOnSpace(1e12)).toBe(false);
  });
});

describe('toStorageError / guard', () => {
  it.each([
    ['QuotaExceededError', 'quota'],
    ['InvalidStateError', 'unavailable'],
    ['SecurityError', 'unavailable'],
    ['VersionError', 'blocked'],
    ['SomethingElse', 'unknown'],
  ])('maps %s to %s', (name, kind) => {
    expect(toStorageError(Object.assign(new Error('x'), { name })).kind).toBe(kind);
  });
  it('unwraps Dexie AbortError.inner', () => {
    const wrapped = Object.assign(new Error('x'), {
      name: 'AbortError',
      inner: Object.assign(new Error('q'), { name: 'QuotaExceededError' }),
    });
    expect(toStorageError(wrapped).kind).toBe('quota');
  });
  it('guard rethrows StorageError untouched and wraps others', async () => {
    const own = new StorageError('quota', 'm');
    await expect(guard(() => Promise.reject(own))).rejects.toBe(own);
    await expect(guard(() => Promise.reject(new Error('plain')))).rejects.toBeInstanceOf(
      StorageError,
    );
  });
});
