# Known limitations

Things that are genuinely limited today. Implementation notes belong in the ADRs (`docs/adr/`); entries here are removed as soon as the limitation is fixed. Each entry notes the milestone that introduced it.

## Verification

- **Real iOS (M0):** Playwright WebKit is desktop WebKit with mobile emulation, not iOS. Standalone mode, Home Screen storage and update prompts, the real keyboard, safe areas, native memory behaviour and the status bar can only be verified by a human on a device. See `docs/IOS_VERIFICATION.md`.
- **Linguistic fixtures (M4):** all fixtures are self-authored and unreviewed by a fluent speaker; the Korean module's 100 % on its starter set is circular. A native-speaker review of a sample is the single most valuable accuracy check still missing.
- **Splash screens (M1):** the iPhone sizes in `scripts/brand/devices.ts` were not verified against Apple's current specifications. A device with no matching image shows a plain background-colour launch screen.

## Language accuracy

- **Japanese (M8):** IPADIC gives one contextual reading. Rare names, readings that depend on neighbouring lines, and choices such as `kun` versus `kimi` can differ from the intended lyric. Known ambiguities are flagged and unreadable forms fall back to exact JMdict readings. Poetic readings such as 運命 as `さだめ` need pasted ruby. Mixed kanji/kana with irregular alignment can receive one reading over the whole token.
- **Korean (M4, M5):** pronunciation rules are deterministic, but ㄴ-insertion and a few Sino-Korean ㄹ cases come from a small exceptions table (`engine/ko/exceptions.ts`). Verbs are lemmatised heuristically (the 20.8 MB ko-dic was rejected on size). Hanja and Japanese inside a Korean song stay unannotated and show a `?`. Jamo-only text (ㅋㅋ) is transliterated letter by letter with low confidence.
- **Mandarin (M7):** Traditional text uses an OpenCC shadow for readings. Context-sensitive 得 and 地 can still be misread, neutral-tone choices can differ between dictionaries, and erhua uses a separate character reading with incomplete suffix detection. Differences from the accuracy gate are listed in `docs/LINGUISTIC_REPORT.md`.

## Dictionaries and word sheet

- **Word sheet (M9):** the Korean dictionary is optional (2.1 MB). Names, slang and rare compounds are often missing, and kengdic glosses are terse and sometimes noisy. Cantonese meanings come from CC-Canto, falling back to CC-CEDICT only if the Mandarin pack is installed. English words, Hanja and unreadable segments are not tappable. Meaning relevance was measured on a 20-word self-authored probe only.
- **Language packs (M8):** Japanese, Mandarin and Cantonese need a one-time download. Songs keep their original text and progress if a pack is missing. An interrupted install restarts from a cached download (no partial-byte resume). If the browser clears Cache Storage independently of IndexedDB, remove and re-download the pack. If the Japanese module worker fails, the app shows the original text and any pasted readings.
- **Dictionary licences (M4):** the CC BY-SA family requires attribution and ShareAlike for the distributed packs. About → Licences states Wiktionary as CC BY-SA 4.0 and GFDL per kaikki.org; the wording on Wiktionary's own reuse page was not re-fetched, so check it manually before wide public release.

## Features

- **Karaoke syllables:** syllable separation exists for Korean only. Mandarin and Cantonese are already per syllable; Japanese mora splitting was deliberately not implemented (ADR 0012).
- **Corrections (M10):** structural corrections are limited to split, merge, "English" and "Do not annotate". Re-analysing a span as another language and "Set line language" are not implemented (ADR 0013). Splitting a Japanese word keeps readings only where furigana units line up with the cut. A typed reading must have one syllable per character, so irregular readings of Chinese words must be entered per character.
- **Library search (M12):** romanised text is indexed for Korean only (including corrections); Japanese and Chinese songs are found by their original text.
- **Lyrics search (M12):** LRCLIB is community data with no stated licence and no uptime guarantee; anonymous use is rate-limited (the app waits out `Retry-After`). Only plain lyrics are shown; synced lyrics are stored for the future but not displayed. Search is by title/artist only. The live-service test is opt-in, so CI cannot detect a provider-side API change.
- **Romanised import (issue #4):** only Korean and Japanese (kana, no kanji) can be reconstructed; Mandarin and Cantonese romanisation is not supported. Korean spellings are ranked candidates, not a single answer (original spelling among them for about 59 % of words, first for about 29 % on self-authored fixtures). The pasted romanisation is restorable only until the song is saved. See ADR 0016.
