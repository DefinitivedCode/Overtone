# Linguistic report

Status: **Korean, Mandarin, Cantonese and mixed-language routing** (M7). The Japanese suite is scheduled for M8.

> **Fixture caveat.** The suites measure agreement with self-authored fixtures. Fluent speakers have reviewed zero lines. The Korean expectations follow the same Revised Romanization rules as the engine, so its score measures internal consistency. ADR 0003 records comparisons against other Korean romanisers on the same starter set.

Run `npm run packs` followed by `npm run test:ling`. The suites write `reports/linguistic-*.md`.

## Korean (pronunciation-based RR), full pipeline analyse → romaniseLine

- Lines: **169** (60 starter + 109 rule/particle/contraction/irregular/mixed/jamo/exception lines), 0 human-reviewed.
- Eojeol accuracy **100.0 %** (190/190); line exact 169/169. Threshold ≥ 97 % ✓ (see caveat). Exceptions-table (ㄴ-insertion) cases 100 % ✓. Every rule category has ≥ 5 lines ✓.
- One authoring mistake was found and corrected with its source recorded (돌아와 = `dorawa`; ㅘ = `wa`), which is exactly the kind of error a fluent reviewer should be asked to find: **please review `fixtures/linguistic/ko/*.json`**.
- Not covered by this suite: meanings/lemma accuracy and dictionary coverage (M9), Korean words whose pronunciation depends on morphology (ㄴ-insertion beyond the 11-word exceptions table, Sino-Korean ㄹ → ㄴ exceptions such as 생산량), tensification (correctly not marked in RR).

## Mixed-language routing

- Lines: **43** (Korean/Japanese/Mandarin/Cantonese songs with English, Hanja, kana, full-width Latin and digits, half-width katakana, emoji, apostrophes/hyphens).
- **99/99 segments (100 %)** routed as expected ✓ (required 100 %). The suite found one real defect during M5: Han runs adjacent to kana were not merged into a single Japanese segment (e.g. `三ヶ月`); fixed per LANGUAGE_ENGINE §4.2.

## Mandarin and Cantonese

| Language  | Lines |            Character accuracy |       Tagged polyphone subset |
| --------- | ----: | ----------------------------: | ----------------------------: |
| Mandarin  |   162 | 455/463 (98.3 %, target 98 %) | 139/141 (98.6 %, target 92 %) |
| Cantonese |   172 |  369/369 (100 %, target 95 %) |    28/28 (100 %, target 88 %) |

Both suites use the real pack rows and include the starter probes. The Mandarin comparator normalizes marked and numbered fixture readings to the same numeric representation. Expectations remain unchanged. All fixtures are self-authored with zero fluent-speaker reviews. Coverage and meaning relevance are scheduled for M9.

Mandarin differences include 得 read `de2` where fixtures expect `dei3` or `de5`, 地 read `di4` where the fixture expects `de5`, and neutral-tone differences for 还是 and 朋友们. The generated report lists each affected line. The Cantonese suite reported no differences.

## Japanese

The tokenizer spike scored 46/50 starter probes. See ADR 0002 for the spike and its limitations.
