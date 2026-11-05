# ADR 0003 — Korean romaniser and lemmatisation

Status: accepted · Date: 2026-11-05

## Method

`scripts/spikes/korean-romanisers.mjs` on `fixtures/linguistic/ko/starter.json` (60 original items covering liaison, cluster handling, aspiration, palatalisation, nasalisation, liquidisation, ㄴ-insertion and no-liaison-across-space). Metric: eojeol-level exact match after lower-casing and removing hyphens.

## Measured (73 eojeol in 60 lines)

| Candidate                                        | Lines | Eojeol        | Notes                                                                                                                           |
| ------------------------------------------------ | ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **own module** `src/engine/ko/romanise.ts`       | 60/60 | 73/73 (100 %) | **Circular**: expected values were written by the same author from the same rules. It shows internal consistency, not accuracy. |
| `korean-pronunciation` (g2pK port) → `aromanize` | 50/60 | 83.6 %        | 22 MB unpacked (bundles a CMU dictionary), 28 ms for 60 lines: unsuitable for a phone PWA                                       |
| `@romanize/korean` (RR)                          | 48/60 | 83.6 %        | spelling-based; no pronunciation rules                                                                                          |
| `aromanize`                                      | 44/60 | 78.1 %        | spelling-based                                                                                                                  |
| `hangul-util` `romanize(pronounce(x))`           | 43/60 | 76.7 %        | 0.5 MB; mishandles ㄱ-ending clusters and ㄹ cases                                                                              |
| `hangul-util` `romanize`                         | 23/60 | 47.9 %        |                                                                                                                                 |
| `hangul-romanization`                            | 18/60 | 41.1 %        |                                                                                                                                 |

The independent signal is that **no off-the-shelf package exceeds ~84 %** on pronunciation-based RR, so the plan's provisional decision to write our own rule module stands. The module is ~250 lines, dependency-free and tree-shakable.

## Decision

Adopt the own module (rules 1–10, exceptions table, letter-by-letter mode). Two fixture/test expectation mistakes made while authoring were corrected with their source recorded (돌아와 is `dorawa` because ㅘ = `wa` in the RR vowel table; ㄵ is `nj` in letter mode); all fixtures stay `reviewed: false`.

## Lemmatisation / dictionary (ko-dic feasibility)

`lindera-wasm-nodejs-ko-dic` 2.0.0 works (284 ms load in Node; 먹었어 → 먹/었/어) but its wasm is **22.1 MB raw / 20.8 MB gzip** against the 8 MB `ko-core` budget. **Rejected for v0.1**: use the heuristic lemmatiser (LANGUAGE_ENGINE §5.3), the particle gloss table and confidence flags. Not measured: ko-dic lemma accuracy on a fixture, since size alone rules it out. Recorded in KNOWN_LIMITATIONS (conjugation heuristics).
