# ADR 0015 — LRCLIB lyrics search

Status: accepted · Date: 2026-11-05

## Verified against the live service (2026-11-05)

- `OPTIONS /api/search` answers 200 with `access-control-allow-origin: *` and `access-control-allow-headers: content-type,x-user-agent,lrclib-client,lrclib-app-id,lrclib-api-key`, so the custom **`Lrclib-Client`** header passes the CORS preflight and the planned fallback ("drop the header") is not needed.
- `GET /api/search?track_name=&artist_name=` returns a JSON array whose records already contain `plainLyrics` and `syncedLyrics`, so picking a result needs no second request. `access-control-expose-headers: retry-after` lets the browser read `Retry-After`.

## Decisions

- `src/online/lrclib.ts` is the only code that talks to the service: zod-validated records (unknown fields ignored, bad records skipped, ≤ 20 results), `AbortController` 10 s timeout, a sequential queue with ≥ 500 ms between request starts, `credentials: 'omit'`, `cache: 'no-store'`, `referrerPolicy: 'no-referrer'`. `GET /api/get/{id}` is implemented but unused by the UI because search results carry the lyrics.
- **429:** the wait is `Retry-After` (seconds or HTTP date; 30 s if absent) plus up to 1 s of jitter. The client refuses further calls until it has passed, and the UI shows a countdown on a disabled Retry. Nothing retries automatically.
- Every failure has its own message (offline, timeout, rate limit, not found, server, unreadable reply, network).
- Fetched text is untrusted: normalised like pasted lyrics (control and zero-width characters removed, NFC), capped at 20,000 characters, rendered only as React text. Synced (LRC) text is stored untouched in `source.syncedLyrics` (≤ 200,000 chars) and not displayed.
- The service worker never handles `lrclib.net` (cross-origin requests are not intercepted), so responses are never cached by the app. Manual entry has no dependency on the service; the Search tab is a second tab of the Add sheet and shows an offline state without making a request.
- Nothing is saved until the user taps Save; picking a result only prefills the editable form (tab label "Paste text", so the lyrics field stays the only control named "Lyrics").
- The client identifies itself as `Overtone/<version> (https://github.com/DefinitivedCode/Overtone)`, the project's repository.

## Limits

Lyrics are user-contributed with no stated licence; the Search tab says so and the app stores only what the user explicitly saves. A live smoke test exists but only runs with `OVERTONE_LIVE_LRCLIB=1`; all CI tests use mocked responses.
