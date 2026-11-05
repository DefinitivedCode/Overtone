# ADR 0005 — Cantonese: to-jyutping

Status: accepted · Date: 2026-11-05

## Method

`scripts/spikes/chinese.mjs` on `fixtures/linguistic/yue/starter.json` (40 probes: Cantonese-specific characters 嘅 咗 唔 冇 佢哋 喺 嘢 啲 嚟 睇 瞓 搵/揾 攰 啱 咁 嗰, polyphones 行/長/重/樂/覺/落, particles).

## Measured

- `to-jyutping` 3.1.1 (BSD-2-Clause; data from rime-cantonese, CC BY 4.0): **40/40 exact**. One expectation in my first draft was wrong (音樂 is `jam1 ngok6`, not `jyut6`); corrected with a note in the fixture. Every Cantonese-specific character has a reading.
- **Simplified input works natively** (学校 → `hok6 haau6`, 我们 → `ngo5 mun4`), so the opencc-js shadow step planned in LANGUAGE_ENGINE §7.1 is **not needed for readings** (it is still needed to match Traditional headwords in CC-Canto/CEDICT for meanings).
- Size: **273 KB gzip** (380 KB raw; ESM and CJS identical): a lazy-loaded chunk. API: `getJyutpingList(text)` → `[char, jyutping | null][]`; exports `module`, `main` and a `browser` condition. Upstream activity is slow (LANGUAGE_ENGINE §2.5); the fallback remains building our own longest-match reader from rime-cantonese.

## Decision

`to-jyutping` behind a `CantoneseReader` interface, lazy chunk, no opencc for readings. The 40-item probe is small and self-authored: 40/40 must not be read as general accuracy. The ≥ 95 % (polyphones ≥ 88 %) thresholds are assessed on the ≥ 120-line suite in M7.
