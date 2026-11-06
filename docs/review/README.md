# Native-speaker review (issue #14)

Every linguistic fixture in `fixtures/linguistic/` was written by the implementer, an AI, and has **never been checked by a fluent speaker**. The accuracy numbers in `docs/LINGUISTIC_REPORT.md` measure agreement with those fixtures, so a wrong expectation silently lowers or raises them. A short review fixes that.

## For the reviewer (about 15 minutes per language)

1. Open the sheet for the language you read: [Korean](ko.md), [Japanese](ja.md), [Mandarin](zh.md), [Cantonese](yue.md). Each has 40 lines, picked from the categories most likely to be wrong (polyphones, irregular forms, jukujikun, lyric spellings and so on).
2. In the **OK** column write `y` if the **Expected** reading is right for that line, or `n` if it is wrong. Leave a row blank to skip it.
3. For every `n`, write the correct reading in the **Correction** column.
4. Send the file back. You do not need to run anything.

You only judge the reading of the text as written. You do not need to know how the app works.

## For the maintainer

Record a returned sheet (it must keep its name, for example `ko.md`):

```bash
npm run review-sheets -- apply path/to/ko.md --reviewer "Reviewer Name"
```

- `y` rows get `"reviewed": true`, `reviewedBy` and `reviewedOn` in the fixture.
- `n` rows only get a `reviewNote`; **the expectation is not changed automatically**. The command prints each one as `FIX <id>: <correction>`. Resolve each by correcting the fixture (if the reviewer is right and the engine is right) or by fixing the engine (if the engine is wrong), then re-run `npm run test:ling` and update `docs/LINGUISTIC_REPORT.md`.
- Regenerate sheets (a fresh sample of lines that are still unreviewed) with `npm run review-sheets`.

Scope: this reviews readings, romanisation and tone. The dictionary meaning probe (20 words in `tests/linguistic/dictionary.test.ts`) and the starter Korean/Japanese romanised-import words are separate and not covered by these sheets.
