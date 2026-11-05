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
