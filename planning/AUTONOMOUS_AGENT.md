# Instructions for the Implementation Agent (Claude Sonnet)

You are implementing **Overtone v0.1**, a local-first, account-free lyrics-learning PWA. This file tells you how to work. The other planning documents tell you what to build:

| Document | Use it for |
|---|---|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | What the product must do. Acceptance criteria (J-ids) are the contract. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, module boundaries, data model, pipeline, storage, backup format, SW, security. |
| [LANGUAGE_ENGINE.md](LANGUAGE_ENGINE.md) | Linguistic processing per language, libraries, data, fallbacks, overlay. |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Brand, tokens, typography, screens, states, motion, accessibility, iOS PWA behaviour. |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Milestone order, deliverables, dependencies, acceptance. |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Tests, fixtures, accuracy thresholds, manual iOS checklist. |

Precedence when documents disagree: PRODUCT_SPEC (behaviour) > ARCHITECTURE / LANGUAGE_ENGINE / DESIGN_SYSTEM (how) > IMPLEMENTATION_PLAN (order). ADRs you write in `docs/adr/` supersede planning *implementation details* (never product requirements) once accepted. Record every conflict you find and how you resolved it in `docs/PROGRESS.md`.

Also follow the repository's `AGENTS.md`.

---

## 1. Non-negotiable boundaries

1. **No backend, no accounts, no paid services, no analytics, no third-party runtime scripts or fonts.** The only external network endpoint is `https://lrclib.net` (user-initiated). Build-time downloads of dictionary/font sources from their official locations are allowed.
2. **Do not silently reduce scope.** Every MUST criterion is required. If something is infeasible, write an ADR describing the evidence, the limitation, and the best defensible alternative; implement the alternative; add it to `docs/KNOWN_LIMITATIONS.md`; note it in PROGRESS.md under "Scope deviations".
3. **No placeholders presented as features.** No "coming soon" UI, no hard-coded fake readings, no mocked dictionary in production code, no buttons that do nothing. Hide a control until its milestone lands.
4. **Never fabricate results.** Only report tests, metrics, sizes and timings you actually ran and observed. If a check could not run (missing browser, network failure), say so explicitly. Never mark iOS checklist items verified — only a human can.
5. **Never edit fixture expectations to make tests pass** unless the fixture is demonstrably wrong; then cite the authoritative source in the fixture and leave `reviewed: false`.
6. **Never commit copyrighted song lyrics** (fixtures, screenshots, demo data, tests). Use original or verified public-domain text.
7. **Never commit secrets.** None are needed.
8. **Do not add dependencies outside the plan** without a short ADR (purpose, licence, size, maintenance, alternatives). Licences must be permissive (MIT, BSD, Apache-2.0, ISC, MPL-2.0 for tooling, OFL for fonts) or, for data, the dictionary licences listed in LANGUAGE_ENGINE §2.6. No GPL code in the app bundle.
9. **Do not build future features** (audio, timing, SRS, sync, statistics). Seams only as listed in ARCHITECTURE §12.
10. **Data safety:** never write code that deletes user data automatically (except soft-deleted songs after undo window, and derived caches). Every destructive user action needs confirmation.
11. **Git:** work on a branch (`v0.1-implementation` or per-milestone branches), commit after each milestone (and at meaningful sub-steps), descriptive messages. Do not push, force-push, rewrite history, rename the repo, or deploy unless the human explicitly asks.

---

## 2. Workflow per milestone

```
1. Read      → the milestone in IMPLEMENTATION_PLAN.md and every spec section it references.
2. Plan      → write a short checklist at the top of the milestone's PROGRESS.md entry:
               deliverables, AC ids covered, tests to write.
3. Test-first where practical → write failing tests for the ACs and engine tables.
4. Build     → smallest change that satisfies the deliverables; follow module boundaries.
5. Verify    → npm run verify (and npm run test:ling from M5 on). Fix until green.
6. Inspect   → run the app (vite preview, production build) in Playwright WebKit at 375 px,
               light + dark; take screenshots of new screens/states and look at them.
               Fix visual defects (overflow, misalignment, contrast, truncation).
7. Record    → PROGRESS.md: done items, test counts (from actual output), metrics,
               deviations, limitations, follow-ups. Update TRACEABILITY.md rows.
8. Commit    → descriptive message(s).
9. Gate      → only then start the next milestone.
```

If a milestone becomes too large, split it into sub-steps internally, but keep the same gate.

If you are blocked for more than a few attempts on the same problem: stop, write down what you tried and the evidence, pick the best defensible alternative, record it, and continue. Escalate to the human (write a clear question at the top of PROGRESS.md under "Needs human input") only for decisions that materially change product purpose, cost, privacy, licensing, or architecture.

---

## 3. Decisions you may make on your own

- Exact dependency versions (current stable), file names within the documented structure, internal APIs, component composition.
- Visual details within DESIGN_SYSTEM tokens (adjust a colour value to meet contrast; tweak spacing) — note material changes.
- Choosing between options that a spike ADR evaluates, based on the measured criteria stated in the plan.
- Adding tests, fixtures, and test utilities.
- Refactoring code you wrote in this project when it reduces complexity.

## 4. Decisions you must not make on your own

- Dropping or weakening any MUST acceptance criterion.
- Adding a backend, proxy, account system, telemetry, or paid/keyed API.
- Using words.hk or any non-commercial/unclear-licence data in default packs.
- Changing the backup format contract (line key function, field meaning) without a schema version bump and migration.
- Deploying, pushing, publishing, or renaming the repository.

---

## 5. Quality gates (must all pass before a milestone is "done")

- `npm run verify` green: lint, typecheck, unit/integration, build, E2E (WebKit + Chromium projects).
- From M5: `npm run test:ling` for languages delivered so far meets TEST_STRATEGY §4.4 thresholds.
- No horizontal overflow at 320/375/393/430/768 px on new screens (layout.spec).
- axe: no serious/critical violations on new screens/states, light and dark.
- Bundle/pack budgets respected (or ADR'd).
- No `console.error` during E2E runs (Playwright listener fails the test).
- PROGRESS.md and TRACEABILITY.md updated.

---

## 6. Reporting format (PROGRESS.md entry)

```md
## M<n> — <name> — <status: done | in progress | blocked>
Date: YYYY-MM-DD

### Delivered
- …

### Acceptance criteria covered
- J2.1 → tests/…  (pass)

### Verification (actual output)
- npm run verify: <N> unit tests passed, <M> e2e passed (webkit-iphone, chromium-mobile, …)
- test:ling: ko romanisation 97.8 % (412/421 eojeol) …
- Bundle: initial JS 142 KB gzip
- Not run / unavailable: …

### Scope deviations / limitations
- …

### Follow-ups for later milestones
- …
```

---

## 7. Practical notes and pitfalls

- **Production build for E2E.** Service-worker and offline tests only make sense against `vite build && vite preview`.
- **Workers + Vite:** use `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`. Check that module workers run in Playwright WebKit; if a dependency assumes Node (`path`, `fs`, `zlib`), provide a browser loader instead of polyfilling Node wholesale (kuromoji's loader needs replacing — see LANGUAGE_ENGINE §2.1).
- **Fake IndexedDB in unit tests**, real IndexedDB in E2E. Reset databases between tests.
- **Unicode:** always iterate code points (`for…of`, `Array.from`) when handling characters; offsets in `Token` are UTF-16 indices — be careful with astral characters (rare Han extension B characters, emoji).
- **`lang` attributes** are functional requirements (font selection), not decoration.
- **CSS for ruby** varies across engines; verify in WebKit screenshots, not just Chromium.
- **Large data in tests:** unit tests must not need real packs; use small fixture dictionaries. Linguistic tests use real packs (`npm run packs` first) and run in the `linguistic` Vitest project.
- **LRCLIB:** never hit the live API in CI. Respect rate limits in the opt-in live test.
- **Don't trust memory for library APIs.** Read the installed package's README/types before using it; record surprises in ADRs.

---

## 8. Completion

v0.1 is complete when PRODUCT_SPEC §6 is satisfied. Final deliverables:

1. All milestones M0–M13 marked done in PROGRESS.md with real verification output.
2. `docs/TRACEABILITY.md` maps every MUST AC to passing tests or to the manual checklist.
3. `docs/LINGUISTIC_REPORT.md` with current metrics and the honesty caveat.
4. `docs/KNOWN_LIMITATIONS.md`, `docs/IOS_VERIFICATION.md` (unverified rows left as such), ADRs.
5. Root README updated (product, dev setup, packs, brand, deploy, backups, licences).
6. A final summary for the human: what was built, verification results, limitations, deviations, what needs human action (device testing, deployment, repo rename, trademark check).
