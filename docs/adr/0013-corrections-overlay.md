# ADR 0013 — Corrections overlay

Status: accepted · Date: 2026-11-05

## Decisions

- **Everything is applied on the main thread at render time** (`src/engine/overlay.ts`), including the structural corrections (split, merge, "English", "Do not annotate"). LANGUAGE_ENGINE §12 proposed sending structural corrections to the worker and into the cache key. Each of these edits is a deterministic rewrite of already-analysed tokens that needs no linguistics, so doing it at render time keeps analysis caches shared and valid, makes every edit instant in all three modes (J8.3), and makes revert a plain delete (J8.5).
- **One stored record per intent.** A value record (reading / romanisation / meaning) is updated in place; split, merge and segment-type edits each create their own record. Tokens carry `correctionIds`, so the Word sheet edits or reverts exactly the records that produced a token, even after a merge or split changed its surface.
- **Scope.** "This line" stores the line key (identical repeated lines share it) and, when the word repeats within the line, its occurrence; "Every line in this song" stores `lineKey: null`. Line-specific corrections win over song-wide ones.
- **Language.** Corrections store the song language at creation; the overlay ignores records whose language differs from the song's, so they become inactive after a language change and active again if it is switched back.
- **Unmatched corrections** are listed (Review) once every line is analysed and the language data is installed. They are never removed automatically; "Clean up unused corrections" removes them on request.
- **Input helpers** (`src/engine/input.ts`): romaji → hiragana (Hepburn, Nihon/Kunrei, macrons, っ, ん), pinyin with marks/numbers (syllable-inventory check is a warning), Jyutping `[a-z]+[1-6]` (error). Syllable count must equal the character count for Chinese readings.

## Not built (deliberate)

- **Re-analysing a span as another language** and the line menu's **"Set line language"**. They need the worker to run a different analyser over a span; v0.1 offers "English" and "Do not annotate" only. Recorded in `docs/KNOWN_LIMITATIONS.md`.
- Splitting Japanese words keeps readings only where furigana units line up with the cut; otherwise the pieces show as unreadable rather than guess.
