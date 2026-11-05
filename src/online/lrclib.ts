/**
 * LRCLIB client (M12, ADR 0015). Optional: nothing else in the app depends on it.
 *
 * - `GET /api/search?track_name=&artist_name=` and `GET /api/get/{id}`; no key, CORS enabled.
 * - Identifies the app with `Lrclib-Client` (browsers cannot set User-Agent). LRCLIB's preflight allows the header.
 * - 10 s timeout, sequential requests ≥ 500 ms apart, 429 honours `Retry-After` plus jitter.
 * - Responses are validated with zod, then treated as untrusted text: normalised and capped exactly like pasted lyrics.
 */
import { z } from 'zod';
import { APP_NAME, APP_VERSION } from '@/app/version';
import { LIMITS, normaliseLyrics } from '@/lyrics/parse';

export const LRCLIB_ORIGIN = 'https://lrclib.net';
export const LRCLIB_TIMEOUT_MS = 10_000;
export const LRCLIB_MIN_GAP_MS = 500;
const MAX_RESULTS = 20;
const MAX_SYNCED_CHARS = 200_000;

export type LrclibErrorKind =
  'offline' | 'timeout' | 'rate-limited' | 'not-found' | 'server' | 'malformed' | 'network';

export class LrclibError extends Error {
  constructor(
    readonly kind: LrclibErrorKind,
    message: string,
    /** For `rate-limited`: how long to wait before trying again. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LrclibError';
  }
}

/** Human-readable text for each failure (J3.2). */
export function describeLrclibError(e: unknown): string {
  if (!(e instanceof LrclibError)) return 'Something went wrong while searching.';
  switch (e.kind) {
    case 'offline':
      return 'You are offline. Search needs a connection; pasting lyrics still works.';
    case 'timeout':
      return 'The lyrics service took too long to answer.';
    case 'rate-limited':
      return e.retryAfterMs
        ? `The lyrics service asked us to slow down. Try again in ${Math.ceil(e.retryAfterMs / 1000)} s.`
        : 'The lyrics service asked us to slow down. Try again in a moment.';
    case 'not-found':
      return 'That song was not found.';
    case 'server':
      return 'The lyrics service is having trouble right now.';
    case 'malformed':
      return 'The lyrics service sent a reply Overtone could not read.';
    case 'network':
      return 'Could not reach the lyrics service.';
  }
}

const record = z.object({
  id: z.number().int(),
  trackName: z.string().nullish(),
  name: z.string().nullish(),
  artistName: z.string().nullish(),
  albumName: z.string().nullish(),
  duration: z.number().nullish(),
  instrumental: z.boolean().nullish(),
  plainLyrics: z.string().nullish(),
  syncedLyrics: z.string().nullish(),
});

export interface LrclibResult {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  /** Seconds. */
  duration: number | null;
  instrumental: boolean;
  /** Normalised, capped plain lyrics, or null when the track has none. */
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

function toResult(raw: z.infer<typeof record>): LrclibResult {
  const clip = (s: string | null | undefined, n: number) => {
    const t = (s ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
    return t ? t.slice(0, n) : null;
  };
  const plain = raw.plainLyrics
    ? normaliseLyrics(raw.plainLyrics).slice(0, LIMITS.lyricsChars)
    : '';
  return {
    id: raw.id,
    title: clip(raw.trackName ?? raw.name, LIMITS.title) ?? 'Untitled',
    artist: clip(raw.artistName, LIMITS.artist),
    album: clip(raw.albumName, LIMITS.title),
    duration: raw.duration && raw.duration > 0 ? Math.round(raw.duration) : null,
    instrumental: raw.instrumental === true,
    plainLyrics: plain.trim() ? plain : null,
    // Synced (LRC) text is stored untouched for future timed lyrics, only bounded in size.
    syncedLyrics: raw.syncedLyrics ? raw.syncedLyrics.slice(0, MAX_SYNCED_CHARS) : null,
  };
}

/** Test seams: the network, the clock and sleeping. */
export interface LrclibDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Cancels the request (e.g. the user changed the query). */
  signal?: AbortSignal;
  random?: () => number;
}

let queue: Promise<unknown> = Promise.resolve();
let lastStartedAt = -Infinity;
let blockedUntil = 0;

/** Forgets throttle and cooldown state (tests). */
export function resetLrclibState(): void {
  queue = Promise.resolve();
  lastStartedAt = -Infinity;
  blockedUntil = 0;
}

/** Parses `Retry-After` (seconds or an HTTP date) into milliseconds. */
export function parseRetryAfter(header: string | null, now: number): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

async function request(path: string, deps: LrclibDeps): Promise<unknown> {
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;

  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new LrclibError('offline', 'offline');
  if (now() < blockedUntil)
    throw new LrclibError('rate-limited', 'cooling down', blockedUntil - now());

  // One request at a time, at least LRCLIB_MIN_GAP_MS after the previous one started.
  const run = async (): Promise<unknown> => {
    const wait = lastStartedAt + LRCLIB_MIN_GAP_MS - now();
    if (wait > 0) await sleep(wait);
    if (deps.signal?.aborted) throw new LrclibError('network', 'cancelled');
    lastStartedAt = now();

    const ctl = new AbortController();
    const timer = setTimeout(
      () => ctl.abort(new LrclibError('timeout', 'timeout')),
      LRCLIB_TIMEOUT_MS,
    );
    const onAbort = () => ctl.abort(deps.signal?.reason);
    deps.signal?.addEventListener('abort', onAbort, { once: true });
    let res: Response;
    try {
      res = await doFetch(`${LRCLIB_ORIGIN}${path}`, {
        headers: {
          Accept: 'application/json',
          'Lrclib-Client': `${APP_NAME}/${APP_VERSION} (https://github.com/DefinitivedCode/Overtone)`,
        },
        signal: ctl.signal,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      if (e instanceof LrclibError) throw e;
      if (ctl.signal.reason instanceof LrclibError) throw ctl.signal.reason;
      if (deps.signal?.aborted) throw new LrclibError('network', 'cancelled');
      throw new LrclibError('network', e instanceof Error ? e.message : 'network');
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener('abort', onAbort);
    }

    if (res.status === 429) {
      const base = parseRetryAfter(res.headers.get('Retry-After'), now()) ?? 30_000;
      const wait429 = base + Math.round(random() * 1000); // jitter so clients do not retry in lockstep
      blockedUntil = now() + wait429;
      throw new LrclibError('rate-limited', 'rate limited', wait429);
    }
    if (res.status === 404) throw new LrclibError('not-found', 'not found');
    if (res.status >= 500) throw new LrclibError('server', `HTTP ${res.status}`);
    if (!res.ok) throw new LrclibError('network', `HTTP ${res.status}`);
    const type = res.headers.get('Content-Type') ?? '';
    if (!type.includes('json')) throw new LrclibError('malformed', 'not JSON');
    try {
      return await res.json();
    } catch {
      throw new LrclibError('malformed', 'invalid JSON');
    }
  };

  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** Searches by title and/or artist. Returns at most 20 validated results (unreadable records are skipped). */
export async function searchLrclib(
  query: { title?: string; artist?: string },
  deps: LrclibDeps = {},
): Promise<LrclibResult[]> {
  const params = new URLSearchParams();
  const title = query.title?.trim();
  const artist = query.artist?.trim();
  if (!title && !artist) return [];
  if (title) params.set('track_name', title.slice(0, 200));
  if (artist) params.set('artist_name', artist.slice(0, 200));
  const body = await request(`/api/search?${params.toString()}`, deps);
  if (!Array.isArray(body)) throw new LrclibError('malformed', 'expected a list');
  const out: LrclibResult[] = [];
  for (const item of body) {
    const parsed = record.safeParse(item);
    if (parsed.success) out.push(toResult(parsed.data));
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

/** Fetches one record by id (used when a search result carries no lyrics text). */
export async function getLrclib(id: number, deps: LrclibDeps = {}): Promise<LrclibResult> {
  if (!Number.isInteger(id) || id <= 0) throw new LrclibError('not-found', 'bad id');
  const body = await request(`/api/get/${id}`, deps);
  const parsed = record.safeParse(body);
  if (!parsed.success) throw new LrclibError('malformed', 'unexpected shape');
  return toResult(parsed.data);
}
