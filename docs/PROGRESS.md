# Overtone v0.1 — progress log

Branch: `v0.1-implementation`. Nothing has been pushed or deployed.

## Needs human input

_None at present._

## Conflicts between planning documents

- **DESIGN_SYSTEM §6.3 vs PRODUCT_SPEC §5 (accessibility):** section labels are specified in `--text-tertiary`, which is ≈ 3.3:1 on the paper background for 13 px text (fails WCAG AA 4.5:1). Resolved in favour of PRODUCT_SPEC: section labels use `--text-secondary`. (M3)

## Scope deviations

_None. (Tooling deviations are recorded in `docs/adr/0001-stack.md`.)_

---

## M0 — Project scaffold and quality gates — done

Date: 2026-11-05

### Delivered

- Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`), npm, `.nvmrc` (22), `engines`.
- ESLint 9 flat config (typescript-eslint, react-hooks, jsx-a11y, import boundaries per ARCHITECTURE §2, `dangerouslySetInnerHTML` banned), Prettier.
- Vitest projects `unit` (jsdom), `engine` (node), `linguistic` (node); Testing Library, fake-indexeddb, fast-check installed.
- Playwright with `webkit-iphone`, `webkit-iphone-se`, `chromium-mobile`, `chromium-desktop`, run against `build` + `vite preview`; a fixture fails any test that logs `console.error`.
- Scripts: `dev, build, preview, lint, format, typecheck, test, test:ling, e2e, verify`. (`packs` → M7, `brand` → M1; see ADR 0001.)
- `.gitignore` additions, `.github/workflows/ci.yml`, `docs/KNOWN_LIMITATIONS.md`, `docs/adr/0001-stack.md`.

### Verification (actual output)

- `npm run verify`: lint clean, typecheck clean, 1 unit test passed, build OK, 4 e2e passed (webkit-iphone, webkit-iphone-se, chromium-mobile, chromium-desktop).
- Initial JS: 68.6 KB gzip (React + router not yet used).
- Not run: CI workflow (GitHub Actions) has not been executed — nothing pushed.

### Scope deviations / limitations

- ESLint pinned to 9 (jsx-a11y peer constraint). See ADR 0001.

### Follow-ups

- `test:ling` uses `--passWithNoTests` until M5 adds linguistic suites.

---

## M1 — Design foundation, brand assets, app shell — done

Date: 2026-11-05

### Checklist (planned)

Brand pipeline + assets · tokens/base/typography CSS · theme resolution · index.html head, critical CSS, CSP, manifest · UI primitives · shell (router, Library empty state, Settings Appearance + Text size, ErrorBoundary) · platform helpers · contrast + brand tests · E2E theme/axe/overflow.

### Delivered

- `brand/` masters (`icon.svg`, generated `mark.svg`, `wordmark.svg`, `banner.svg`); `npm run brand` (`scripts/brand/`) generates icons (180/192/512/maskable/32), favicon.svg, 10 devices × light/dark splash PNGs, `docs/banner.png`, `public/og.png`, self-hosted Instrument Serif WOFF2 + OFL text, `src/app/splash-links.generated.ts`. ADR 0008.
- `src/styles/{tokens,base,typography}.css` per DESIGN_SYSTEM §3–5 (palette used exactly as specified; all contrast thresholds passed without adjustment).
- Theme System/Light/Dark with `data-theme`, theme-color meta switching, no-flash inline script (CSP-hashed at build), text size (5 steps) — both mirrored in localStorage as the pre-paint source until M2 persists them in Settings.
- `index.html` head per §9.2, inline critical CSS + boot mark; Vite plugin `scripts/vite/overtone-html.ts` emits a base-aware manifest, injects splash links, and (build only) a CSP meta. `VITE_BASE` is honoured by the manifest and router basename (not yet exercised with a non-root base in a test).
- UI primitives in `src/ui/`: Button, IconButton, SegmentedControl (native radios), Sheet (<dialog>, history entry, scroll lock, drag-to-dismiss, half/full detents), ConfirmDialog, Menu, Toast system, TextField, TextArea (autogrow), Switch, Chip/ChipButton, ProgressBar, Skeleton, EmptyState, Banner.
- Shell: React Router, Library (real empty state; no Add button until M3), Settings (Appearance, lyric Text size with live preview), ErrorBoundary recovery UI, `platform/` (standalone, keyboard inset).

### Acceptance criteria covered

- Library empty state and Settings looked finished in WebKit screenshots at 320 and 375 px, light and dark (inspected manually; two defects found and fixed: top-bar button placement, text-size default parsing `Number(null)` = 0).
- Brand script deterministic → `tests/tooling/brand.test.ts` (pass).
- Token contrast → `src/styles/tokens.test.ts` (34 assertions, pass).
- Primitives roles/keyboard → `src/ui/ui.test.tsx` (pass).
- Theme switching, axe (serious/critical) light+dark on both screens, no overflow at 320/375/393/430/768 → `e2e/shell.spec.ts` (pass).

### Verification (actual output)

- `npm run verify`: lint clean; typecheck clean; 57 tests in 4 files passed (unit + tooling); build OK; **72 e2e passed** (18 tests × webkit-iphone, webkit-iphone-se, chromium-mobile, chromium-desktop).
- Bundle: initial JS 86.81 KB gzip (budget 180), CSS 3.58 KB gzip, index.html 1.83 KB gzip.
- Largest generated PNG ≈ 38 KB (limit 200 KB).
- Not run / unavailable: Sheet drag-to-dismiss and focus trap in a **real browser** — jsdom has no real `<dialog>` modal behaviour (emulated), and no screen mounts a Sheet yet; this is covered in M3 `add-song.spec`. No real-device iOS checks.

### Scope deviations / limitations

- Splash device list is from general knowledge of Apple's specs, **not re-checked** against Apple's current page (unmatched devices fall back to a plain background — harmless). Added to KNOWN_LIMITATIONS.
- Prettier is not applied to `src/app/splash-links.generated.ts` (generated; byte-compared by the brand test).
- Library shows the planned empty-state copy but, per "no dead controls", has no Add button until M3.

### Follow-ups

- M2: move theme/text-size source of truth into the Settings record (keep localStorage mirror).
- M3: real-browser Sheet E2E (Escape, drag, history back, focus return).
- M13: large-title collapse, View Transitions, `VITE_BASE` subpath E2E.

---

## M2 — Data layer and backup — done

Date: 2026-11-05

### Checklist (planned)

lyrics parse/diff · Dexie schema v1 + types · repositories (songs, lines, progress, corrections, settings, drafts, meta/marker) · backup format/export/import/migrations/checksum · storage helpers + defensive open · search fold · tests per TEST_STRATEGY §2.1, §2.2, §2.3, §2.6.

### Delivered

- `src/lyrics/parse.ts` (NFC / line endings / control + zero-width stripping with emoji-ZWJ exception, section detection, SHA-1 line keys, limits and user-facing validation messages) and `diff.ts` (LCS summary).
- `src/db/`: schema v1 exactly as ARCHITECTURE §3.3; typed errors (`StorageError` quota/unavailable/blocked/unknown, `ValidationError`); defensive `openDatabase` (retry once after 500 ms, never deletes); `versionchange` hook.
- Repositories: songs (create, details, lyrics edit with preservation, kind overrides, mode/variant, soft delete/undo/purge/purge-at-launch, romanised search suffix), progress (shared keys, per-occurrence counts, reset), corrections (CRUD, active-by-language, orphan list/cleanup), settings (defaults + backfill), drafts, library marker (IndexedDB + localStorage mirror) with recovery check.
- Backup: zod format v1, canonical JSON + SHA-256 checksum, migration registry/harness, export (deterministic), import (validate → preview → merge/replace in one transaction), `overtone-backup-YYYY-MM-DD.json` naming, `recordExport`.
- `src/search/fold.ts`, `src/platform/storage.ts` (persist/estimate/low-space).
- `fixtures/backups/v1.json` (frozen) + README.

### Acceptance criteria covered (data-layer parts; UI parts land in M3)

- Atomicity under injected failures (create, edit lyrics, toggle progress, Replace import, Merge import) → `repositories.test.ts`, `backup.test.ts` (pass).
- Export → wipe → import deep-equals (songs, lines, progress, corrections of every patch type, settings) and a second export is byte-identical → `backup.test.ts` (pass). J11.6 data-layer.
- Edit-preservation matrix: unchanged / changed / inserted / deleted / reordered / duplicated / corrections / kind overrides → `repositories.test.ts` (pass). J7.3, J7.4, J7.5, J8.2 data-layer.
- J2.1, J2.5 (limits), J9.1 (inactive/reactivated corrections), J9.2 data (soft delete/undo/purge), J11.3, J11.5 (newer rejected; migration harness), J12.5 (recovery logic), J12.6 (typed errors) data-layer → tests above.
- J10.1 folding and the 1,000-song filter budget (Node: well under 50 ms) → `fold.test.ts`.

### Verification (actual output)

- `npm run verify`: lint clean, typecheck clean, **207 tests in 9 files passed** (unit + tooling), build OK, **72 e2e passed** (unchanged specs; M2 adds no UI).
- Bundle unchanged: initial JS 86.81 KB gzip (M2 code is not yet imported by the app).
- Not run / unavailable: real-browser IndexedDB (unit tests use fake-indexeddb; real IndexedDB is exercised from M3 E2E). Failure injection covers the main write paths, not every repository function (e.g. purge, reset, corrections).

### Scope deviations / limitations

- Backup `songs[]` carries `languageDetected` (not in the ARCHITECTURE §7 example) so a round trip is lossless; it is optional on import (default false). Format v1 has not shipped, so no version bump.
- `Settings.backup.songsSinceExport` added (ARCHITECTURE §3.2 lists only `changesSinceExport`) to implement the J11.7 "≥ 1 new song or ≥ 10 changes" rule exactly.
- `LineAnalysisCache.analysis` is typed `unknown` until the engine model exists (M5).
- Backup `settings` contains theme, text size and romanisation only; library view state, backup counters and storage state are device-local and excluded.
- Soft-deleted songs are excluded from export and treated as absent by Merge.

### Follow-ups

- M3: wire Settings (theme/text size) to the DB with the localStorage mirror; open DB at startup (openDatabase), run `purgeSoftDeleted`, request persistence after first save, recovery screen.
- A "frozen v1" Dexie schema test exists; add one per future schema version.

---

## M3 — Library, Add Song, Song (plain) — done

Date: 2026-11-05

### Checklist (planned)

Boot (open DB, purge, recovery, settings hydrate) · detection (`engine/segment/detect.ts`) · Library (list, search, language chips + counts, sort, persisted state, empty/no-results, row menu + long-press, backup reminder) · Add Song (paste tab, validation, limits, detection hint, Han choice, discard confirm, draft autosave) · Song screen (original text with sections/blanks/`lang`, ⋯ menu) · Edit details/lyrics (+ summary toast) · Delete with Undo · Settings → Backup (export share/download, import preview merge/replace, last export, storage status) · Recovery screen · e2e + axe + layout.

### Delivered

- `BootGate`: defensive DB open, purge of soft-deleted songs at launch, recovery routing, Settings record as source of truth for theme/text size (localStorage stays the pre-paint mirror; first run adopts the mirror), cross-tab "updated in another window" banner, persistence retry in standalone mode.
- Library, Add Song sheet (Paste tab only; Search/Paste control not rendered until M12), Song screen (mode switcher hidden until M6; progress summary hidden — there is no way to toggle lines yet), Edit details/lyrics sheets, delete-with-Undo hook (purge on toast expiry or next launch), Settings backup section, `ImportFlow` (shared with Recovery), Recovery screen.
- New primitives: `Select` (native), `SearchField`; Toast `onExpire`.
- `src/db/hooks.ts` (live queries), `libraryModel.ts` (filter/sort/counts/reminder), `editSummary.ts`.

### Acceptance criteria covered

See `docs/TRACEABILITY.md` (generated; 26 covered, 14 partial of 73 ACs at this point). M3 plan ACs: J1, J2 (except J2.8), J9, J10, J11, J12.4–12.6 → covered or partially covered as listed there; romanised search (J10.1 "saranghae"), offline (J1.1/J12.1) and J12.6 e2e quota path are explicitly deferred.

### Verification (actual output)

- `npm run verify`: lint clean, typecheck clean, **235 unit/tooling tests passed (13 files)**, build OK, **272 e2e passed** across webkit-iphone, webkit-iphone-se, chromium-mobile, chromium-desktop (specs: shell, library, add-song, edit, backup, recovery, screens).
- Bundle: initial JS **161.7 KB gzip** (budget 180; M2/M3 pulled in zod, dexie, router, lucide). CSS 4.8 KB gzip. Watch this: M5+ code must be lazy-loaded (worker/chunks).
- Visual inspection in WebKit at 375 px (light/dark) of Library, Add sheet, Song screen.
- Bugs found by tests/inspection and fixed: (1) Sheet's history cleanup undid the post-save navigation (`history.back()` after `navigate`); (2) focus was not returned to the opener when a Sheet closed, and Safari does not focus clicked buttons — now remembers the last pressed control; (3) **Add Song used a debounced language detection, so a fast Save could save a song under the previous song's detected language** — detection is now synchronous; (4) e2e races (navigating before an import finished).
- Not run / unavailable: keyboard-only tests are skipped in WebKit (WebKit only tabs to form controls by default); real iOS keyboard/safe-area/share sheet; Reset-progress and "Learned" states are exercised via imported backups because lines cannot be toggled until M6.
- E2E per-test timeout raised from 30 s to 60 s: WebKit specs take ≈ 15 s alone and exceeded 30 s when four projects ran in parallel (the same tests pass in isolation).

### Scope deviations / limitations

- Long-press opens the row menu via a hidden-but-real "More options" button which is also always visible, so deletion/editing is reachable without gestures (accessibility).
- Backup reminder banner is implemented and unit-tested (rule) but not exercised end-to-end (needs 7 days of clock; could use `page.clock` later).
- Song header shows line count only; "N of M lines" arrives with Learn mode (M6).

### Follow-ups

- M4 next (spikes). Keep initial bundle ≤ 180 KB gzip: engine work must stay behind dynamic imports.

---

## M4 — Language engine spikes — done

Date: 2026-11-05

### Delivered

- ADRs 0002–0007 with measured numbers (`docs/adr/`), spike harnesses under `scripts/spikes/` (+ README), starter fixtures `fixtures/linguistic/{ko 60, ja 50, zh 36, yue 40}/starter.json` (all `reviewed: false`, original text).
- Decisions (they supersede LANGUAGE_ENGINE implementation defaults, not product requirements):
  - **Japanese: lindera-wasm (IPADIC) instead of kuromoji.js** — identical accuracy (46/50), 11.4 MB vs 17.0 MB download, +78 MB vs +302 MB Node RSS, works in a module Worker in WebKit and Chromium with no loader shim.
  - **Korean: own rule module** (no package exceeded ~84 % eojeol on the starter set); lindera ko-dic rejected on size (20.8 MB gz vs 8 MB budget).
  - **Mandarin: pinyin-pro with `toneSandhi:false` + opencc-js `t2cn` shadow string**; pinyin-pro fails Traditional polyphones (銀行 xíng etc.) and several Simplified ones, so accuracy needs dictionary-informed correction — threshold ≥ 98 % flagged **at risk** for M7.
  - **Cantonese: to-jyutping** (40/40 on the probe set, native Simplified support, 273 KB gz); opencc not needed for readings.
  - **Dictionaries:** licences and pins confirmed from the files (CC-CEDICT is CC BY-SA **4.0**; kengdic is CC BY-SA 3.0 / LGPL-2.0, differing from the plan); trimmed pack sizes all within budget (ja-core ≈ 21.1 MB of 25).
  - **Ruby:** native `<ruby>` inside `<button>` (WebKit and Chromium, 320/375 px, no overflow or collisions).
- Also delivered ahead of M5: `src/engine/ko/romanise.ts` + `exceptions.ts` (rules 1–10, letter mode) with 93 tests.

### Acceptance

Every ADR has measured numbers and a decision; the "to verify" items of LANGUAGE_ENGINE are resolved or explicitly listed as not measured in the ADRs.

### Verification (actual output)

- `npm run lint` clean; `npm test`: **328 tests passed (14 files)**. Spike scripts re-run and reproduce the ADR numbers (Korean comparison, Chinese probes, tokenizers Node + browser, dictionary sizes, ruby harness).
- Not measured / limits (also stated in the ADRs): heap in browsers; lindera under our CSP and via the service-worker pack route (→ M8); Korean lemma accuracy; self-authored fixtures (circularity of the own-module 100 %); real iOS ruby rendering.

### Scope deviations / limitations

- kuromoji (named as the default in the plan) replaced by lindera-wasm per ADR 0002 — an implementation detail allowed by AUTONOMOUS_AGENT §3.
- Wiktionary licence wording not re-verified beyond kaikki's page (listed under ADR 0006 Open items).
- Spike packages live in `.cache/spikes` (untracked), not in `package.json`.

### Follow-ups

- M5: wire the existing romaniser into the worker pipeline; build eojeol tokenisation, lemma heuristics, particle table; Korean linguistic suite ≥ 120 lines.

---

## M5 — Engine core + Korean + mixed-language routing — done

Date: 2026-11-05

### Delivered

- `src/engine/model.ts` (Token/LineAnalysis + `checkInvariants`), `version.ts`, `cacheKey.ts`; `segment/segment.ts` (script runs with UTF-16 offsets, routing, Han+kana → Japanese segment merge); `analyse.ts` (pure pipeline), `ko/romanise.ts` (rules 1–10, exceptions table, letter mode), `ko/lemma.ts` (particle splitting with batchim agreement, particle gloss table, predicate lemma candidates incl. reverse contractions), `romanLine.ts` (render-time projection; settings never need reprocessing).
- Worker (`worker.ts`, Comlink) + `EngineClient` (≤ 20-line batches, in-flight dedupe, abort/cancel, 60 s idle termination, main-thread fallback if the worker cannot be created or rejects, diagnostics buffer) + `clientDefault.ts` (module Worker, 30 s hidden-page termination).
- `db/repositories/analysis.ts` (cache rows, prune) and `useLineAnalyses` (progressive fill-in; romanised search text written once analysis completes, so "saranghae" finds 사랑해).
- Japanese/Hanja/Chinese segments inside a Korean song, and non-Korean songs in general, are shown as original text with a clear note (`needs-language-data` / `hanja`): real behaviour until M7/M8.
- Linguistic suites: Korean 169 lines, mixed routing 43 lines (`tests/linguistic/ko.test.ts`, `docs/LINGUISTIC_REPORT.md`).

### Acceptance

Korean songs show romanisation above words (Learn mode, M6); Korean suite ≥ 97 % on ≥ 120 lines; worker failure never breaks rendering (client fallback tests).

### Verification (actual output)

- `npm test` (unit + engine + tooling projects): **377 tests passed (15 files)**, including 154 engine tests (invariants as property tests over 4 analysers × 300 random mixed-script strings, client behaviour with fake timers).
- `npm run test:ling`: **6 tests passed**: Korean 169 lines, eojeol 190/190 (100.0 %, circular: see LINGUISTIC_REPORT), mixed routing 99/99 segments.
- Not run / limits: the real Worker is exercised only through the e2e specs (WebKit/Chromium production build); heap/time of Korean processing was not measured separately; the main-thread fallback is unit-tested but not e2e-tested.

### Scope deviations / limitations

- The cache key hashes text with cyrb53 (sync) instead of sha1 (ARCHITECTURE §3.2 is an internal detail).
- `Token` gained an optional `lemmaCandidates` field; lemmas are not set until the dictionary can validate them (M9).
- The Word sheet is not shown (the dictionary arrives in M9) and tokens are not buttons yet (no dead controls).
- WebKit logs an aborted module-worker fetch as a "page error" when a test navigates away mid-load; the e2e fixture filters exactly that message (documented in `e2e/fixtures.ts`); every other console/page error still fails the test.

---

## M6 — Display modes and progress — done

Date: 2026-11-05

### Delivered

- Learn (check button per learnable line with `aria-pressed`, ruby romanisation over each eojeol, learned styling with a check icon, dotted underline for low confidence, `?` marker for unreadable foreign segments, sections/blanks not learnable), Karaoke (romanised only, ≥ 28 px, zero interactive elements, wake lock when supported: MAY, not tested), Clean (Original ⇄ Romanised, selectable text), mode switcher with optimistic state and per-song persistence, scroll anchoring on mode change.
- Progress: header "N of M lines" + bar + "Learned ✓", Library bars/badge, shared keys, Reset with confirmation; optimistic toggles with revert + toast on failure.
- Settings → Romanisation: Korean (Pronunciation / Letter by letter) applied in all modes at render time. Text size applies to lyrics in all modes.
- Notices: songs in a language without data show "Pronunciation for X isn't available yet" and keep progress working.

### Acceptance

J4 (except dictionary parts and the line menu), J5, J6, J7 pass for Korean; see `docs/TRACEABILITY.md` (38 of 73 ACs covered, 15 partial at this point).

### Verification (actual output)

- `npm run verify`: lint clean, typecheck clean, **377 unit/engine/tooling tests passed**, build OK, **336 e2e passed** across webkit-iphone, webkit-iphone-se, chromium-mobile, chromium-desktop (new specs: `modes`, `progress`; axe clean in Learn/Karaoke/Clean/Clean-romanised, light and dark; no horizontal overflow at 320–768 px with Korean long-text fixtures).
- Bundle: main JS **171.6 KB gzip** (budget 180: little headroom; the engine worker is a separate chunk). CSS 5.4 KB gzip.
- Visual inspection in WebKit at 375 px, light/dark (Learn, Karaoke, Clean romanised).
- Bugs found by tests and fixed: (1) a Han run next to kana was not merged into a Japanese segment; (2) live queries rethrew transient IndexedDB errors into render (an aborted transaction on navigation blanked the screen); the hooks now retry once and stay quiet when the page is unloading or the DB was closed deliberately; (3) mode and Korean-setting radios waited for the DB write before reflecting the click (now optimistic); (4) the processing indicator duplicated the toast's `status` role; (5) several tests raced hard navigations against in-flight writes.
- Not done / not verified: J4.8 line long-press menu (SHOULD), deferred to M13; per-width rt-vs-base bounding-box assertions (ADR 0007 measured them in a harness only); scroll anchoring is tested coarsely; real iOS rendering, keyboard and wake lock; Word sheet and token buttons (M9).

### Scope deviations / limitations

- Section labels use `--text-secondary` instead of `--text-tertiary` (WCAG AA; logged under conflicts).
- Hanja and Japanese inside a Korean song are unannotated (documented limitation).
- The ruby tokens are plain `<ruby>` for now; they become `<button>`s with the Word sheet in M9.

### Follow-ups

- M7: packs infrastructure, service worker, Mandarin and Cantonese. The main bundle is at 171.6 KB gzip, so pinyin-pro (140 KB), to-jyutping (273 KB) and opencc t2cn (54 KB) must be lazy chunks loaded by the worker.

---

## M7 — Language packs, Mandarin and Cantonese — done

- [x] Benchmark install in Chromium and WebKit and verify bounded shard lookup and atomic replacement (J12.2–3).
- [x] Verify both languages in Learn, Karaoke and Clean, including offline processing and Mandarin preferences (J4–6, J12.1, J13.3).
- [x] Run the linguistic suites, production browser matrix, accessibility and layout checks, and document the results.

Date: 2026-11-05

### Delivered

- Mandarin and Cantonese pack build, checksummed streaming install, progress, cancellation, update and removal. IndexedDB v2 reads legacy packs offline and publishes staged generations atomically. See ADR 0009.
- Mandarin pinyin and Cantonese Jyutping in Learn, Karaoke and both Clean variants. Mandarin tone numbers and 一/不 sandhi project from cached readings. The E2E expectation now follows CC-CEDICT's neutral `ge5` in 一个 while checking that 一 and 不 both change tone.
- Production offline shell, versioned pack caching, offline manifest fallback, and Settings showing installed packs and available updates. See ADR 0010.

### Install benchmark

Local Windows production preview, with a fresh browser context per run. Times measure the Settings click through the installed state, including download, SHA-256, decode, IndexedDB and UI. The original build was run once per browser and pack with a 180-second cutoff. The final numbers are medians of three runs.

| Engine       | Pack      | Original |     M7 | Final data records |
| ------------ | --------- | -------: | -----: | -----------------: |
| Chromium 156 | Mandarin  |   5.94 s | 0.83 s |                130 |
| Chromium 156 | Cantonese |   5.95 s | 0.82 s |                116 |
| WebKit 27.2  | Mandarin  |   >180 s | 4.03 s |                130 |
| WebKit 27.2  | Cantonese |   >180 s | 3.48 s |                116 |

- Mandarin pack: 203,358 rows, 5.36 MiB gzip (6 MiB budget). Cantonese: 215,170 rows, 3.02 MiB gzip (4 MiB budget, also below it with the reader chunk).
- Warm production worker, 60 distinct fixture lines in batches of 20: Mandarin/Cantonese 279/125 ms in Chromium with the page CPU throttling rate set to 4× and 346/241 ms in WebKit. Worker-specific throttling and device heap were not independently measured.

### Verification

- `npm run verify` passed pack generation, lint, typecheck, 424 unit/engine/tooling tests and the production build. Across WebKit iPhone, WebKit iPhone SE, Chromium mobile and Chromium desktop, 376 browser tests passed and four pre-existing WebKit keyboard-only checks were skipped.
- `e2e/packs.spec.ts` verified download, progress, remove confirmation, retry, automatic analysis after install, offline reopen and new-song analysis, Mandarin options, and all three modes in both languages. No horizontal overflow at 320/375/393/430/768 CSS px and no serious or critical axe issues in light and dark. Settings and lyric mode screenshots were visually inspected at 375 px in WebKit.
- Linguistic verification: 10 tests passed. Mandarin 455/463 (98.3 %), Cantonese 369/369 (100 %), Korean 190/190 and mixed routing 99/99. All Chinese probes, including the Mandarin starter file, are included. See `docs/LINGUISTIC_REPORT.md` for the unreviewed-fixture caveat and remaining differences.

### Scope deviations and limits

- ADR 0009 supersedes the per-row IndexedDB layout in ARCHITECTURE §5.3. The release build retains the earlier schema for offline reads during migration.
- The service worker precaches 2.213 MiB excluding dictionary binaries. ADR 0010 records the M7 exception to the 2 MiB budget. Main JavaScript is 175.95 kB gzip against 180 kB.
- The first full run surfaced a Library search hydration race and an Undo test that could leave the pointer over the toast. The Library keeps text typed before settings arrive. The expiry test moves the pointer away before advancing the clock, preserving the original assertion.
- A `/overtone/` production build retained the installed Mandarin pack in offline Settings after reload in both Chromium and WebKit. Actual iOS Home Screen behaviour and heap measurements remain unverified.

---

## M8 — Japanese — done

Date: 2026-11-05

- [x] Build and install `ja-core` with Lindera/IPADIC and trimmed JMdict.
- [x] Deliver Hepburn, ruby alignment, mixed text, Aozora Add/Edit and preferences in all modes (J2.8, J4–6, J13.3).
- [x] Run the linguistic suites and benchmark production installation, cold offline worker startup and warm analysis.
- [x] Pass the full browser matrix, including offline worker recreation, layout and accessibility checks.

### Delivered

- `ja-core` includes checksummed Lindera 2.0.0/IPADIC and 499,651 JMdict form rows. The worker loads WASM only for Japanese analysis with the pack installed. The service worker makes the loader available on the first offline analysis. IndexedDB publishes the tokenizer reference and dictionary generation together.
- Japanese analysis derives contextual kana and Modified Hepburn from IPADIC, with exact JMdict fallback for unreadable forms, uncertainty markers and mixed English spans. Learn aligns ruby above kanji and shows a separate romaji line. Karaoke and Clean use the same render-time preferences.
- Add and Edit recognise Aozora readings. The stored source and reading preference survive backups and reloads. Identical displayed lines share progress, while distinct pasted readings retain separate analysis. See ADR 0011 for format compatibility and worker behaviour.

### Verification and measurements

- `npm run verify` passed pack generation, lint, typecheck, 446 unit/engine/tooling tests in 19 files and the production build. Playwright passed 392 tests across WebKit iPhone, WebKit iPhone SE, Chromium mobile and Chromium desktop. Four existing WebKit keyboard-only tests were skipped.
- All 16 Japanese browser cases passed. They cover pack requests only when needed, offline first analysis and worker recreation after 60 seconds of idle, pasted readings and persistence, and all three lyric modes. Ruby alignment and horizontal overflow checks passed at 320/375/393/430/768 CSS px. Axe found no serious or critical violations in light and dark. The 375 px WebKit screenshots were visually inspected in both themes.
- `npm run test:ling` passed all 11 tests. Japanese scored 364/365 kanji reading spans (99.73%, threshold 95%) and 156/157 exact romaji lines (99.36%, threshold 85%). The unchanged M4 starter scored 49/50. Three separate poetic probes require a supplied reading. These results measure self-authored fixture agreement, with zero fluent-speaker reviews. See `docs/LINGUISTIC_REPORT.md`.
- Production benchmark on Windows using three fresh profiles per browser, served from loopback. The first worker analysis and all warm batches ran offline after installing in Settings and reloading. Chromium 156.0.8078.4 had page-level 4× CPU throttling during analysis. Worker-specific throttling was not independently verified. WebKit 27.2 ran without throttling. Warm analysis timed three worker requests of 20 lines, excluding the UI and cache writes.

| Median (range), ms                                             |            Chromium |              WebKit |
| -------------------------------------------------------------- | ------------------: | ------------------: |
| Pack install                                                   | 1,821 (1,817–1,842) | 8,077 (8,072–8,078) |
| First offline analysis, including worker and tokenizer startup |       178 (171–190) |       285 (270–310) |
| WASM load and streaming initialisation                         |          33 (32–38) |          72 (58–75) |
| Tokenizer construction                                         |       116 (115–133) |       157 (156–165) |
| Warm analysis, 60 lines                                        |          21 (21–25) |        234 (91–251) |

- WASM linear memory after tokenizer construction was 105,381,888 bytes (100.5 MiB) in both browsers. Chromium CDP sampled about 1.43 MiB of used worker JavaScript heap and 0.68 MiB of embedder heap after analysis. This snapshot proxy is under the 150 MB budget and excludes unmeasured process overhead. WebKit JS heap and native iOS memory were unavailable. Reproduce with `node scripts/spikes/japanese-production.mjs dist 3` after the production build.
- A production build under `/overtone/` passed cold offline analysis in both Chromium and WebKit after installing in Settings.
- `ja-core` is 24.87 MiB compressed against 25 MiB. Initial JavaScript is 153.36 kB gzip against 180 kB. The shell precaches 2,374,008 bytes (2.264 MiB), excluding dictionary binaries. See the continuation of the M7 precache exception in ADR 0011.

### Scope deviations and limits

- WebKit lost verified tokenizer entries after reload when installation started in an uncontrolled page. The installer now waits for service-worker control. The manifest request can finish after navigation, which resolved a separate WebKit cancellation error. See ADR 0011.
- Browser regressions exposed races around hard reload, offline emulation and the Undo clock. The tests now wait for the relevant state, start cold reloads offline and use the app's actual Undo timer. The expiry, reload, layout and accessibility assertions remain in place.
- Desktop browser timings and the worker memory snapshot are proxies. Native iOS standalone storage, memory and rendering remain unverified. See `docs/KNOWN_LIMITATIONS.md` for Japanese reading ambiguity and resource recovery.

---

## UX refinement checkpoint (between M8 and M9) — done

Date: 2026-11-05. Triggered by the owner's manual preview.

- Learn: reading-first layout (default) with English in the reading row, or original-first, chosen in Settings. Karaoke: Korean "Split into syllables" toggle (persisted, Karaoke-only). Chips read KR/JP/CN/HK (full names for assistive tech; stored codes unchanged). Settings regrouped into Lyrics & appearance, Pronunciation (per-language disclosures), Offline language downloads, Backup & storage, About & licences. See ADR 0012.
- Tests: 449 unit/engine/tooling (3 new); browser suite 392 passing before the test updates below, with 8 failures that were stale expectations (22→24 px Learn size, controls now behind disclosures); updated and re-run for modes, packs and screens. Changed expectations reflect the requested design change, not weakened assertions.
- Not verified: real iPhone rendering of the new Learn layout (WebKit desktop emulation only).
