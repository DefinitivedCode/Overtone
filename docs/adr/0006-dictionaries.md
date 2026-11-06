# ADR 0006 — Dictionaries: licences, sources, pinned versions and pack sizes

Status: accepted · Date: 2026-11-05

## Method

Official source files were downloaded into `.cache/dicts/` (gitignored) on 2026-11-05 and inspected; `scripts/spikes/dict-sizes.mjs` builds trimmed rows in the LANGUAGE_ENGINE §9 format (≤ 5 senses, ≤ 3 glosses, glosses ≤ 80 chars, JSON Lines) and reports gzip sizes. SHA-256 values below are of the files as downloaded **on that date**; `scripts/packs/sources.json` (M7) pins them for the build.

## Sources, licences, pins

| Data                                  | Official URL                                                                                                                      | Version / date                                                               | Licence (as stated in the file or the publisher's page)                                                                                              | Bytes       | SHA-256                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| CC-CEDICT                             | https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip                                                           | file last-modified 2026-11-05; 125,367 entries                               | **CC BY-SA 4.0** (stated in the file header; resolves the plan's "3.0 or 4.0"). Derived from CEDICT © Paul Denisowski.                               | 3,983,517   | `9e97e8e4b1e00125538c81cdb632255a791163133741362a1a99961b4449745a` |
| CC-Canto                              | https://cantonese.org/cccanto-170202.zip                                                                                          | 2017-02-02                                                                   | **CC BY-SA 3.0**, © 2015–17 Pleco Inc.                                                                                                               | 1,282,537   | `0cc9e600a19c02405064d6d227d96563c09da1a0af1c7717508c0f231028af27` |
| CC-CEDICT Cantonese readings          | https://cantonese.org/cccedict-canto-readings-150923.zip                                                                          | 2015-09-23                                                                   | **CC BY-SA 3.0**, © 2015 Pleco Software Inc.                                                                                                         | 1,874,027   | `f6d99991791f49aaf96d97b2838a3ba9e057e060a5a9e24311cf851f8f71a950` |
| JMdict (via jmdict-simplified, `eng`) | https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20261102210542/jmdict-eng-3.6.2%2B20261102210542.json.zip | jmdict-simplified 3.6.2+20261102210542; dictDate 2026-11-02; 219,009 entries | **EDRDG licence: Creative Commons Attribution-ShareAlike 4.0** (confirmed on https://www.edrdg.org/edrdg/licence.html); attribution text per EDRDG.  | 11,540,512  | `851791d3cc98a29ca7e4f65532966cdee637a1bc218cf1c99b4895b780edb101` |
| Wiktionary (English) Korean entries   | https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl                                                           | extracted 2026-10-30 from the 2026-10-01 enwiktionary dump (wiktextract)     | Wiktionary content: CC BY-SA (and GFDL) — **not re-verified here beyond kaikki's page, which asks for a link back and a citation**; see "Open items" | 207,649,961 | `c160b1dadd49b14109c2c1a29a616cc44064a738f91d2b98c1cdf457b90fde7f` |
| kengdic                               | https://raw.githubusercontent.com/garfieldnate/kengdic/master/kengdic.tsv (file is `kengdic.tsv`, not `kengdic_2011.tsv`)         | repository `datapackage.json` last_updated 2021-09-20                        | **CC BY-SA 3.0 or LGPL-2.0** (from the repo's `datapackage.json`) — differs from the plan's "MPL 2.0 or LGPL 2.0+"; we use the CC BY-SA 3.0 option.  | 11,650,286  | `d23236d5676f506514721e605534647ba4735a85bbb76b9e12d1ec067b8cfdb4` |

**Excluded:** words.hk (non-commercial licence) and KRDict (bulk-export terms unconfirmed), unchanged from the plan.

## Trimmed pack-size estimates (measured)

| Pack rows                                | Rows    | Raw      | Gzip (level 9) |
| ---------------------------------------- | ------- | -------- | -------------- |
| zh: CC-CEDICT (traditional + simplified) | 203,358 | 18.11 MB | **3.97 MB**    |
| yue: CC-Canto                            | 25,421  | 2.21 MB  | 0.70 MB        |
| yue: CEDICT Cantonese readings           | 105,862 | 3.78 MB  | 0.97 MB        |
| ja: JMdict eng, all kanji + kana forms   | 499,711 | 65.02 MB | **9.69 MB**    |
| ja: JMdict eng, common entries only      | 41,201  | 5.74 MB  | 0.97 MB        |
| ko: kengdic                              | 133,764 | 6.38 MB  | 1.55 MB        |
| ko: Wiktionary-KO (trimmed, 57,764 rows) | 57,764  | 4.88 MB  | 1.28 MB        |

Against the budgets: zh-core ≈ 4.0 MB (≤ 6 ✓); yue-core ≈ 1.7 MB (+ the 0.27 MB `to-jyutping` chunk; ≤ 4 ✓); ko-core ≈ 2.8 MB (≤ 8 ✓); ja-core ≈ 11.4 MB tokenizer (ADR 0002) + 9.7 MB JMdict ≈ **21.1 MB (≤ 25 ✓)**. Raw row text is large (65 MB for JMdict) — import is streamed in batches (ARCHITECTURE §5.2), and an IndexedDB footprint of the raw size must be allowed for in the low-space warning (3× download size).

## Korean coverage comparison (on fixture vocabulary)

60 lemmas from the Korean starter set (content words incl. 사랑하다, 앉다, 부엌, 설날): kengdic **59/60**, Wiktionary **59/60**. The only miss in both is `분다`, which is a conjugated form I mis-listed (lemma 불다), so the comparison shows **no coverage difference on this small sample**; both are kept per the plan (kengdic as the coverage fallback). This is not a coverage measurement of real lyrics.

## Decision

Use the sources above in the packs, pinned by URL + SHA-256, with the licence strings recorded in `manifest.json` `sources[]` and shown in About & licences (M9). Packs inherit CC BY-SA (ShareAlike applies to the data files, not to app code).

M7 retains these pins. The production packs contain the full trimmed Mandarin and Cantonese rows used by the engine. See [ADR 0009](0009-dictionary-blocks.md) for the revised IndexedDB format and `docs/PROGRESS.md` for production pack sizes.

## Open items

- Wiktionary's exact licence wording (CC BY-SA 4.0 vs 3.0 / GFDL) must be copied from the Wiktionary reuse page when the pack manifest is written (M9); kaikki's request for a link back and citation will be satisfied in About.
- JMdict attribution text: use the EDRDG-prescribed wording (page above) verbatim.
- Dictionary files change daily (CC-CEDICT's `Last-Modified` was the day of download); the pins above are a snapshot and will be refreshed deliberately, with the pack version bumped.

## Addendum 2026-11-06: CC-CEDICT is vendored

The MDBG URL is a rolling "latest" export rebuilt daily, so the 2026-11-05 pin broke CI the next day (the checksum guard did its job). The 2026-11-06 file was inspected against the old one: same format and header, same CC BY-SA 4.0 licence, 125,369 entries (+2) and a handful of edited definitions. The pin was refreshed deliberately (3,983,590 bytes, SHA-256 `5b6db884de36cf04ac3be268d758cd4512ba3a487c1775348ba8e18ea8f0e25f`), `zh-core` is now `2026.11.6`, and the exact file is committed as `scripts/packs/vendor/cedict-2026-11-06.zip` (`"vendored"` in `sources.json`) so builds are reproducible. Redistribution is permitted by CC BY-SA 4.0 and the attribution in `sources.json` and About → Licences already covers it. To update CC-CEDICT: download, review the diff, add a new vendored file, update the pin and bump the pack version. The other sources use versioned or dated URLs and stay download-and-verify.
