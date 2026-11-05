# ADR 0004 — Mandarin: pinyin-pro and opencc-js

Status: accepted · Date: 2026-11-05

## Method

`scripts/spikes/chinese.mjs` on `fixtures/linguistic/zh/starter.json` (36 probe words/phrases: polyphones in context, neutral tones, erhua, Traditional input). Packages: `pinyin-pro` 3.29.5 (MIT), `opencc-js` 1.4.2 (MIT AND Apache-2.0).

## Measured

- **Default options are not citation tones.** pinyin-pro applies 一/不 tone sandhi by default (`一个 → yí gè`, `不是 → bú shì`). The option **exists**: `toneSandhi: false` gives `yī gè`, `bù shì`. Overtone's default (sandhi off, J13.3) passes `toneSandhi: false`; sandhi-on is the library's own behaviour, so no separate projection is needed for 一/不 (the LANGUAGE_ENGINE §6.4 fallback is not required).
- **Accuracy (exact reading, `toneSandhi:false`): 26/36.** Simplified misses: 还钱 (hái, want huán), 跑得快 (dé, want de), 我得去 (dé, want děi), 慢慢地走 (dì, want de). Also 對不起 (bù, want bu) and four Traditional polyphone cases: 銀行 (xíng), 長大 (cháng), 音樂 (lè), 覺得 (dé), 還是 (huán).
- **Traditional input is not handled** by pinyin-pro's word dictionary: the Traditional polyphone cases fail where the Simplified equivalents pass. This confirms the plan: feed a **simplified shadow string** (opencc-js) to pinyin-pro and map readings back by index.
- **opencc-js `hk→cn` preserved length on 16/16 samples** (including 裡→里, 髮→发, 軟體→软体). A length check with fallback remains mandatory because the converter is phrase-based.
- Neutral tone is `0` in numbers mode (`ma0`), not 5: map to 5 in our model. `儿` returns `ér`: flag `erhua`. Mixed Latin must be segmented by us (pass Han-only segments), otherwise Latin is split letter by letter.
- Sizes (gzip): pinyin-pro `dist/index.js` 140 KB; opencc-js `full.js` 501 KB, `cn2t.js` 456 KB, **`t2cn.js` 54 KB**.

## Decision

`pinyin-pro` for readings with `toneSandhi: false` by default, as a lazy-loaded chunk (140 KB gz); the **opencc-js `t2cn` build (54 KB gz)** for the shadow string; CC-CEDICT max-match with entry-by-reading selection (LANGUAGE_ENGINE §6.1) provides word-level corrections for cases like 还钱 / 跑得快 / 我得去 / 慢慢地.

**Risk:** the ≥ 98 % pinyin threshold (TEST_STRATEGY §4.4) is not assured by the library alone (26/36 here). It will be measured on the real ≥ 120-line suite in M7; if it cannot be met the limitation is recorded rather than the threshold changed.
