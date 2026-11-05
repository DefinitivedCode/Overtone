import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LRCLIB_MIN_GAP_MS,
  LRCLIB_TIMEOUT_MS,
  LrclibError,
  describeLrclibError,
  getLrclib,
  parseRetryAfter,
  resetLrclibState,
  searchLrclib,
} from './lrclib';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

const rec = (over: Record<string, unknown> = {}) => ({
  id: 1,
  trackName: 'Song',
  artistName: 'Artist',
  albumName: 'Album',
  duration: 200.4,
  instrumental: false,
  plainLyrics: 'line one\nline two',
  syncedLyrics: '[00:01.00] line one',
  ...over,
});

beforeEach(() => resetLrclibState());
afterEach(() => vi.useRealTimers());

describe('searchLrclib', () => {
  it('returns validated, normalised results and sends the client header and encoded query', async () => {
    const fetch = vi.fn(async () =>
      json([rec(), rec({ id: 2, plainLyrics: null, instrumental: true })]),
    );
    const results = await searchLrclib({ title: 'Café & 사랑', artist: 'A B' }, { fetch });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 1,
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 200,
      instrumental: false,
      plainLyrics: 'line one\nline two',
      syncedLyrics: '[00:01.00] line one',
    });
    expect(results[1]).toMatchObject({ instrumental: true, plainLyrics: null });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith('https://lrclib.net/api/search?')).toBe(true);
    expect(new URL(url).searchParams.get('track_name')).toBe('Café & 사랑');
    expect(new URL(url).searchParams.get('artist_name')).toBe('A B');
    expect((init.headers as Record<string, string>)['Lrclib-Client']).toMatch(/^Overtone\/\d/);
    expect(init.credentials).toBe('omit');
  });

  it('does not call the network for an empty query', async () => {
    const fetch = vi.fn();
    expect(await searchLrclib({ title: '  ', artist: '' }, { fetch })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await searchLrclib({ title: 'x' }, { fetch: async () => json([]) })).toEqual([]);
  });

  it('strips control characters and caps oversized lyrics like pasted text', async () => {
    const huge = `la${String.fromCharCode(0)}la${String.fromCharCode(0x200b)}
`.repeat(10_000);
    const [r] = await searchLrclib(
      { title: 'x' },
      { fetch: async () => json([rec({ plainLyrics: huge })]) },
    );
    expect(r!.plainLyrics).not.toContain(String.fromCharCode(0));
    expect(r!.plainLyrics).not.toContain(String.fromCharCode(0x200b));
    expect(r!.plainLyrics!.length).toBeLessThanOrEqual(20_000);
  });

  it('keeps lyrics as plain text (markup is never interpreted here)', async () => {
    const [r] = await searchLrclib(
      { title: 'x' },
      {
        fetch: async () =>
          json([rec({ trackName: '<img src=x onerror=alert(1)>', plainLyrics: '<b>hi</b>' })]),
      },
    );
    expect(r!.title).toBe('<img src=x onerror=alert(1)>');
    expect(r!.plainLyrics).toBe('<b>hi</b>');
  });

  it('skips records that do not match the schema and ignores unknown fields', async () => {
    const results = await searchLrclib(
      { title: 'x' },
      { fetch: async () => json([{ id: 'nope' }, rec({ extra: { deep: 1 } }), 42]) },
    );
    expect(results.map((r) => r.id)).toEqual([1]);
  });

  it('caps the result count', async () => {
    const many = Array.from({ length: 60 }, (_, i) => rec({ id: i + 1 }));
    expect(await searchLrclib({ title: 'x' }, { fetch: async () => json(many) })).toHaveLength(20);
  });
});

describe('errors', () => {
  const kind = async (fetch: () => Promise<Response>) => {
    try {
      await searchLrclib({ title: 'x' }, { fetch, sleep: async () => undefined });
    } catch (e) {
      return e instanceof LrclibError ? e : null;
    }
    return null;
  };

  it('maps 404, 5xx, other statuses, malformed and non-JSON responses', async () => {
    expect((await kind(async () => new Response('', { status: 404 })))?.kind).toBe('not-found');
    expect((await kind(async () => new Response('', { status: 503 })))?.kind).toBe('server');
    expect((await kind(async () => new Response('', { status: 500 })))?.kind).toBe('server');
    expect((await kind(async () => new Response('', { status: 403 })))?.kind).toBe('network');
    expect((await kind(async () => json({ not: 'a list' })))?.kind).toBe('malformed');
    expect(
      (await kind(async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })))
        ?.kind,
    ).toBe('malformed');
    expect(
      (
        await kind(
          async () => new Response('{oops', { headers: { 'Content-Type': 'application/json' } }),
        )
      )?.kind,
    ).toBe('malformed');
  });

  it('reports a thrown fetch (offline/CORS) as a network error', async () => {
    expect((await kind(() => Promise.reject(new TypeError('Failed to fetch'))))?.kind).toBe(
      'network',
    );
  });

  it('times out after 10 s', async () => {
    vi.useFakeTimers();
    const fetch = (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(init.signal!.reason));
      });
    const p = searchLrclib(
      { title: 'x' },
      { fetch: fetch as typeof globalThis.fetch, sleep: async () => undefined },
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(LRCLIB_TIMEOUT_MS + 5);
    expect(((await p) as LrclibError).kind).toBe('timeout');
  });

  it('refuses to start when the browser says it is offline', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('navigator', { onLine: false });
    try {
      await expect(searchLrclib({ title: 'x' }, { fetch })).rejects.toMatchObject({
        kind: 'offline',
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('has a specific human message for every kind', () => {
    const kinds = [
      'offline',
      'timeout',
      'rate-limited',
      'not-found',
      'server',
      'malformed',
      'network',
    ] as const;
    const messages = kinds.map((k) => describeLrclibError(new LrclibError(k, k)));
    expect(new Set(messages).size).toBe(kinds.length);
    expect(describeLrclibError(new LrclibError('rate-limited', 'x', 12_000))).toContain('12 s');
  });
});

describe('rate limiting (429)', () => {
  it('honours Retry-After plus jitter and refuses further calls until it has passed', async () => {
    let t = 1_000_000;
    const fetch = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '7' } }),
    );
    const deps = { fetch, now: () => t, sleep: async () => undefined, random: () => 0.5 };
    const err = await searchLrclib({ title: 'x' }, deps).catch((e: unknown) => e as LrclibError);
    expect(err).toMatchObject({ kind: 'rate-limited', retryAfterMs: 7_500 });
    // Still cooling down: no new network request.
    t += 3_000;
    const again = await searchLrclib({ title: 'x' }, deps).catch((e: unknown) => e as LrclibError);
    expect(again).toMatchObject({ kind: 'rate-limited', retryAfterMs: 4_500 });
    expect(fetch).toHaveBeenCalledTimes(1);
    // After it passes, requests resume.
    t += 5_000;
    fetch.mockImplementation(async () => json([rec()]) as unknown as Response);
    expect(await searchLrclib({ title: 'x' }, deps)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('parses seconds and HTTP dates, and falls back when absent', () => {
    expect(parseRetryAfter('3', 0)).toBe(3_000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(parseRetryAfter('garbage', 0)).toBeNull();
    expect(parseRetryAfter(null, 0)).toBeNull();
  });

  it('uses a default wait when the server gives no Retry-After', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 429 }));
    const err = (await searchLrclib({ title: 'x' }, { fetch, random: () => 0 }).catch(
      (e: unknown) => e,
    )) as LrclibError;
    expect(err.retryAfterMs).toBe(30_000);
  });
});

describe('throttling', () => {
  it('spaces sequential requests at least 500 ms apart', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const deps = {
      fetch: async () => json([rec()]),
      now: () => t,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        t += ms;
      },
    };
    await Promise.all([searchLrclib({ title: 'a' }, deps), searchLrclib({ title: 'b' }, deps)]);
    expect(sleeps).toEqual([LRCLIB_MIN_GAP_MS]);
  });
});

describe('getLrclib', () => {
  it('fetches one record by id and rejects bad ids without a request', async () => {
    const fetch = vi.fn(async () => json(rec({ id: 5 })));
    expect((await getLrclib(5, { fetch })).id).toBe(5);
    expect(new URL((fetch.mock.calls[0] as unknown as [string])[0]).pathname).toBe('/api/get/5');
    await expect(getLrclib(-1, { fetch })).rejects.toMatchObject({ kind: 'not-found' });
    await expect(getLrclib(6, { fetch: async () => json({ id: 'x' }) })).rejects.toMatchObject({
      kind: 'malformed',
    });
  });
});

describe('live smoke test (opt-in)', () => {
  it.runIf(process.env['OVERTONE_LIVE_LRCLIB'] === '1')(
    'the real service answers a search',
    async () => {
      resetLrclibState();
      const results = await searchLrclib({ title: 'Imagine', artist: 'John Lennon' });
      expect(Array.isArray(results)).toBe(true);
    },
  );
});
