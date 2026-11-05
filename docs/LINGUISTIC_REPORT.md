# Linguistic report

Status: **Korean, Japanese, Mandarin, Cantonese and mixed-language routing** (M8).

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

Both suites use the real pack rows and include the starter probes. The Mandarin comparator normalizes marked and numbered fixture readings to the same numeric representation. Expectations remain unchanged. All fixtures are self-authored with zero fluent-speaker reviews. Dictionary coverage and meaning relevance are reported in the Dictionaries section below.

Mandarin differences include 得 read `de2` where fixtures expect `dei3` or `de5`, 地 read `di4` where the fixture expects `de5`, and neutral-tone differences for 还是 and 朋友们. The generated report lists each affected line. The Cantonese suite reported no differences.

## Japanese

- The production Lindera/IPADIC WASM, trimmed JMdict and complete analyser scored **364/365 kanji-containing spans (99.73%)** and **156/157 exact romaji lines (99.36%)**, against thresholds of 95% and 85%. The span comparator uses UTF-16 surface ranges to allow different token boundaries.
- The 157 scored cases include inflection, jukujikun, particles, long vowels, loans, iteration marks, counters, English mixed text and pasted readings. Forty-two paired clauses exercise punctuation and spacing with separately authored references. The original starter file scored **49/50** on whole-line kana readings. All three separate poetic probes missed their artist-selected reading without supplied ruby.
- The scored differences were the `idaku`/`daku` choice in `運命を抱く` and `kun`/`kimi` after `一日中` in the starter probes. Fixture expectations were retained. The generated `reports/linguistic-ja.md` lists per-category results and differences.

## Dictionaries (M9)

`tests/linguistic/dictionary.test.ts` analyses every fixture line, then runs the real Word-sheet lookup (`lookupWord`) over the real packs and counts content-word tokens (Korean particles and jamo-only interjections excluded) that get at least one entry.

| Language  | Content tokens | With an entry | Target |
| --------- | -------------: | ------------: | -----: |
| Korean    |            140 |        95.0 % |   90 % |
| Japanese  |            590 |        93.9 % |   90 % |
| Mandarin  |  see `reports` |         100 % |   90 % |
| Cantonese |  see `reports` |         100 % |   90 % |

Meaning relevance is a **20-word hand-written probe** (not an independent study): 20/20 expected glosses appear in the top three senses (target 85 %). Korean misses that remain are names and rare compounds (광한루, 꽃내음, 솜이불) and the ㄹ-dropping verb 분다 (불다). A first run scored Korean 87.4 % because the heuristic lemmatiser does not undo irregular conjugations; the Word sheet now tries ㅂ-irregular, 르-irregular, formal -ㅂ니다 and 여-contraction citation forms (`koIrregularForms`) and checks each against the dictionary. Fixtures remain self-authored; Korean coverage is measured on vocabulary the same author chose, so it likely overstates coverage of real lyrics. Per-language details: `reports/dictionary.json` (generated).
