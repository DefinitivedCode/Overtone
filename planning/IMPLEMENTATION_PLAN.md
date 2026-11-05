# Overtone — Implementation Plan

Ordered milestones. Each must be **done** (definition of done met, `npm run verify` green, `docs/PROGRESS.md` updated, committed) before the next starts, except where "may run in parallel" is stated.

The sequence delivers a working vertical slice early (M3: add and view songs; M6: a fully working Korean song with all three modes and progress), then adds languages, then hardens.

```
M0 Scaffold ─▶ M1 Design foundation ─▶ M2 Data & backup ─▶ M3 Library + Add (slice 1)
                                                               │
                         M4 Engine spikes (ADRs) ◀─────────────┘
                               │
                         M5 Engine core + Korean ─▶ M6 Modes + progress (slice 2: full Korean)
                                                       │
                         M7 Packs + Mandarin + Cantonese ─▶ M8 Japanese ─▶ M9 Dictionaries & Word sheet
                                                                              │
                         M10 Corrections + lyric edits ◀──────────────────────┘
                               │
                         M11 Offline/PWA hardening ─▶ M12 LRCLIB ─▶ M13 Polish, a11y, perf, release
```

Universal definition of done (applies to every milestone, in addition to its own):
1. All listed deliverables exist and work; no placeholders, stubs, `TODO: implement`, or dead controls in shipped UI.
2. Required tests written and passing; `npm run verify` green.
3. Lint and typecheck clean with no new suppressions (any `eslint-disable` / `@ts-expect-error` needs a justification comment).
4. `docs/PROGRESS.md` entry: what was built, test counts, anything deferred with reason, known limitations added to `docs/KNOWN_LIMITATIONS.md`.
5. One or more descriptive commits on the working branch.

---

## M0 — Project scaffold and quality gates

**Objective:** A buildable, testable, lint-clean empty app with all tooling in place.

**Deliverables**
- Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`) project at repo root; `npm` as package manager; Node version pinned in `.nvmrc` and `package.json#engines` (current LTS — the machine has Node 22).
- ESLint (flat config: typescript-eslint, react-hooks, jsx-a11y, import boundaries per ARCHITECTURE §2, ban `dangerouslySetInnerHTML`), Prettier.
- Vitest (projects: `unit` jsdom, `engine` node, `linguistic` node), Testing Library, fake-indexeddb, fast-check.
- Playwright with the four projects from TEST_STRATEGY §1, running against `vite preview`.
- Scripts: `dev, build, preview, lint, typecheck, test, test:ling, e2e, verify, packs, brand`.
- `.gitignore` additions: `node_modules, dist, .cache, public/packs, reports, playwright-report, test-results`.
- GitHub Actions workflow `ci.yml` (lint, typecheck, test, build, e2e).
- Folder skeleton from ARCHITECTURE §2 (only folders that M0 code uses; no empty placeholder modules).
- `docs/PROGRESS.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/adr/0001-stack.md` (records stack choices from ARCHITECTURE §1).

**Dependencies:** none.

**Acceptance criteria**
- `npm run verify` passes on a clean clone.
- A trivial App renders "Overtone" and a smoke E2E passes in WebKit and Chromium.

**Required tests:** smoke unit test, smoke E2E.

---

## M1 — Design foundation, brand assets, app shell

**Objective:** The visual system and shell every later screen builds on.

**Deliverables**
- `/brand/` masters (move from `planning/brand/`, refine if needed), `scripts/brand/generate-assets.ts` per DESIGN_SYSTEM §1.4; generated icons, splash images (light/dark), favicon, `docs/banner.png`, `public/og.png` committed.
- `src/styles/tokens.css`, `base.css`, `typography.css` per DESIGN_SYSTEM §3–5; Instrument Serif self-hosted WOFF2 (Latin subset) with OFL licence file.
- Theme resolution (System/Light/Dark) with `data-theme`, theme-color meta switching.
- `index.html` head per DESIGN_SYSTEM §9.2, inline critical CSS + inline mark for no-flash launch; manifest per §9.1; base-path support (`VITE_BASE`).
- UI primitives in `src/ui/`: Button (variants: primary, secondary, plain, destructive), IconButton, SegmentedControl, Sheet (detents: half/full; drag-to-dismiss; focus trap; history entry), ConfirmDialog, Menu, Toast system, TextField, TextArea (autogrow), Switch, Chip, ProgressBar, Skeleton, EmptyState, Banner.
- App shell: router (Library placeholder screen **with real empty state**, Settings with real Appearance + Text size), ErrorBoundary with recovery UI, `platform/` helpers (standalone detection, keyboard inset, safe-area CSS vars).
- Token contrast unit test.

**Dependencies:** M0.

**Acceptance criteria**
- Library empty state and Settings (Appearance, Text size) look finished in light and dark at 320 and 393 px.
- Sheet primitive works with touch drag, keyboard (Escape), and screen reader (focus trap, labelled).
- Brand script is deterministic (running twice yields byte-identical PNGs).

**Required tests:** primitives component tests (a11y roles, keyboard), contrast test, brand snapshot test, E2E: theme switching, axe on shell, no-overflow check at 320 px.

---

## M2 — Data layer and backup

**Objective:** Reliable persistence and backup before any feature depends on it.

**Deliverables**
- `lyrics/parse.ts` (normalisation, kinds, line keys) and `lyrics/diff.ts`.
- Dexie schema v1 (`db/schema.ts`) and record types exactly as ARCHITECTURE §3 (adjust only with an ADR).
- Repositories: songs (create, update details, update lyrics with preservation per ARCHITECTURE §6.4, soft delete/undo/purge, open-tracking), lines, progress (toggle, reset, shared keys, counts), corrections (CRUD — UI comes later), settings, drafts, meta (library marker + localStorage mirror).
- Backup: `format.ts` (zod schema v1), `export.ts`, `import.ts` (validate → preview → merge/replace in one transaction), migration registry (with a v0→v1 no-op example test harness), checksum.
- Storage helpers: `persist()` request, `estimate()`, typed storage errors, defensive open with retry.
- Search folding function (`search/fold.ts`) used by `searchText` maintenance.

**Dependencies:** M0 (M1 may proceed in parallel; merge before M3).

**Acceptance criteria**
- All repository operations are transactional; failures leave no partial state (tested with injected errors).
- Export → clear → import round-trip deep-equals (TEST_STRATEGY §2.3).
- Edit-preservation matrix passes.

**Required tests:** TEST_STRATEGY §2.1, §2.2, §2.3 in full.

---

## M3 — Library, Add Song, Song (plain) — vertical slice 1

**Objective:** A user can add, find, open, edit details of, and delete songs. Lyrics display as original text (Clean-original rendering) — real, not a mock.

**Deliverables**
- Library screen: list, rows (title, artist, line count, chip, progress bar), search, language filters with counts, sort menu, persisted state, empty/no-results states, long-press context menu, backup reminder banner logic (data from M2).
- Add Song sheet, **Paste lyrics** tab only: fields, validation, limits, auto-detect hint (**script-based detection from LANGUAGE_ENGINE §4.3 is implemented here** in `engine/segment/detect.ts` as a pure function — no worker needed), Han-only Mandarin/Cantonese choice, discard confirm, draft autosave/restore. The Paste/Search segmented control is **not rendered** until M12 (no disabled "coming soon" placeholder).
- Song screen: header, `⋯` menu (Edit details, Edit lyrics, Reset progress, Delete with undo), original-text rendering with section/blank handling and correct `lang` attributes, mode switcher **hidden** until M6.
- Edit lyrics screen/sheet using the same editor, with preservation summary toast.
- Settings → Backup: Export (share/download), Import (preview, merge/replace), last export time, storage status.
- Recovery screen.

**Dependencies:** M1, M2.

**Acceptance criteria**
- PRODUCT_SPEC J1, J2 (except J2.8), J9, J10, J11, J12.4–J12.6 pass.
- Works fully offline in dev preview after first load (SW not required yet — IndexedDB only).

**Required tests:** E2E `library.spec`, `add-song.spec` (manual parts), `backup.spec`, `recovery.spec`, `edit.spec` (lyrics/details/delete parts), axe on all new screens, layout.spec for these screens.

---

## M4 — Language engine spikes (decision milestone)

**Objective:** Replace every "to verify" in LANGUAGE_ENGINE.md with evidence before building on it.

**Deliverables** (each an ADR in `docs/adr/` with method, numbers, decision):
- 0002 Japanese tokenizer: kuromoji.js (custom loader) vs lindera-wasm IPADIC — accuracy on a 50-line starter Japanese fixture set, compressed size, cold load time and heap in Playwright WebKit and Chromium, Vite/worker integration, licence. Decision + integration notes.
- 0003 Korean romaniser: own rule module prototype vs `hangul-util` vs `korean-pronunciation` on a 60-line starter Korean set; and lindera ko-dic feasibility (size, load) for lemmatisation.
- 0004 Mandarin: pinyin-pro behaviour on Traditional input, tone-sandhi option existence/defaults, neutral tone handling, bundle size of its dictionary chunk; opencc-js length preservation.
- 0005 Cantonese: to-jyutping on a 50-line starter set (polyphones, Cantonese characters), bundle size, API stability.
- 0006 Dictionaries: confirm licences (CC-CEDICT version, CC-Canto, JMdict/EDRDG wording, Wiktionary/kaikki terms, kengdic), download URLs, pinned versions + SHA-256, trimmed pack size estimates, Korean coverage comparison Wiktionary vs kengdic on fixture vocabulary.
- 0007 Ruby rendering in WebKit: native `<ruby>` inside buttons with wrapping at 320 px vs inline-grid stack fallback; pick one (screenshots attached under `docs/adr/assets/`).
- Starter fixture sets committed (they grow in later milestones).

**Dependencies:** M0 (can start in parallel with M1–M3 if the agent works sequentially, schedule after M3 to keep focus; must finish before M5).

**Acceptance criteria:** Every ADR has measured numbers (not estimates) and a decision; LANGUAGE_ENGINE.md items marked "to verify" are resolved in the ADRs (do not edit planning docs; ADRs supersede them where they differ).

**Required tests:** spike harness scripts kept under `scripts/spikes/` with a README on how to rerun; no production code required.

**Rule:** If a spike shows a requirement is infeasible as planned, record the limitation and the best defensible alternative in the ADR and `KNOWN_LIMITATIONS.md`, then proceed with the alternative. Do not reduce scope silently.

---

## M5 — Engine core + Korean + mixed-language routing

**Objective:** The worker pipeline end to end with the first language that needs no downloaded pack.

**Deliverables**
- `engine/model.ts` types and invariant checker; `engine/segment/` (script runs, routing, detection integration); Latin/punctuation passthrough.
- Worker (`engine/worker.ts`) with Comlink; `EngineClient` with queue, dedupe, priority, cancellation, idle termination; analysis cache writes; `useLineAnalyses` hook with progressive updates.
- `engine/ko/`: romaniser (all rules + exceptions table + letter mode), eojeol tokenisation, lemma heuristics, particle gloss table (dictionary lookup is wired in M9; until then `dict` = null and the Word sheet is not shown).
- `romaniseLine` and render-time projection utilities.
- Japanese/Han segments in Korean songs route to `other` or `ja` placeholder status **displayed as original text** with "needs language data" note (real behaviour until M7/M8).

**Dependencies:** M3, M4.

**Acceptance criteria**
- Korean songs show romanisation above words (simple renderer acceptable until M6 but must be correct and non-overflowing).
- Korean fixture suite ≥ thresholds (TEST_STRATEGY §4.4) on ≥ 120 lines.
- Worker failure on a line never breaks rendering.

**Required tests:** TEST_STRATEGY §2.4 (segment, ko, worker protocol, invariants), Korean linguistic suite, mixed suite (routing only).

---

## M6 — Display modes and progress — vertical slice 2

**Objective:** A complete, polished experience for Korean songs: Learn, Karaoke, Clean, progress.

**Deliverables**
- Learn view: line component with check button, token buttons, ruby per ADR 0007, learned styling, section/blank handling, low-confidence and unknown markers, long-press line menu (copy original/romanised, toggle).
- Karaoke view and Clean view (with Original/Romanised toggle) per DESIGN_SYSTEM §6.3; mode switcher; mode and clean variant persisted per song; scroll anchoring on mode switch; scroll restoration.
- Progress UI: header summary, library bars/badge; shared-key chorus behaviour; reset.
- Settings → Romanisation (Korean options live; others present only when their language lands — options for not-yet-supported languages are not shown).
- Text size applies to lyrics.
- Optional wake lock in Karaoke (MAY).

**Dependencies:** M5.

**Acceptance criteria:** PRODUCT_SPEC J4 (except dictionary parts), J5, J6, J7 pass for Korean; layout.spec passes at all widths with Korean fixtures; visual snapshots approved.

**Required tests:** `modes.spec`, `progress.spec`, layout/a11y/visual specs for Song screen, component tests.

---

## M7 — Language packs infrastructure + Mandarin + Cantonese

**Objective:** Downloadable offline data and both Chinese languages.

**Deliverables**
- `scripts/packs/` pipeline: `sources.json` (pinned URLs + SHA-256 from ADR 0006), fetch with verification into `.cache/`, builders for zh and yue dictionaries (format per LANGUAGE_ENGINE §9), `manifest.json` writer with sizes and attributions.
- `engine/dict/`: `overtone-dict` Dexie DB, streaming installer with progress, atomic versioning, lookup API, removal.
- Service worker introduced now with a minimal config: precache shell + CacheFirst `/packs/` (full SW hardening in M11).
- Settings → Offline language data.
- On-demand download prompts in Song screen ("needs a one-time download") and processing resume after install.
- `engine/zh/` (opencc shadow, pinyin-pro, CEDICT max-match segmentation, entry selection, polyphone flags, tone projection, sandhi projection) and `engine/yue/` (to-jyutping, CC-Canto/CEDICT segmentation, flags).
- Settings → Romanisation: Mandarin options.

**Dependencies:** M6.

**Acceptance criteria:** zh and yue fixture suites (≥ 120 lines each) meet thresholds; packs within budget; install/remove/offline flows pass; Chinese songs work in all three modes.

**Required tests:** `packs.spec`, pack installer unit tests, zh/yue linguistic suites, layout specs with Chinese fixtures, offline open of a Chinese song after pack install.

---

## M8 — Japanese

**Objective:** Japanese readings, furigana, romaji.

**Deliverables**
- `ja-core` pack (tokenizer data + JMdict trimmed) via the pack pipeline.
- `engine/ja/`: tokenizer integration per ADR 0002 (custom loader from Cache Storage/pack URLs), reading derivation, furigana alignment, Hepburn module with settings, spacing/attachment rules, ambiguous-surface list, particle/auxiliary gloss table.
- Aozora ruby import in Add/Edit (PRODUCT_SPEC J2.8) with toggle.
- Learn-mode romaji line under Japanese lines; Settings → Japanese romanisation options.
- Worker memory management verified (terminate when idle).

**Dependencies:** M7.

**Acceptance criteria:** Japanese fixture suite (≥ 150 lines) meets thresholds; Japanese processing within performance budget; memory budget reported.

**Required tests:** Hepburn/furigana/aozora unit tables, ja linguistic suite, modes/layout specs with Japanese fixtures, performance measurement.

---

## M9 — Dictionaries and Word sheet

**Objective:** Tap any word for meanings in all four languages.

**Deliverables**
- `ko-core` pack (Wiktionary-KO + kengdic per ADR 0006), Korean lemma lookup wired.
- JMdict lookup for Japanese (from `ja-core`), CEDICT for zh, CC-Canto + CEDICT for yue (packs from M7).
- Word sheet per DESIGN_SYSTEM §6.4 (senses, dictionary form, POS, source, confidence explanations, particle glosses, no-entry state).
- About & licences screen generated from pack manifest + static app licences (fonts, libraries — use a license-checker script to list npm dependency licences).

**Dependencies:** M8.

**Acceptance criteria:** PRODUCT_SPEC J4.7 and Word-sheet behaviours pass; dictionary coverage and meaning relevance thresholds met in all languages; licences screen lists every source with licence and attribution.

**Required tests:** `word-sheet.spec`, lookup unit tests, coverage metrics in `test:ling`, axe on Word sheet.

---

## M10 — Corrections and lyric-edit robustness

**Objective:** Users can fix anything; fixes survive everything.

**Deliverables**
- Correction sheet per DESIGN_SYSTEM §6.5 for all languages: reading (with romaji→kana and pinyin-number→tone-mark input helpers), romanisation, meaning (replace/prepend), segment language, split/merge, scope, revert.
- Line menu: "Set line language".
- Overlay engine per LANGUAGE_ENGINE §12 (value vs structural corrections; structural included in worker cache key).
- Unmatched-correction review list in Song menu.
- Edit-lyrics integration: corrections and progress preserved per ARCHITECTURE §6.4 (already in repos; now verified through UI).
- Language change on a song: corrections become inactive/reactivated.
- "Clean up unused corrections".

**Dependencies:** M9.

**Acceptance criteria:** PRODUCT_SPEC J8 and J9.1 pass; corrections exported/imported correctly (extend backup tests).

**Required tests:** `corrections.spec`, overlay unit tests, edit.spec extended, backup round-trip with corrections of every type.

---

## M11 — Offline, PWA and storage hardening

**Objective:** Production-grade offline behaviour and update safety.

**Deliverables**
- Final `sw.ts` per ARCHITECTURE §9 (navigation NetworkFirst + offline fallback, precache budget, packs cache management from Settings).
- Update prompt flow, deferred while editing; update checks on visibility.
- Persistent-storage request timing and status UI; storage estimate display; low-space warnings; quota error handling paths in all write flows.
- Install tip for iOS Safari (non-standalone).
- Splash links injection verified; no-flash launch.
- `docs/IOS_VERIFICATION.md` created with the checklist from TEST_STRATEGY §7, all rows "Not yet verified".

**Dependencies:** M10 (SW basics from M7).

**Acceptance criteria:** PRODUCT_SPEC J12 and J1.3 pass; `offline.spec` and `update.spec` pass in WebKit and Chromium.

**Required tests:** `offline.spec`, `update.spec`, storage error unit tests, SW route unit tests (Workbox routing with mocked fetch where feasible).

---

## M12 — Online lyrics search (LRCLIB)

**Objective:** Optional search that never compromises manual entry.

**Deliverables**
- `online/lrclib.ts`: `GET https://lrclib.net/api/search?track_name=&artist_name=` (or `q=`), `GET /api/get/{id}`; zod schemas for the record fields (`id, trackName, artistName, albumName, duration, instrumental, plainLyrics, syncedLyrics`); `Lrclib-Client` header (ADR if preflight fails); 10 s timeout via `AbortController`; 429 handling with `Retry-After` + jitter; client-side throttle (≥ 500 ms between requests, sequential); normalisation and caps identical to pasted lyrics.
- Search tab in the Add sheet per DESIGN_SYSTEM §6.2, offline state, licence notice; source metadata saved; synced lyrics stored untouched.
- Song details show "Lyrics from LRCLIB".

**Dependencies:** M11 (needs final SW to ensure no caching of API responses), M3.

**Acceptance criteria:** PRODUCT_SPEC J3 passes with mocked network; manual entry unaffected offline.

**Required tests:** `lrclib.spec` (mocked), client unit tests (TEST_STRATEGY §2.5), opt-in live smoke test.

**Provider notes (researched Nov 2026):** LRCLIB needs no API key; anonymous access is rate-limited per IP (~45/min without identification, ~90/min when identified); it is CORS-enabled; it asks clients to identify themselves; lyrics are user-contributed and the API docs state no licence for lyric content — hence personal-study framing and storing only what the user explicitly saves. No other free provider with a permissive browser-usable API was identified as clearly superior; commercial lyric APIs (e.g. Musixmatch) require keys/paid plans and restrict display, so they are out of scope.

---

## M13 — Polish, accessibility, performance, release candidate

**Objective:** Reach the v0.1 completion threshold.

**Deliverables**
- Motion per DESIGN_SYSTEM §7 incl. View Transitions + reduced motion; large-title collapse.
- Full a11y pass: axe clean, keyboard journeys, VoiceOver-oriented semantics review, 200 % zoom reflow.
- Performance pass against budgets (bundle, start, open, processing, memory); code splitting review.
- Search performance test with 1,000 songs.
- Fixture suites expanded to required minimum counts; final linguistic report in `docs/LINGUISTIC_REPORT.md`.
- Root README: product description, banner, screenshots (from Playwright), local dev, packs, brand, deploy steps (Cloudflare Pages / GitHub Pages), backup advice, licences.
- `docs/KNOWN_LIMITATIONS.md` complete; About screen links to it (or summarises it).
- Release checklist run; version `0.1.0` tagged **only if the user asks** (otherwise prepared).

**Dependencies:** M12.

**Acceptance criteria:** PRODUCT_SPEC §6 v0.1 completion threshold met in full, every MUST traced to a passing test (traceability table `docs/TRACEABILITY.md`: AC id → test file/name), manual checklist present and honestly marked.

**Required tests:** full `npm run verify` + `npm run test:ling` green; all E2E projects green.

---

## Risk register (track in PROGRESS.md)

| Risk | Impact | Mitigation |
|---|---|---|
| Japanese tokenizer too heavy/slow on iPhone memory | Crashes / slow processing | M4 measurement; worker termination; pack budgets; lindera fallback |
| iOS storage eviction | Data loss | persist(), markers, recovery screen, backup reminders, share-sheet export |
| Ruby layout bugs in WebKit | Misaligned annotations, overflow | ADR 0007 spike, bounding-box layout tests at 4 widths |
| Korean lemma heuristics miss conjugations | Missing meanings | Confidence flags, particle glosses, ko-dic option, corrections |
| Dictionary licence misunderstanding | Legal/attribution issues | ADR 0006 confirmation, manifest attributions, words.hk excluded |
| LRCLIB availability/terms change | Search breaks | Optional feature; manual entry primary; clear errors |
| Self-authored fixtures overstate accuracy | False confidence | `reviewed` flag, honesty caveat in report, engine-miss suite |
| Agent scope creep / premature features | Delay, regressions | Milestone gating, AUTONOMOUS_AGENT boundaries |
