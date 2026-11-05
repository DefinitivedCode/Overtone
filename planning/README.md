# Overtone — Planning Documents

Engineering plan for **Overtone v0.1**: a local-first, account-free PWA (installed on the iOS Home Screen first) for learning to read, understand and sing lyrics in Korean, Japanese, Mandarin and Cantonese.

Nothing in this folder is application code. The implementation agent builds from these documents.

## Documents

| # | File | Contents |
|---|---|---|
| 1 | [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | Vision, principles, user journeys, acceptance criteria (J-ids), v0.1 completion threshold |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | Stack and trade-offs, repo layout, data model, Dexie schema and migrations, processing pipeline, packs, backup format, search, service worker, storage safety, security, hosting |
| 3 | [LANGUAGE_ENGINE.md](LANGUAGE_ENGINE.md) | Library/dictionary evaluation, token model, script routing, per-language pipelines, confidence and fallbacks, correction overlay, known limitations |
| 4 | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Name and brand, icon/banner and asset pipeline, tokens, typography, screens and states, motion, accessibility, iOS PWA behaviour |
| 5 | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Milestones M0–M13, with deliverables, dependencies, acceptance criteria, tests and a risk register |
| 6 | [TEST_STRATEGY.md](TEST_STRATEGY.md) | Tooling, unit/E2E plans, linguistic fixtures and accuracy thresholds, quality gates, manual iOS checklist |
| 7 | [AUTONOMOUS_AGENT.md](AUTONOMOUS_AGENT.md) | Workflow, boundaries, quality gates, reporting and completion criteria for the implementation agent |
| — | [brand/icon.svg](brand/icon.svg), [brand/banner.svg](brand/banner.svg) | Concept masters for the app icon and README/social banner |

## How the implementation agent should use them

1. Read `AUTONOMOUS_AGENT.md` first, then `PRODUCT_SPEC.md`, then skim the rest.
2. Work through `IMPLEMENTATION_PLAN.md` one milestone at a time, in order. Before starting each milestone, re-read the spec sections it references.
3. Treat acceptance criteria as the contract and `TEST_STRATEGY.md` as the definition of "verified".
4. Record evidence-based decisions as ADRs in `docs/adr/`. Record progress, deviations and limitations in `docs/PROGRESS.md` and `docs/KNOWN_LIMITATIONS.md`. Leave this folder unchanged, except for factual corrections, which must be noted in PROGRESS.md.

## Status labels used in these docs

- **MUST / SHOULD / MAY / OUT**: requirement strength (defined in PRODUCT_SPEC).
- **Verified (research)**: confirmed from official project docs during planning (Nov 2026).
- **To verify (spike)**: must be measured in Milestone M4 before being relied on.
