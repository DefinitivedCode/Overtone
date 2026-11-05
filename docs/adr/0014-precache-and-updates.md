# ADR 0014 — Precache budget and app updates

Status: accepted · Date: 2026-11-05 · Supersedes the budget exception in ADRs 0010 and 0011

## Precache

The shell precached 2.26 MiB against the 2 MiB budget (ADR 0010/0011). Investigation: Vite builds the engine worker as a separate graph, so the Mandarin/Cantonese readers (pinyin-pro `dist-*`, to-jyutping `esm-*`, OpenCC `t2cn-*`) exist twice: once for the worker and once for the main-thread fallback used only if the worker cannot start. The two copies are ≈ 0.77 MiB.

Decision: `scripts/vite/overtone-sw.ts` precaches the worker's copy and **omits main-thread duplicates** (same chunk stem, size within 2 %). The fallback copy is still served and cached the first time it is fetched. Result: **31 URLs, 1.547 MiB** (excluding packs), under budget, with the build warning gone. `offline.spec` asserts ≤ 2 MiB against the real `sw.js` URL list.

Trade-off: if the worker fails _and_ the device is offline _and_ the fallback chunk was never fetched while online, Chinese analysis is unavailable until the user is online once. The worker path (the normal one) is fully precached. Japanese analysis is worker-only.

## Updates

`src/app/updates.ts` registers the worker, detects a waiting worker (`updatefound` → `installed` while a controller exists), and checks at start and when the app becomes visible, at most hourly. The worker never calls `skipWaiting` by itself: `UpdateNotifier` shows "A new version is ready · Reload" only when no `dialog[open]` exists (an Add/Edit sheet or confirmation means the user may be mid-edit), and Settings → About also offers "Reload to update". Reload posts `skip-waiting`, then reloads on `controllerchange`. Data lives in IndexedDB and is untouched.

`update.spec` runs the real build behind a small static server whose `/sw.js` is swapped for a byte-different one (nothing mocked in the browser) and checks: the toast is withheld while the Add sheet has unsaved text, appears after it closes, Reload activates the new worker, and songs survive.

## Not verifiable here

Home Screen update behaviour on a real iPhone (checklist rows 22 and 32 in `docs/IOS_VERIFICATION.md`).
