# ADR 0007 — Ruby rendering in WebKit

Status: accepted · Date: 2026-11-05

## Method

`scripts/spikes/ruby/harness.html` + `run.mjs`: four lines (Korean eojeol with long romanisation, Chinese characters with pinyin wider than the base character, Japanese furigana with okurigana, a Latin base with a very long `rt`) rendered two ways in Playwright **WebKit 27.2** and **Chromium** at 320 and 375 px, with `lang` set per line:

- **A:** native `<ruby>`/`<rt>` inside a `<button>` styled as text.
- **B:** `<button>` containing an inline-flex column stack (`.rt` above `.base`).

Measured per variant: `rt` outside its token, `rt` collisions between neighbours on the same line, document horizontal overflow, and token height. Screenshots: `docs/adr/assets/0007-ruby-{webkit,chromium}-{320,375}.png`.

## Measured

| Engine / width    | A: rt outside token | A: rt collisions | A: overflow | B: rt outside | B: collisions | B: overflow |
| ----------------- | ------------------- | ---------------- | ----------- | ------------- | ------------- | ----------- |
| WebKit 320        | 0                   | 0                | none        | 0             | 0             | none        |
| WebKit 375        | 0                   | 0                | none        | 0             | 0             | none        |
| Chromium 320, 375 | 0                   | 0                | none        | 0             | 0             | none        |

Both align annotations over their base, wrap between tokens, and never overflow at 320 px, including the 28-letter `rt` over a single character. Differences:

- **A** keeps ordinary line spacing, lets the ruby engine widen narrow bases for wide annotations, is semantically ruby (copy/paste and AT can interpret it), and annotation-less tokens do not add height. Its token boxes are short (WebKit: 4 of 25 under 36 px; Chromium: 22 of 25) because inline box height follows the font.
- **B** guarantees ≥ 44 px token height but adds a blank annotation row to every token and made line heights uneven (88 px lines even where only some tokens had `rt`).

## Decision

**Variant A: native `<ruby>` inside `<button>`.** Reach the 44 × 44 pt target (J4.3) with vertical `padding` on the inline button, which enlarges the hit area without changing line layout (to be verified with bounding-box tests in M6, not yet tested here), and mark `rt` `aria-hidden` inside buttons (DESIGN_SYSTEM §8). Reserve space on lines that contain annotations with `line-height` and `ruby-position: over`.

## Limits of this spike

Only desktop WebKit/Chromium were used; real iOS Safari rendering of `<ruby>` in `<button>` is unverified (manual checklist items 11, 27). Furigana beyond one `rt` per base (jukujikun) and vertical text were not tested.
