# ADR 0012 — Learn reading-first layout and Karaoke syllable separation

Status: accepted · Date: 2026-11-05

## Context

The owner's manual preview found Learn mode hard to follow: romanisation was 0.52 em, English words sat in the original-script row with nothing above them, so the eye jumped between rows. Karaoke could only show word-level romanisation.

## Decisions

- **Native `<ruby>` stays** (ADR 0007). Learn gains a persisted, device-local `display.learnEmphasis`: `reading` (default) makes the romanisation the larger row (≈ 1.0 × the lyric size, original script at 0.82 ×); `original` keeps the original larger with a 0.66 em reading. English tokens in Korean/Chinese songs join the reading row in `reading` mode as ruby whose base is invisible (still in the DOM for copy, search and screen readers); in `original` mode they are plain text. Japanese keeps small furigana and enlarges the romaji line instead.
- **Syllable separation is Korean only.** `romaniseEojeolSyllables` returns one romanised piece per Hangul syllable _after_ the pronunciation rules (so 좋다 → `jo-ta`, 있어요 → `i-sseo-yo`), and the pieces always join to `romaniseEojeol`'s output (unit tested over every fixture, both modes). Separator: `-`, which can wrap at hyphens. Mandarin and Cantonese are already shown one syllable per character, so there is nothing to toggle. Japanese is not split: mora segmentation interacts with long-vowel macrons, geminates, ん before vowels and particle readings, and a naive split would be wrong. This is a documented gap, not an oversight.
- `display` settings live in the Settings record but are excluded from backups (device-local, like Library view state), so the backup format and checksum are unchanged.
- UI chip labels are `KR/JP/CN/HK`; stored language codes stay `ko/ja/zh/yue`.
