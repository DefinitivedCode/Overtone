import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DictDB, getDictDb, packMetaKey, setDictDb } from './db';
import { installPack, PackInstallError } from './install';
import type { InstallProgress } from './install';
import { installedVersion, listInstalled, lookupMany, removePack } from './lookup';
import { toJsonLines } from '../../../scripts/packs/parse';
import type { PackInfo, PackRow } from './types';
import { readTokenizer } from './resources';

let n = 0;
beforeEach(async () => {
  setDictDb(new DictDB(`dict-test-${++n}-${Math.random()}`));
  await getDictDb().open();
});

const rows = (extra = ''): PackRow[] => [
  { f: '你好', e: 1, r: 'ni3 hao3', s: [{ g: ['hello' + extra] }], q: 1 },
  { f: '你好', e: 2, r: 'ni3 hao3', s: [{ g: ['Nihao (name)'] }], q: 0 },
  { f: '银行', e: 3, r: 'yin2 hang2', s: [{ g: ['bank'] }], q: 1 },
];

function mkPack(version: string, data: PackRow[], opts: { badSha?: boolean } = {}) {
  const gz = gzipSync(toJsonLines(data));
  const sha = opts.badSha ? '0'.repeat(64) : createHash('sha256').update(gz).digest('hex');
  const info: PackInfo = {
    id: 'zh-core',
    lang: 'zh',
    version,
    bytes: gz.length,
    rows: data.length,
    files: [
      {
        path: `zh-core/${version}/dict.jsonl.gz`,
        bytes: gz.length,
        sha256: sha,
        role: 'dictionary',
      },
    ],
    sources: [],
  };
  const fetchImpl = (async (url: string) => {
    if (!url.includes(`/${version}/`)) return new Response(null, { status: 404 });
    // Deliver in several chunks so progress events are observable.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        const step = Math.ceil(gz.length / 3);
        for (let i = 0; i < gz.length; i += step)
          c.enqueue(new Uint8Array(gz.subarray(i, i + step)));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-length': String(gz.length) } });
  }) as unknown as typeof fetch;
  return { info, fetchImpl };
}

describe('installPack', () => {
  it('publishes verified Japanese tokenizer and dictionary together and keeps the prior generation on failure', async () => {
    const cache = new Map<string, Response>();
    vi.stubGlobal('caches', {
      open: async () => ({
        put: (key: string, value: Response) => cache.set(key, value),
        delete: (key: string) => cache.delete(key),
      }),
      match: async (key: string) => cache.get(key)?.clone(),
    });
    try {
      const bytes = gzipSync('test wasm');
      const make = (version: string, badSha = false) => {
        const p = mkPack(version, [{ f: '東京', e: 1, r: 'とうきょう', s: [], q: 1 }], { badSha });
        const info: PackInfo = {
          ...p.info,
          id: 'ja-core',
          lang: 'ja',
          bytes: p.info.bytes + bytes.length,
          files: [
            {
              path: `ja-core/${version}/ipadic.pack`,
              role: 'tokenizer',
              bytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            },
            ...p.info.files,
          ],
        };
        const fetchImpl: typeof fetch = (url, init) =>
          String(url).endsWith('ipadic.pack')
            ? Promise.resolve(new Response(new Uint8Array(bytes)))
            : p.fetchImpl(url, init);
        return { info, fetchImpl };
      };
      const baseUrl = 'https://overtone.test/packs/';
      const first = make('1');
      const events: InstallProgress[] = [];
      await installPack(first.info, {
        baseUrl,
        fetchImpl: first.fetchImpl,
        onProgress: (p) => events.push(p),
      });
      const before = (await listInstalled())[0]!;
      expect(before.tokenizer).toBeDefined();
      expect(await (await readTokenizer(before.tokenizer!)).text()).toBe('test wasm');
      expect(events.filter((p) => p.phase === 'download').at(-1)).toMatchObject({
        loaded: first.info.bytes,
        total: first.info.bytes,
      });
      const failed = make('2', true);
      await expect(
        installPack(failed.info, { baseUrl, fetchImpl: failed.fetchImpl }),
      ).rejects.toMatchObject({ kind: 'checksum' });
      expect(await listInstalled()).toEqual([before]);
      expect([...cache.keys()]).toEqual([before.tokenizer]);
      expect((await lookupMany('ja', ['東京'])).get('東京')?.[0]?.r).toBe('とうきょう');
      await removePack('ja-core');
      expect(cache.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('downloads with progress, verifies, installs rows and publishes the pack', async () => {
    const { info, fetchImpl } = mkPack('1', rows());
    const events: InstallProgress[] = [];
    await installPack(info, { baseUrl: '/packs/', fetchImpl, onProgress: (p) => events.push(p) });
    expect(events.some((e) => e.phase === 'download' && e.loaded > 0 && e.loaded <= e.total)).toBe(
      true,
    );
    expect(events.at(-1)).toMatchObject({ phase: 'install', loaded: 3, total: 3 });
    expect(await installedVersion('zh')).toBe('1');
    expect((await listInstalled())[0]).toMatchObject({ id: 'zh-core', rows: 3 });
  });

  it('rejects a checksum mismatch and stores nothing', async () => {
    const { info, fetchImpl } = mkPack('1', rows(), { badSha: true });
    await expect(installPack(info, { baseUrl: '/packs/', fetchImpl })).rejects.toMatchObject({
      kind: 'checksum',
    });
    expect(await getDictDb().blocks.count()).toBe(0);
    expect(await installedVersion('zh')).toBeNull();
  });

  it('network failures and HTTP errors are typed and leave no pack installed', async () => {
    const { info } = mkPack('1', rows());
    const down = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    await expect(installPack(info, { baseUrl: '/packs/', fetchImpl: down })).rejects.toMatchObject({
      kind: 'network',
    });
    const notFound = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const err = await installPack(info, { baseUrl: '/packs/', fetchImpl: notFound }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PackInstallError);
    expect((err as PackInstallError).message).toMatch(/404/);
    expect(await installedVersion('zh')).toBeNull();
  });

  it('a malformed row is a format error and the pack is not published', async () => {
    const gz = gzipSync('{"f":"a","e":1,"r":"a1","s":[],"q":1}\nnot json\n');
    const info: PackInfo = {
      id: 'zh-core',
      lang: 'zh',
      version: '1',
      bytes: gz.length,
      rows: 2,
      sources: [],
      files: [
        {
          path: 'x',
          bytes: gz.length,
          sha256: createHash('sha256').update(gz).digest('hex'),
          role: 'dictionary',
        },
      ],
    };
    const fetchImpl = (async () =>
      new Response(new Uint8Array(gz), { status: 200 })) as unknown as typeof fetch;
    await expect(installPack(info, { baseUrl: '/', fetchImpl })).rejects.toMatchObject({
      kind: 'format',
    });
    expect(await installedVersion('zh')).toBeNull();
  });

  it('can be cancelled', async () => {
    const { info, fetchImpl } = mkPack('1', rows());
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      installPack(info, {
        baseUrl: '/packs/',
        fetchImpl: ((u: string, init?: RequestInit) =>
          init?.signal?.aborted
            ? Promise.reject(new DOMException('x', 'AbortError'))
            : (fetchImpl as typeof fetch)(u)) as unknown as typeof fetch,
        signal: ctl.signal,
      }),
    ).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('streams across batches and keeps large shards intact', async () => {
    const big: PackRow[] = Array.from({ length: 5_001 }, (_, i) => ({
      f: `词${i}`,
      e: i,
      r: 'ci2',
      s: [],
      q: 1,
    }));
    const { info, fetchImpl } = mkPack('1', [...big, ...rows(), { ...rows()[0]!, f: '𠀀好' }]);
    const events: number[] = [];
    await installPack(info, {
      baseUrl: '/packs/',
      fetchImpl,
      onProgress: (p) => {
        if (p.phase === 'install') events.push(p.loaded);
      },
    });
    expect(events).toEqual([5_003, 5_005]);
    expect(await getDictDb().blocks.count()).toBe(4);
    expect(
      [...(await lookupMany('zh', ['词0', '词5000', '𠀀好', '𠀀没', '𠀁好', '词0', '词9999']))].map(
        ([form]) => form,
      ),
    ).toEqual(['词0', '词5000', '𠀀好']);
  }, 30_000);
});

describe('versions are atomic', () => {
  it('a new version replaces the old one only when fully installed', async () => {
    const v1 = mkPack('1', rows());
    await installPack(v1.info, { baseUrl: '/packs/', fetchImpl: v1.fetchImpl });
    const bad = mkPack('1', rows('-new'), { badSha: true });
    await expect(
      installPack(bad.info, { baseUrl: '/packs/', fetchImpl: bad.fetchImpl }),
    ).rejects.toBeInstanceOf(PackInstallError);
    // The failed upgrade left version 1 fully usable.
    expect((await lookupMany('zh', ['你好'])).get('你好')![0]!.s[0]!.g[0]).toBe('hello');

    const v2 = mkPack('2', rows('-new'));
    await installPack(v2.info, { baseUrl: '/packs/', fetchImpl: v2.fetchImpl });
    expect(await installedVersion('zh')).toBe('2');
    expect((await lookupMany('zh', ['你好'])).get('你好')![0]!.s[0]!.g[0]).toBe('hello-new');
    expect(await getDictDb().blocks.count()).toBe(2);
    expect(await getDictDb().staging.count()).toBe(0);
  });

  it('cancelling after shards have been written leaves only the active generation', async () => {
    const old = mkPack('1', rows());
    await installPack(old.info, { fetchImpl: old.fetchImpl });
    const replacement = mkPack('2', rows('-new'));
    const controller = new AbortController();
    await expect(
      installPack(replacement.info, {
        fetchImpl: replacement.fetchImpl,
        signal: controller.signal,
        onProgress: ({ phase }) => {
          if (phase === 'install') controller.abort();
        },
      }),
    ).rejects.toMatchObject({ kind: 'aborted' });
    expect(await installedVersion('zh')).toBe('1');
    expect(await getDictDb().blocks.count()).toBe(2);
    expect(await getDictDb().staging.count()).toBe(0);
  });

  it.each(['new install', 'remove'] as const)(
    'a concurrent %s supersedes a pending install',
    async (action) => {
      const old = mkPack('1', rows());
      const replacement = mkPack('2', rows('-new'));
      let markStarted!: () => void;
      let resume!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const pending = installPack(old.info, {
        fetchImpl: async (url, init) => {
          markStarted();
          await resumed;
          return old.fetchImpl(url, init);
        },
      });
      await started;
      if (action === 'remove') await removePack('zh-core');
      else await installPack(replacement.info, { fetchImpl: replacement.fetchImpl });
      resume();
      await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
      expect(await installedVersion('zh')).toBe(action === 'remove' ? null : '2');
      expect(await getDictDb().blocks.count()).toBe(action === 'remove' ? 0 : 2);
    },
  );

  it('reads a previously installed v1 pack offline and retires it when updated', async () => {
    const name = `${getDictDb().name}-legacy`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({ entries: '++rowId, [lang+f], packVersion', meta: 'key' });
    await legacy
      .table('entries')
      .bulkAdd(rows().map((r) => ({ ...r, lang: 'zh', packVersion: '1' })));
    await legacy.table('meta').put({
      key: packMetaKey('zh-core'),
      value: { id: 'zh-core', lang: 'zh', version: '1', rows: 3, bytes: 200, installedAt: 0 },
    });
    legacy.close();
    setDictDb(new DictDB(name));
    expect((await lookupMany('zh', ['银行'])).get('银行')?.[0]?.r).toBe('yin2 hang2');
    const replacement = mkPack('2', rows('-new'));
    await installPack(replacement.info, { fetchImpl: replacement.fetchImpl });
    expect((await lookupMany('zh', ['你好'])).get('你好')?.[0]?.s[0]?.g).toEqual(['hello-new']);
    expect(await getDictDb().entries.count()).toBe(0);
  });
});

describe('lookup and removal', () => {
  it('returns nothing before installation, common entries before proper nouns after', async () => {
    expect((await lookupMany('zh', ['你好'])).size).toBe(0);
    const p = mkPack('1', rows());
    await installPack(p.info, { baseUrl: '/packs/', fetchImpl: p.fetchImpl });
    const r = await lookupMany('zh', ['你好', '银行', '没有']);
    expect(r.get('你好')!.map((x) => x.q)).toEqual([1, 0]);
    expect(r.get('银行')![0]!.r).toBe('yin2 hang2');
    expect(r.has('没有')).toBe(false);
    expect((await lookupMany('yue', ['你好'])).size).toBe(0);
  });

  it('removePack deletes the rows and the record', async () => {
    const p = mkPack('1', rows());
    await installPack(p.info, { baseUrl: '/packs/', fetchImpl: p.fetchImpl });
    await removePack('zh-core');
    expect(await getDictDb().blocks.count()).toBe(0);
    expect(await listInstalled()).toEqual([]);
  });
});
