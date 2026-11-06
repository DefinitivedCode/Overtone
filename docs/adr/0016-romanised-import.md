# ADR 0016 — Romanised lyrics import (issue #4)

Status: accepted · Date: 2026-11-06

## Problem

Lyrics sources (including LRCLIB) often provide only romanisation. The Add Song sheet could not save Latin-only text because no language was detected.

## Decisions

- **Reviewable, never silent.** Pasted romanisation stays in the Lyrics field until the user taps "Use these lyrics" in a separate review step (`Convert Lyrics`). Afterwards "Restore pasted text" puts the paste back until the song is saved; the pasted text is included in the autosaved draft (`Draft.pastedRomanisation`). Once saved, the song stores only the accepted lyrics: persisting the paste would change the backup format, so it is deliberately not done.
- **Local and offline.** Everything is synchronous TypeScript in `src/lyrics/reverse/` and reuses the forward romaniser; no network and no new dependency.
- **Initial scope, from measurement:**
  - **Korean (Revised Romanization → Hangul):** on the 73 words of `fixtures/linguistic/ko/starter.json`, romanised with the app's own romaniser, the original spelling appears among the candidates for 59 % of words and is the first candidate for 29 %. Sound does not determine spelling (silent ㅎ, liaison 먹어/머거, assimilation 국물/궁물), so the result is a ranked list, each strict candidate verified to romanise back to the pasted word, and underlined for review. These figures come from self-authored fixtures and are floors enforced in `reverse.test.ts`, not promises.
  - **Japanese (romaji → kana):** Hepburn, Nihon-shiki/Kunrei spellings, macrons, `n'`, sokuon and ん are deterministic. Output is hiragana with katakana offered; **kanji are never reconstructed**. Particles は/わ, を/お, へ/え and long vowels (ou/oo) are offered as alternatives.
  - **Mandarin / Cantonese: not supported.** Pinyin and jyutping map to many characters per syllable and need word-level dictionary ranking over the optional packs; this is a candidate for a later change.
- **Detection** (`detectRomanised`) requires ≥ 90 % Latin letters and that ≥ 75 % of a sample of non-English words parse as Korean or Japanese romanisation; ties are broken by markers (`eo`, `eu`, final `ng` vs `tsu`, `shi`, `ou`). A null language still offers the choice. Common English words that happen to parse ("you", "in", "me") are kept as written (with the conversion one tap away); words that are everyday Japanese ("no", "to") are not demoted in Japanese.
- **Preserved:** line breaks, section labels, blank lines, punctuation, English spans and numbers pass through unchanged; per-line manual editing overrides word choices.

## Known gaps

No lexicon ranking (an installed Korean dictionary could order candidates); Korean letters ㅎ and doubled finals are only recovered as sound; non-standard conventions beyond the listed variants (k/g, t/d, p/b, ch/j, `oo`, `ee`, `sh`) are not read; a long list of English words is not exhaustive, so English words that look like romanisation may be offered in kana/Hangul (they are underlined and one tap from being reverted).
