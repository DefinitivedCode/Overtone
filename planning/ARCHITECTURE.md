# Overtone — Architecture

This document defines how Overtone is built. Product behaviour lives in [PRODUCT_SPEC.md](PRODUCT_SPEC.md); language-processing internals in [LANGUAGE_ENGINE.md](LANGUAGE_ENGINE.md).

---

## 1. Summary

Overtone is a **static, client-only Progressive Web App**. There is no backend.

```
┌──────────────────────────── Main thread (UI) ───────────────────────────┐
│  React views ── hooks ── repositories (Dexie) ── IndexedDB "overtone"   │
│       │                        ▲                                        │
│       │ processSong(lines)     │ write LineAnalysis                     │
│       ▼                        │                                        │
│  EngineClient (typed RPC) ─────┼────────────────────────────────────┐   │
└────────────────────────────────┼────────────────────────────────────┼───┘
                                 │ postMessage                        │
┌──────────────────────── Engine Web Worker ──────────────────────────▼───┐
│  segmenter (script runs) → language router → per-language analyser     │
│  ko: romaniser + lemma heuristics   ja: tokenizer + furigana + hepburn  │
│  zh: pinyin-pro / to-jyutping       dict: IndexedDB pack tables          │
└─────────────────────────────────────────────────────────────────────────┘
┌──────────────────────── Service Worker (Workbox) ───────────────────────┐
│  precache app shell · runtime cache /packs/* (CacheFirst, versioned)     │
└─────────────────────────────────────────────────────────────────────────┘
Static host (HTTPS): index.html, hashed assets, /packs/<lang>/<version>/…
External (optional, user-initiated): https://lrclib.net/api/*
```

Key decisions:

| Decision | Choice | Why |
|---|---|---|
| Backend | None | All requirements are satisfiable on-device; avoids cost, privacy exposure and accounts. LRCLIB is CORS-enabled (`Access-Control-Allow-Origin: *`) so no proxy is needed. |
| UI framework | React + TypeScript (strict) | Mature, well-known by the implementing agent, good testing ecosystem. Overtone's UI is moderately complex (sheets, token interactions, virtualised-ish lists) and benefits from components. |
| Build | Vite | Fast, first-class worker and WASM support, `vite-plugin-pwa`. |
| Persistence | IndexedDB via **Dexie** | Mature, Apache-2.0, versioned schema upgrades, transactions, compound indexes, `liveQuery` for reactive UI. Raw IndexedDB is too error-prone; `idb` lacks migration ergonomics and reactivity. |
| Service worker | `vite-plugin-pwa` (Workbox), `injectManifest` strategy, `registerType: 'prompt'` | Precache with hashed revisions, custom runtime routes for packs, controlled update prompt. |
| Language processing | Dedicated module worker, lazy-loaded per language | Keeps the UI thread at 60 fps; isolates large dictionaries; can be terminated to release memory. |
| Validation | **zod** | Import validation, LRCLIB response validation, settings. Small, typed. |
| Routing | **React Router** (library/declarative mode) | Mature; we need 4–5 routes, history integration, scroll restoration hooks. |
| Styling | CSS Modules + global design tokens as CSS custom properties | Full control over ruby/annotation layout and iOS specifics; no runtime CSS-in-JS cost. No Tailwind: the lyric layout is bespoke and tokens are few. |
| Worker RPC | **Comlink** | Tiny, Apache-2.0, typed proxies over `postMessage`. |
| Tests | Vitest + Testing Library + fake-indexeddb; Playwright (WebKit + Chromium) + @axe-core/playwright | See TEST_STRATEGY.md. |

Versions: use the current stable major of each dependency at implementation time; pin exact versions in `package.json` and commit the lockfile. Do not use pre-release versions.

---

## 2. Repository layout

```
/
├─ planning/                 # these documents (read-only for the implementer except status notes)
├─ docs/                     # living docs created during implementation
│  ├─ adr/                   # architecture decision records (spike outcomes etc.)
│  ├─ KNOWN_LIMITATIONS.md
│  └─ PROGRESS.md            # milestone status log (see AUTONOMOUS_AGENT.md)
├─ brand/                    # master SVGs (icon, mark, wordmark, banner) — source of truth
├─ scripts/
│  ├─ brand/generate-assets.ts      # SVG → PNG icons, splash screens, OG image
│  └─ packs/                        # dictionary/pack build pipeline (Node)
│     ├─ fetch-sources.ts           # downloads pinned sources with SHA-256 checks into .cache/
│     ├─ build-ja.ts  build-ko.ts  build-zh.ts  build-yue.ts
│     └─ manifest.ts               # writes public/packs/manifest.json
├─ public/
│  ├─ icons/  splash/  favicon.svg  og.png
│  └─ packs/                 # generated, gitignored; produced by `npm run packs`
├─ src/
│  ├─ main.tsx  App.tsx  routes.tsx
│  ├─ app/                   # shell: layout, theming, update prompt, storage health, error boundary
│  ├─ features/
│  │  ├─ library/            # Library screen, search, filters, sort, song row
│  │  ├─ add-song/           # Add sheet, manual form, draft autosave, online search tab
│  │  ├─ song/               # Song screen, mode switcher, Learn/Karaoke/Clean views
│  │  ├─ word/               # Word sheet, Correction sheet
│  │  └─ settings/           # Settings, backup, packs, about/licences
│  ├─ ui/                    # design-system primitives: Button, Sheet, Menu, Toast, SegmentedControl, Icon…
│  ├─ db/
│  │  ├─ schema.ts           # Dexie class, versions & upgrades
│  │  ├─ types.ts            # persisted record types
│  │  ├─ repositories/       # songs.ts, lines.ts, progress.ts, corrections.ts, settings.ts, drafts.ts
│  │  └─ backup/             # export.ts, import.ts, format.ts (zod), migrations/
│  ├─ engine/
│  │  ├─ client.ts           # EngineClient (main thread), job queue, status store
│  │  ├─ worker.ts           # worker entry, Comlink expose
│  │  ├─ model.ts            # Token, Segment, LineAnalysis types (shared)
│  │  ├─ segment/            # script-run segmentation, language detection
│  │  ├─ ko/ ja/ zh/ yue/    # per-language analysers
│  │  ├─ dict/               # pack loader, IndexedDB dictionary tables, lookup API
│  │  ├─ overlay.ts          # apply user corrections to generated analysis
│  │  └─ version.ts          # ENGINE_VERSION per language
│  ├─ lyrics/
│  │  ├─ parse.ts            # raw text → lines (kind: lyric|section|blank), normalisation, line keys
│  │  ├─ diff.ts             # old vs new lines for edit-preservation
│  │  └─ aozora.ts           # Aozora ruby extraction (Japanese)
│  ├─ online/lrclib.ts       # LRCLIB client (zod-validated)
│  ├─ search/                # normalisation & in-memory search index
│  ├─ platform/              # iOS/standalone detection, visualViewport, share/download, wake lock, persist()
│  ├─ styles/                # tokens.css, base.css, typography.css
│  └─ test/                  # test utilities, fixture loaders
├─ fixtures/
│  ├─ linguistic/{ko,ja,zh,yue,mixed}/*.json   # gold annotations (TEST_STRATEGY.md §4)
│  └─ backups/               # sample backups of every schema version
├─ e2e/                      # Playwright specs
└─ sw.ts                     # service worker source (injectManifest)
```

Module boundary rules (enforced with ESLint `no-restricted-imports`):

- `engine/**` must not import from `features/**`, `ui/**` or `db/**` except `engine/dict` which owns its own Dexie database (see §5.3).
- `features/**` talk to storage only via `db/repositories`, never `db/schema` directly.
- `ui/**` primitives import nothing from `features/**`, `db/**`, `engine/**`.

---

## 3. Domain model

### 3.1 Lyrics parsing

`lyrics/parse.ts` turns raw text into an ordered list of lines:

```ts
type LineKind = 'lyric' | 'section' | 'blank';
interface ParsedLine {
  index: number;        // 0-based position in the song
  text: string;         // exact display text (NFC, no trailing \n)
  kind: LineKind;
  key: string;          // stable content key, see below; '' for blank
}
```

- **Normalisation for storage:** NFC; `\r\n|\r` → `\n`; strip C0/C1 control characters except `\n` and `\t`; strip zero-width chars except ZWJ inside emoji sequences; trim trailing whitespace at end of file only. Everything else is preserved.
- **Section detection:** a line is `section` if, after trim, it is (a) a square/lenticular-bracketed label `^[\[【［].{1,40}[\]】］]$`, or (b) a parenthesised or bare line whose content is a known label, optionally followed by a number, artist name after `:`/`-`, or repeat marker (`Chorus`, `Verse 2`, `Hook`, `Bridge`, `Pre-Chorus`, `Intro`, `Outro`, `Rap`, `Repeat`, `x2`, `×2`, `후렴`, `サビ`, `副歌`, `間奏`, `Jungkook:` …; case-insensitive). Parenthesised lyric text such as `(I love you)` or `(사랑해)` stays a lyric line — backing vocals are lyrics. Users can toggle a line's kind in Edit (stored as a `kindOverride`).
- **Line key:** `key = sha1(NFKC(lowercase(text)) with internal whitespace collapsed and outer whitespace + trailing punctuation trimmed)` (hex, first 16 chars). Use Web Crypto `subtle.digest` (async) — compute at save time, store on the line. Identical-looking lines share a key → shared progress (PRODUCT_SPEC J7.3) and shared analysis cache.

### 3.2 Persisted records (`db/types.ts`)

```ts
type LangCode = 'ko' | 'ja' | 'zh' | 'yue';           // song primary language
type SegLang  = LangCode | 'en' | 'other' | 'none';  // per-segment language
type DisplayMode = 'learn' | 'karaoke' | 'clean';

interface Song {
  id: string;                 // UUID v4 (crypto.randomUUID)
  title: string;
  artist: string | null;
  language: LangCode;         // resolved (Auto-detect is resolved at save time)
  languageDetected: boolean;  // true if user kept auto-detect result
  rawLyrics: string;          // normalised original text (source of truth)
  lineCount: number;          // learnable lines (cached for library)
  learnedCount: number;       // learned learnable lines (cached for library; recomputed transactionally)
  displayMode: DisplayMode;
  cleanVariant: 'original' | 'romanised';
  source: { kind: 'manual' } |
          { kind: 'lrclib'; trackId: number; fetchedAt: number;
            syncedLyrics: string | null; duration: number | null; album: string | null };
  searchText: string;         // denormalised, see §8
  createdAt: number; updatedAt: number; openedAt: number;   // epoch ms
  deletedAt: number | null;   // soft delete for Undo
}

interface Line {
  id: string;                 // `${songId}:${index}` — positions are rewritten on edit
  songId: string;
  index: number;
  text: string;
  kind: LineKind;
  kindOverride: LineKind | null;
  key: string;
}

interface Progress {          // one row per learned line key per song
  songId: string;
  lineKey: string;
  learnedAt: number;
}

interface Correction {
  id: string;                 // UUID
  songId: string;
  lineKey: string | null;     // null = applies to all lines in song (scope "whole song")
  surface: string;            // original surface the correction targets
  occurrence: number | null;  // nth occurrence of surface within the line (0-based); null = all in scope
  language: LangCode;         // song language when created (inactive if song language changes)
  patch: {
    reading?: string;         // kana / pinyin / jyutping / RR
    romanisation?: string;
    gloss?: string;
    glossMode?: 'replace' | 'prepend';
    segLang?: SegLang;        // override language for this span
    split?: number[];         // split surface at these UTF-16 offsets
    mergeWithNext?: number;   // merge this token with the next N tokens
  };
  createdAt: number; updatedAt: number;
}

interface LineAnalysisCache {      // derived data — safe to delete at any time
  cacheKey: string;                // `${lang}|${engineVersion}|${settingsHash}|${lineKey}|${sha1(text)}`
  songId: string;                  // for cleanup
  analysis: LineAnalysis;          // see LANGUAGE_ENGINE.md §3
  createdAt: number;
}

interface Settings { id: 'app'; theme; textSize; romanisation: {...}; library: { query, filter, sort };
                     backup: { lastExportAt: number | null; changesSinceExport: number; reminderDismissedAt: number | null };
                     storage: { persistRequested: boolean; persisted: boolean | null }; }

interface Draft { id: 'add-song'; title; artist; language; lyrics; updatedAt; }
```

Why keyed by **content** rather than position:
- Progress and corrections survive line reordering, insertion and deletion around them (§6.4).
- The analysis cache is shared between duplicate lines.

### 3.3 Dexie schema v1 (`db/schema.ts`)

```ts
db.version(1).stores({
  songs:       'id, language, updatedAt, createdAt, openedAt, deletedAt',
  lines:       'id, songId, [songId+index], [songId+key]',
  progress:    '[songId+lineKey], songId',
  corrections: 'id, songId, [songId+lineKey]',
  analysis:    'cacheKey, songId',
  settings:    'id',
  drafts:      'id',
  meta:        'key'            // { key: 'libraryMarker', value: { everHadSongs: true, lastCount } }, schema info
});
```

Migration policy:
- Every schema change adds a new `db.version(n)` with an `.upgrade(tx => …)` function; never edit a shipped version.
- Each upgrade has a test that seeds data in version n-1 (using a frozen fixture), opens with version n, and asserts the result.
- `analysis` may be cleared in any upgrade (it is derived).
- Handle `blocked`/`versionchange`: if another tab holds an older connection, close our connection on `versionchange` and show "Overtone was updated in another window — reload".

---

## 4. Processing pipeline

### 4.1 Flow

1. **Save** (`songs.create`): one transaction writes the `Song` and its `Line[]`. Returns immediately.
2. **Schedule**: `EngineClient.ensureAnalysed(songId)` is called when a song is opened (and opportunistically after save). It loads lines, computes cache keys, finds misses.
3. **Worker**: misses are sent in batches of ≤ 20 lines: `analyseLines({ lang, lines: [{key, text}], options, userReadings })`. The worker lazily initialises the language analyser (loading packs if needed) and returns `LineAnalysis[]`.
4. **Persist**: results are written to `analysis`. UI subscribed through `liveQuery` re-renders lines as they arrive (progressive fill-in).
5. **Overlay**: at render time, `overlay.apply(analysis, corrections)` produces the final tokens. Corrections are never baked into the cache, so engine upgrades and corrections compose cleanly.

### 4.2 Worker lifecycle

- Created on first need; one worker for all languages (avoids duplicating shared code). Memory: Japanese tokenizer + dictionaries are the heavy part.
- Terminated after 60 s idle, or when `visibilitychange` → hidden for > 30 s, to release memory (iOS kills memory-heavy pages). Re-created on demand.
- Job queue on the client: dedupe by `cacheKey`; prioritise the currently open song; cancel jobs for songs that are no longer open (except the post-save job).
- Errors: an analyser exception for a line yields a `LineAnalysis` with `status: 'failed'` and raw-text tokens, so rendering always works. Failures are logged to an in-memory diagnostics buffer viewable in Settings → About → Diagnostics (no remote logging).

### 4.3 Engine versioning

`engine/version.ts` exports `ENGINE_VERSION = { ko: 1, ja: 1, zh: 1, yue: 1, segment: 1 }` plus the pack versions. Any change to analyser output bumps the relevant version; stale cache entries are ignored (and garbage-collected on idle).

### 4.4 Settings that affect output

Romanisation preferences (macrons, tone numbers, sandhi, Korean transliteration mode) are applied as a **render-time projection** where possible (e.g. pinyin tone-mark vs number is a pure function of the stored syllable+tone), so changing them does not require re-analysis. Only settings that change analysis itself contribute to `settingsHash` (none in v0.1 by design; keep it in the key for future use).

---

## 5. Language resources ("packs")

### 5.1 What a pack is

A pack is a versioned set of static files under `/packs/<lang>/<version>/`, listed in `/packs/manifest.json`:

```json
{ "packs": [
  { "id": "ja-core", "lang": "ja", "version": "2026.11.1", "bytes": 0, "files": [
      { "path": "ja/2026.11.1/tokenizer/base.dat.gz", "bytes": 0, "sha256": "…", "role": "tokenizer" },
      { "path": "ja/2026.11.1/dict.jsonl.gz", "bytes": 0, "sha256": "…", "role": "dictionary" } ],
    "sources": [{ "name": "JMdict", "licence": "CC BY-SA 4.0 (EDRDG)", "url": "…", "version": "…" }] } ] }
```

(Byte sizes are filled in by the build; the plan does not assume them — see LANGUAGE_ENGINE.md §9 for budgets.)

Packs per language: `ja-core` (tokenizer data + JMdict), `ko-core` (dictionary + lemma tables), `zh-core` (CC-CEDICT, segmentation word list if needed), `yue-core` (CC-Canto + CC-CEDICT Cantonese readings). Libraries bundled as JS (pinyin-pro, to-jyutping, wanakana, the Korean romaniser) are code-split chunks loaded by the worker; their embedded data travels in the JS chunk and is precached as part of the app shell only if it is under 1 MB gzip, otherwise it is treated as a runtime-cached pack file.

### 5.2 Download and storage

- Tokenizer data files (binary) live in **Cache Storage** (`overtone-packs-v1` cache) via the service worker's CacheFirst route for `/packs/`. The kuromoji (or chosen tokenizer) loader fetches them by URL; the SW serves them offline.
- Dictionary data is downloaded once, stream-decompressed with `DecompressionStream('gzip')` (supported in Safari 16.4+; fallback: `fflate` if a spike finds gaps), parsed line by line (JSON Lines), and bulk-inserted into the **dictionary database** `overtone-dict` (a separate Dexie DB owned by `engine/dict`). Rationale: keyed lookups in IndexedDB are fast and memory-cheap; holding a full JMdict in JS memory on a phone is not acceptable.
- A separate DB means the user library DB stays small, its migrations never touch dictionary data, and dictionary data can be dropped and rebuilt without risk to user data.
- Install is resumable per file and atomic per pack: rows are written with `packVersion`; the pack is marked `installed` in `overtone-dict.meta` only after all rows are in. Old versions are deleted after the new one is installed.
- Before downloading, check `navigator.storage.estimate()`; if free quota < 3 × pack size, warn.
- Settings → Offline language data shows each pack (status, version, size on disk estimate) with Download / Update / Remove.

### 5.3 Dictionary tables (`overtone-dict`)

```ts
version(1).stores({
  entries: '++rowId, [lang+form], [lang+entryId], packVersion', // one row per (form → entry) mapping
  meta:    'key'
});
// entries row: { lang, form, entryId, reading, senses: [{pos, glosses[]}], freq, packVersion }
```

Lookup returns candidates ordered by: exact form + matching reading > exact form > lemma form > frequency.

---

## 6. State and data flow in the UI

### 6.1 Reactive reads

Views read through small hooks (`useSongs(query)`, `useSong(id)`, `useLines(songId)`, `useLineAnalyses(songId)`, `useProgress(songId)`, `useCorrections(songId)`) built on Dexie `liveQuery` via `dexie-react-hooks`. No global state library: IndexedDB is the store; ephemeral UI state stays in components. A tiny `zustand`-style store is **not** needed; do not add one unless a concrete need appears (record an ADR).

### 6.2 Writes

All writes go through repository functions that run Dexie transactions and maintain denormalised fields (`Song.learnedCount`, `Song.searchText`, `Song.updatedAt`, `meta.libraryMarker`, `Settings.backup.changesSinceExport`).

### 6.3 Progress operations

- `toggleLearned(songId, lineKey)`: in one `rw` transaction over `progress` + `songs`: add/remove the row, recompute `learnedCount` by counting lyric lines whose key is in progress (O(lines), fine).
- Progress never references line ids, so it is immune to re-indexing.

### 6.4 Editing lyrics with progress preservation

`songs.updateLyrics(songId, newRaw)`:

1. Parse new text into lines with keys.
2. Diff old vs new (`lyrics/diff.ts`, Myers/LCS on keys) — used only to produce the user-facing summary (unchanged / changed / added / removed counts).
3. In one transaction: replace `lines` for the song; delete `progress` rows whose `lineKey` no longer exists in the new lyric lines; keep the rest; recompute `learnedCount`; corrections whose `lineKey` disappeared are **kept but orphaned** (they are harmless and allow undo/redo of an edit) and are purged when the song is deleted or via "Clean up unused corrections" in song menu. Analysis cache entries are left for GC.
4. Show the toast summary (PRODUCT_SPEC J7.5).

Trade-off recorded: a one-character typo fix in a line resets that line's progress. We accept this for v0.1 because similarity-based carry-over risks marking genuinely different lines as learned. An ADR can revisit with a "carry progress to edited lines" checkbox in the edit summary (MAY).

### 6.5 Routing and scroll restoration

Routes: `/` (Library), `/song/:id` (Song, mode in state not URL), `/settings`, `/settings/licences`. The Add sheet and Word/Correction sheets are modal overlays, not routes. Installed iOS PWAs have **no** browser back button and no reliable edge back-swipe, so every non-root screen has its own visible Back control and every sheet has a visible close control. Sheets also push a history entry (`history.pushState` with a `sheet` marker) so Android/desktop back buttons close them; closing the sheet pops it.

Scroll positions are saved per route key in memory (and `sessionStorage` for the Library) and restored on back navigation. Song screen restores the last scroll position per song and mode within the session.

---

## 7. Backup format (export/import)

The app is account-free; this format is the only transfer and backup mechanism.

```jsonc
{
  "format": "overtone-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-11-05T10:00:00.000Z",
  "app": { "name": "Overtone", "version": "0.1.0" },
  "settings": { /* Settings minus device-specific storage state */ },
  "songs": [{
    "id": "uuid", "title": "…", "artist": "…", "language": "ja",
    "rawLyrics": "…", "lineKindOverrides": [{ "index": 3, "kind": "section" }],
    "displayMode": "learn", "cleanVariant": "original",
    "source": { "kind": "manual" },
    "createdAt": 0, "updatedAt": 0, "openedAt": 0,
    "progress": [{ "lineKey": "…", "learnedAt": 0 }],
    "corrections": [{ /* Correction without songId */ }]
  }],
  "checksum": "sha256 of canonical JSON of songs+settings"
}
```

Rules:
- Derived data (analysis cache, dictionaries, `searchText`, counts, line rows) is **not** exported; it is rebuilt on import from `rawLyrics` (+ `lineKindOverrides`). Line keys are recomputed with the same function, so progress keys match. The key function is therefore part of the format contract: changing it requires a backup `schemaVersion` bump and a migration that remaps keys via the old function (keep old key functions in `db/backup/migrations/`).
- Validation (zod) runs before any write: format id, `schemaVersion` integer, all fields typed, string length limits (as PRODUCT_SPEC J2.5), ≤ 5,000 songs, file ≤ 50 MB, checksum match (mismatch → warn and allow "Import anyway" since hand-edited backups are legitimate).
- `schemaVersion` > supported → reject. Lower → run `migrations[v]` sequentially.
- Merge semantics: song id match → keep record with newer `updatedAt` for text/details; **union** progress keys; union corrections by id (newer `updatedAt` wins). No id match → insert.
- Replace semantics: in one transaction clear `songs`, `lines`, `progress`, `corrections`, `analysis` and insert all.
- Export filename: `overtone-backup-YYYY-MM-DD.json`; pretty-printed with 2-space indent (human-inspectable; size is small).

---

## 8. Search

Personal libraries are small (tens to low thousands of songs). An in-memory index is sufficient; no search library is needed.

- `Song.searchText` is computed on save/edit/analysis completion: `fold(title + artist + rawLyrics + romanisedText)` where `fold` = NFKC → lowercase → strip combining marks (removes pinyin tone marks and macrons) → katakana→hiragana → collapse whitespace. Romanised text is filled in when analysis completes (so search improves after processing; documented).
- Query is folded the same way and matched by substring over each token of the query (AND semantics).
- Library list loads `songs` (excluding `rawLyrics` via a projection — Dexie returns whole objects, so keep `rawLyrics` and `searchText` in the songs table but read the list once into memory; 1,000 songs × ~5 KB = 5 MB worst case, acceptable). If profiling shows otherwise, split `searchText` into its own table (ADR).

---

## 9. Service worker and updates

- `sw.ts` (Workbox via `injectManifest`):
  - `precacheAndRoute(self.__WB_MANIFEST)` for HTML, JS, CSS, fonts, icons.
  - Navigation route: `NetworkFirst` with 3 s timeout falling back to precached `index.html` (SPA fallback) — guarantees offline startup while allowing quick updates.
  - `/packs/**`: `CacheFirst` in `overtone-packs-v1`, no expiration (explicit management from Settings).
  - Never cache `lrclib.net` responses in the SW (the app stores what the user saves).
- Update flow: `registerType: 'prompt'`. When a new SW is waiting, show a toast "A new version is ready · Reload". If the user is editing (Add sheet or Edit lyrics open with unsaved changes), defer the toast until they finish. Reload calls `updateSW(true)` (skipWaiting + reload).
- Check for updates on app start and on `visibilitychange` → visible (throttled to once per hour).
- Precache budget: ≤ 2 MB excluding packs.

---

## 10. Storage safety

Facts (WebKit, verify during M11): Home Screen web apps get their own storage separate from Safari; WebKit may grant `navigator.storage.persist()` based on heuristics such as being a Home Screen app; origins in persistent mode are exempt from eviction; non-persistent script-writable storage can be evicted (Safari's tracking-prevention policy can remove storage of sites not interacted with for 7 days — Home Screen apps are treated differently, but do not rely on it).

Measures:
1. Request persistence after the first successful song save, and again on each launch in standalone mode if not granted (cheap; result cached in settings).
2. Library marker: `meta.libraryMarker = { everHadSongs, lastCount, lastSeenAt }` in IndexedDB **and** mirrored in `localStorage`. On start, if songs count is 0 and either marker says `everHadSongs`, show the recovery screen (PRODUCT_SPEC J12.5). (Both may be evicted together; the mirror still catches partial evictions and DB corruption.)
3. Backup reminders (J11.7).
4. Defensive open: wrap `db.open()`; on `InvalidStateError` / `UnknownError` (seen in some WebKit versions after OS updates) retry once after 500 ms, then show a recovery screen with "Try again" and diagnostics. Never auto-delete a database that failed to open.
5. Quota errors (`QuotaExceededError`) are caught at the repository layer and surfaced; offer to remove language packs (the largest consumers) before anything else.

---

## 11. Security

- **CSP** (via `<meta http-equiv>` in `index.html` and, where the host supports headers, an `_headers` file):
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://lrclib.net; worker-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` (`frame-ancestors` only effective as a header). Drop `'wasm-unsafe-eval'` if no WASM dependency is selected. `'unsafe-inline'` for styles is needed for React inline style props used in layout; avoid if feasible.
- All user and fetched text rendered via React text nodes. `dangerouslySetInnerHTML` is banned by lint rule.
- LRCLIB responses validated with zod; unknown fields ignored; lyrics capped and normalised exactly like pasted lyrics.
- Requests to LRCLIB identify the client: browsers do not allow setting `User-Agent` from `fetch`, so send the documented alternative header `Lrclib-Client: Overtone/<version> (<homepage URL>)`. (This custom header triggers a CORS preflight; LRCLIB docs list it as supported — verify in M12 and fall back to no header if preflight fails.)
- Imported JSON: size limit, schema validation, ids validated as UUIDs, no prototype-polluting keys (`__proto__`, `constructor`) — zod strips unknown keys.
- External links (`target="_blank" rel="noopener noreferrer"`) only for licence/source pages.
- No secrets exist in the app. No `.env` values are needed for v0.1.

---

## 12. Extensibility (designed for, not built)

| Future feature | Seam already present |
|---|---|
| Timed lyrics / sync highlighting | `Song.source.syncedLyrics` stored; `Line.index` stable per version; add `timings` table keyed by `[songId+index]` later. |
| Local MP3 / audio | Add `media` table with Blob; Song screen header has space for a transport bar. |
| YouTube embeds | CSP change + `media` record with videoId; no current dependency. |
| Vocabulary collections / SRS | Word sheet already resolves `entryId` per token → future "Save word" writes `vocab` rows referencing `{lang, entryId, surface, songId, lineKey}`. |
| Statistics | `Progress.learnedAt` timestamps already recorded. |
| Cross-device sync | Out of scope by product decision (account-free). Backup format with ids + `updatedAt` + union merge semantics already behaves like a manual sync; a future sync would reuse it. |

Do not build tables, routes or UI for these in v0.1.

---

## 13. Hosting and build

- Static hosting on any HTTPS host with SPA fallback. Recommended: **Cloudflare Pages** or **GitHub Pages** (both free). Configure base path via `VITE_BASE` (GitHub project pages need `/<repo>/`); all asset, manifest `start_url`/`scope`, and SW paths must respect it.
- `npm run packs` builds language packs from pinned sources (downloaded into `.cache/`, gitignored, verified by SHA-256). Generated `public/packs/` is gitignored; CI and deploy run `npm run packs` before `npm run build`. Source files' URLs, versions and checksums are pinned in `scripts/packs/sources.json`.
- `npm run brand` regenerates icons/splash/OG images from `brand/*.svg`; outputs are committed (small, deterministic) so builds don't need native image tooling.
- Deployment itself is a human action (it needs the user's hosting account). The implementer prepares config and documents the steps in the root README.
