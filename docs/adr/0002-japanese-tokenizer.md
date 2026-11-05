# ADR 0002 — Japanese tokenizer

Status: accepted · Date: 2026-11-05 · Supersedes the default in LANGUAGE_ENGINE §2.1 (kuromoji.js)

## Method

`scripts/spikes/japanese-tokenizers.mjs` (Node) and `scripts/spikes/japanese-browser.mjs` (Playwright WebKit 27.2 and Chromium, tokenizer inside a **module Worker**). Fixture: `fixtures/linguistic/ja/starter.json` — 50 original lines; metric = exact match of the concatenated hiragana reading per line. Candidates: `kuromoji` 0.1.2 (IPADIC, Apache-2.0) and `lindera-wasm` 2.0.0 web/nodejs IPADIC builds (MIT). Both use the same IPADIC dictionary.

## Measured

|                                                     | kuromoji.js                                                                                       | lindera-wasm (IPADIC)                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Accuracy (line exact)                               | 46/50                                                                                             | 46/50 (identical outputs)                                         |
| Download                                            | dict files 17.0 MB (already `.gz`)                                                                | one `.wasm`: 12.5 MB raw / **11.4 MB gzip** (dictionary embedded) |
| Node load time                                      | 225–229 ms                                                                                        | 146–150 ms                                                        |
| Node RSS growth after load                          | **+302–315 MB**                                                                                   | **+78 MB**                                                        |
| Tokenise 50 lines (Node)                            | 5–13 ms                                                                                           | 5 ms                                                              |
| WebKit worker: wasm init / dict build / tokenise 50 | not run                                                                                           | 92 / 131 / 9 ms                                                   |
| Chromium worker: same                               | not run                                                                                           | 44 / 134 / 11.5 ms                                                |
| Browser integration                                 | needs a custom loader (its browser loader uses `path.join`, breaking absolute URLs); unmaintained | works unmodified in a module worker in both engines               |

The 4 misses are identical for both and are genuine ambiguity, not tokenizer bugs: 一人 (ひとり vs いちにん), 二人 (ふたり vs ににん), 一日中 (…じゅう vs ちゅう), 宝物 (たからもの vs ほうもつ). They belong in the known-ambiguous list (LANGUAGE_ENGINE §8.4).

## Decision

Use **lindera-wasm with the IPADIC dictionary** (web build) behind the `JapaneseTokenizer` interface. It matches kuromoji's accuracy, downloads about a third less, uses roughly a quarter of the memory, loads faster, and runs in WebKit/Chromium workers without a loader shim. kuromoji is rejected.

## Integration notes / risks

- ja-core budget: wasm 11.4 MB gz + trimmed JMdict (ADR 0006: ≈ 9.7 MB gz all forms, ≈ 1.0 MB common-only) ≈ 21 MB, under the 25 MB budget.
- The dictionary is inside the `.wasm`, so it is a pack file (`/packs/ja/<ver>/…`, CacheFirst) initialised with `init(<pack url>)`, not part of the app shell.
- **Not yet verified:** running under our CSP (`script-src … 'wasm-unsafe-eval'` is already allowed) and through the service-worker pack route — verify in M8. Heap was not measured (`performance.memory` is unavailable in WebKit and was not collected for Chromium). The memory numbers above are Node RSS and indicative only; worker termination on idle (ARCHITECTURE §4.2) remains required.
- IPADIC's own licence text must be reproduced in About & licences (copy from the package's LICENSE in M9).
- Tokenizer output fields: `surface`, `reading` (katakana), `pronunciation`, `partOfSpeech*`, `baseForm`.
