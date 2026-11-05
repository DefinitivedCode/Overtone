# Linguistic report

Status: **Korean and mixed-language routing only** (M5). Japanese, Mandarin and Cantonese suites arrive with M7/M8; their starter probes are recorded in `docs/adr/0002`–`0005`.

> **Honesty caveat.** Fixtures are written by the implementing agent from the Revised Romanization rules, not reviewed by fluent speakers, and the expected values were derived from the same rules the engine implements. A score of 100 % therefore shows internal consistency with those rules, **not** proven native-level accuracy. Lines with `reviewed: true` (human-verified) are scored separately; there are currently none. The only independent signal so far is ADR 0003: off-the-shelf romanisation packages score 41–84 % on the same starter set.

Run: `npm run test:ling` (writes `reports/linguistic-*.md`, gitignored).

## Korean (pronunciation-based RR), full pipeline analyse → romaniseLine

- Lines: **169** (60 starter + 109 rule/particle/contraction/irregular/mixed/jamo/exception lines), 0 human-reviewed.
- Eojeol accuracy **100.0 %** (190/190); line exact 169/169. Threshold ≥ 97 % ✓ (see caveat). Exceptions-table (ㄴ-insertion) cases 100 % ✓. Every rule category has ≥ 5 lines ✓.
- One authoring mistake was found and corrected with its source recorded (돌아와 = `dorawa`; ㅘ = `wa`), which is exactly the kind of error a fluent reviewer should be asked to find: **please review `fixtures/linguistic/ko/*.json`**.
- Not covered by this suite: meanings/lemma accuracy and dictionary coverage (M9), Korean words whose pronunciation depends on morphology (ㄴ-insertion beyond the 11-word exceptions table, Sino-Korean ㄹ → ㄴ exceptions such as 생산량), tensification (correctly not marked in RR).

## Mixed-language routing

- Lines: **43** (Korean/Japanese/Mandarin/Cantonese songs with English, Hanja, kana, full-width Latin and digits, half-width katakana, emoji, apostrophes/hyphens).
- **99/99 segments (100 %)** routed as expected ✓ (required 100 %). The suite found one real defect during M5: Han runs adjacent to kana were not merged into a single Japanese segment (e.g. `三ヶ月`); fixed per LANGUAGE_ENGINE §4.2.

## Japanese / Mandarin / Cantonese

Not yet implemented (M7, M8). Starter-probe numbers (not suite results): Japanese tokenizer 46/50 lines; pinyin-pro 26/36 (≥ 98 % target at risk); to-jyutping 40/40 on a 40-item probe.
