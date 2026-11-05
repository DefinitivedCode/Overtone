# Known limitations

Maintained throughout v0.1. Entries are added when a limitation is discovered or accepted; each notes the milestone that introduced it.

- **Verification environment (M0):** Playwright WebKit is desktop WebKit with mobile emulation, not iOS. Standalone mode, Home Screen storage, the real keyboard, safe areas and the status bar can only be verified by a human on a device. See `docs/IOS_VERIFICATION.md` (created in M11).
- **Splash screen device list (M1):** the iPhone sizes in `scripts/brand/devices.ts` were not verified against Apple's current specifications. A device with no matching image shows a plain background-colour launch screen instead.
- **Theme/text-size storage (M1):** until M2 they live in localStorage only (cleared with site data).
- **Japanese ambiguity (M4):** readings follow the tokenizer; 一人 (ひとり/いちにん), 二人, 一日中, 宝物 and similar are wrong in the starter set and need the ambiguous-surface list or user corrections. Poetic readings (運命=さだめ) are unpredictable by design.
- **Korean (M4):** pronunciation rules are deterministic but ㄴ-insertion and a few Sino-Korean ㄹ cases come only from a small exceptions table (`engine/ko/exceptions.ts`); verbs are lemmatised heuristically (the 20.8 MB ko-dic was rejected on size).
- **Mandarin (M4):** pinyin-pro misreads several polyphones even in Simplified (还钱, 得 as děi/de, 地 as de) and Traditional input needs the OpenCC shadow string; the ≥ 98 % accuracy target is at risk until measured in M7.
- **Linguistic fixtures (M4):** all fixtures are self-authored by the implementing agent and unreviewed by a fluent speaker; the own Korean module's 100 % on its starter set is circular.
- **Dictionaries (M4):** the CC BY-SA family requires attribution and ShareAlike for the distributed packs; Wiktionary licence wording still to be copied verbatim (M9).
- **Korean romanisation (M5):** Hanja (e.g. 愛) and Japanese inside a Korean song stay unannotated and show a `?` in Learn mode. ㄴ-insertion and Sino-Korean ㄹ exceptions beyond the 11-word table are not predicted. Jamo-only text (ㅋㅋ) is transliterated letter by letter with low confidence.
- **Songs in Japanese, Mandarin and Cantonese (M5/M6):** until their language data lands (M7/M8) these songs show the original text in every mode with a notice; progress tracking and editing work normally.
- **Learn mode (M6):** tokens are not tappable yet (the Word sheet and dictionary arrive in M9), and the long-press line menu (copy original/romanised) is not implemented yet.
