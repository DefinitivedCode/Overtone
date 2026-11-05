# Known limitations

Maintained throughout v0.1. Entries are added when a limitation is discovered or accepted; each notes the milestone that introduced it.

- **Verification environment (M0):** Playwright WebKit is desktop WebKit with mobile emulation, not iOS. Standalone mode, Home Screen storage, the real keyboard, safe areas and the status bar can only be verified by a human on a device. See `docs/IOS_VERIFICATION.md` (created in M11).
- **Splash screen device list (M1):** the iPhone sizes in `scripts/brand/devices.ts` were not verified against Apple's current specifications. A device with no matching image shows a plain background-colour launch screen instead.
- **Theme/text-size storage (M1):** until M2 they live in localStorage only (cleared with site data).
- **Japanese ambiguity (M4):** readings follow the tokenizer; 一人 (ひとり/いちにん), 二人, 一日中, 宝物 and similar are wrong in the starter set and need the ambiguous-surface list or user corrections. Poetic readings (運命=さだめ) are unpredictable by design.
- **Korean (M4):** pronunciation rules are deterministic but ㄴ-insertion and a few Sino-Korean ㄹ cases come only from a small exceptions table (`engine/ko/exceptions.ts`); verbs are lemmatised heuristically (the 20.8 MB ko-dic was rejected on size).
- **Mandarin (M7)** Traditional text uses an OpenCC shadow for readings. Context-sensitive 得 and 地 can still be misread, and neutral-tone choices can differ between dictionaries. Erhua uses a separate character reading, with contextual suffix detection and uncertainty flagging still incomplete. The fixture suite passes the accuracy gate, with differences listed in `docs/LINGUISTIC_REPORT.md`.
- **Linguistic fixtures (M4):** all fixtures are self-authored by the implementing agent and unreviewed by a fluent speaker; the own Korean module's 100 % on its starter set is circular.
- **Dictionaries (M4):** the CC BY-SA family requires attribution and ShareAlike for the distributed packs; Wiktionary licence wording still to be copied verbatim (M9).
- **Korean romanisation (M5):** Hanja (e.g. 愛) and Japanese inside a Korean song stay unannotated and show a `?` in Learn mode. ㄴ-insertion and Sino-Korean ㄹ exceptions beyond the 11-word table are not predicted. Jamo-only text (ㅋㅋ) is transliterated letter by letter with low confidence.
- **Language packs (M7)** Mandarin and Cantonese need a one-time download. Songs retain original text and progress if a pack is missing. Interrupted installations can restart using a cached download, with no partial byte resume. A fresh pack build requires the exact source archives in `.cache/dicts` or from their publishers. The live CC-CEDICT URL changes over time, so a missing pinned archive can block a fresh build until the pin is deliberately refreshed.
- **Japanese (M7)** Japanese songs display original text in all modes while Japanese readings await M8. Progress tracking and editing are available.
- **Offline shell (M7)** The precache is 2.213 MiB because the main-thread fallback and the worker each have a copy of the readers. See ADR 0010. Playwright covers installed-pack offline workflows. Real iOS Home Screen behaviour and update prompts are still unverified.
- **Learn mode (M6):** tokens are not tappable yet (the Word sheet and dictionary arrive in M9), and the long-press line menu (copy original/romanised) is not implemented yet.
