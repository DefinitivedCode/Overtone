# Overtone — Design System & iOS PWA Behaviour

---

## 1. Name and brand

### 1.1 Name: **Overtone**

An overtone is the quieter tone that rings *above* a sung note. In Overtone, pronunciation sits above the lyric line — the same layering, made visible. The name is short, musical, language-neutral (it doesn't privilege any of the four languages), easy to say for learners of all of them, and works as a lowercase wordmark.

- Wordmark: `overtone` (lowercase).
- Tagline: **Read it. Say it. Sing it.** (maps to Learn → Karaoke → memorised).
- Home Screen label: `Overtone` (fits under an icon without truncation).
- Repository/folder rename to `overtone` is recommended but is a human decision (it changes the remote URL).

Shortlist considered: *Liner* (liner notes; too close to "linear"), *Furi* (from furigana; Japanese-centric), *Utaline* (Japanese-centric), *Ruby Lines* (conflicts with the Ruby language), *Saeum* (Korean-centric). Overtone won on neutrality and meaning.

A web search during planning found no lyrics-learning app called Overtone, but this is **not** a trademark clearance. If the app is ever published beyond personal use, a proper trademark search is a human task.

### 1.2 Brand mark

Two strokes, read like annotated text: a short **vermilion** stroke (the annotation) above a long **paper** stroke (the lyric line), with a faint second line beneath. It is abstract enough to be language-neutral, and reads at 16 px.

- Master: [`planning/brand/icon.svg`](brand/icon.svg) (concept v1; move to `/brand/icon.svg` in M1).
- Grid: 1024 × 1024 canvas. Annotation stroke `x=232 y=312 w=248 h=64 r=32`; line 1 `x=232 y=420 w=560 h=120 r=60`; line 2 `x=232 y=592 w=400 h=120 r=60 opacity .26`. The mark's bounding box (232–792 × 312–712) fits within the maskable safe zone (circle of radius 409.6 around the centre) — verified by arithmetic: farthest corner is ≈ 344 px from centre.
- Colours: ground `#17141A` (ink), strokes `#F4EFE7` (paper), annotation `#E5533A` (vermilion — the colour of a name seal, shared across East Asian visual culture without belonging to any single one).
- Clear space: ≥ 1 annotation-stroke height on all sides.
- Never: add gradients, glass, shadows, outlines, or letters inside the icon; never recolour the annotation stroke except in monochrome contexts.

### 1.3 Banner

Concept: [`planning/brand/banner.svg`](brand/banner.svg) — paper background, mark + wordmark + tagline, and a specimen row showing the same phrase in Korean, Japanese, Mandarin and Cantonese with romanisation above in vermilion. It shows what the product does in one glance. The phrases are generic ("I love you"), not song lyrics.

Uses:
- `docs/banner.png` 1280 × 640 — README header and GitHub social preview.
- `public/og.png` 1200 × 630 — Open Graph image (same layout, re-flowed).

### 1.4 Asset generation pipeline (`npm run brand`)

Goal: one set of master SVGs → every raster asset, deterministically, with no dependence on fonts installed on the build machine.

Tools (dev dependencies only):
- **@resvg/resvg-js** (MPL-2.0) — SVG → PNG, accurate, no headless browser.
- **opentype.js** (MIT) — converts wordmark/banner text into outlined `<path>`s from pinned font files, so final SVGs contain no `<text>`.
- Fonts for outlining (OFL, downloaded by script into `.cache/fonts/` with SHA-256 pins): Instrument Serif (wordmark), Noto Sans KR / JP / SC / HK (banner specimen glyphs only), Inter or system-equivalent for the tagline (any OFL sans).

`scripts/brand/generate-assets.ts` steps:
1. Read `brand/icon.svg`, `brand/mark.svg` (mark only, transparent), `brand/banner.src.svg` (with `<text>` placeholders + font ids).
2. Outline text → write `brand/banner.svg` and `brand/wordmark.svg` (committed, self-contained).
3. Render:
   | Output | Size | Notes |
   |---|---|---|
   | `public/icons/apple-touch-icon.png` | 180 × 180 | Opaque, full-bleed, no rounded corners (iOS masks). |
   | `public/icons/icon-192.png`, `icon-512.png` | 192, 512 | `purpose: any`. |
   | `public/icons/maskable-512.png` | 512 | `purpose: maskable`; same art (already safe-zone compliant). |
   | `public/favicon.svg` | vector | Mark on transparent; uses `@media (prefers-color-scheme: dark)` inside the SVG to swap ink/paper. |
   | `public/icons/favicon-32.png` | 32 | Fallback. |
   | `public/splash/*.png` | per device | Background = theme `--bg` (light and dark variants), centred mark at 22 % of short side, no text. |
   | `docs/banner.png` | 1280 × 640 | |
   | `public/og.png` | 1200 × 630 | |
4. Emit `src/app/splash-links.generated.ts` containing the `<link rel="apple-touch-startup-image" media="…">` list used by `index.html` (injected by a tiny Vite plugin at build).
5. Print a table of outputs with byte sizes; fail if any PNG > 200 KB.

Splash device list lives in `scripts/brand/devices.ts` as `{ name, cssWidth, cssHeight, dpr }` for current iPhones in portrait (and iPads optional). The list must be checked against Apple's current device specifications at implementation time; devices without a matching image fall back to a plain background colour (acceptable, not broken). Media query form: `(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)`.

Visual regression test: render outputs and compare against committed snapshots (pixel diff ≤ 0.5 %).

---

## 2. Design principles

1. **Lyrics are the interface.** Chrome recedes; type does the work.
2. **Ink on paper.** A warm paper ground and soft ink text in light mode; ink ground and paper text in dark mode. One accent colour.
3. **Quiet confidence.** No gradients, no glassmorphism, no card soup, no decorative illustration. Hierarchy from size, weight and space.
4. **Native manners, web honesty.** Behave like iOS (sheets, momentum, safe areas) using accessible HTML controls rather than pixel-faking UIKit.
5. **Every state designed.** Empty, loading, partial, offline, error, and success states are specified, not improvised.

---

## 3. Colour tokens (`src/styles/tokens.css`)

All colours are CSS custom properties on `:root`, switched by `[data-theme="light"|"dark"]` on `<html>` (resolved from setting + `prefers-color-scheme`).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F2EC` | `#121014` | App background, splash |
| `--bg-elevated` | `#FFFDF9` | `#1C1920` | Sheets, menus |
| `--bg-sunken` | `#EEE8E0` | `#0C0A0E` | Search field, segmented control track |
| `--text` | `#1B181E` | `#EEE8E0` | Primary text, lyrics |
| `--text-secondary` | `#5E5763` | `#A79FAB` | Artist, metadata, romaji line |
| `--text-tertiary` | `#8A8290` | `#756E7A` | Hints, placeholders (only on ≥ 17 px or non-essential) |
| `--annotation` | `#B23A26` | `#F0846C` | Ruby/romanisation above lyrics |
| `--accent` | `#C2412B` | `#F0674A` | Primary buttons, checks, focus ring, links |
| `--accent-contrast` | `#FFFFFF` | `#17141A` | Text on accent |
| `--separator` | `rgba(27,24,30,.10)` | `rgba(238,232,224,.10)` | Hairlines |
| `--learned` | `--text-secondary` | `--text-secondary` | Learned line text |
| `--danger` | `#B3261E` | `#FF8A80` | Delete |
| `--warning` | `#8A5A00` | `#E8B04A` | Storage warnings |
| `--success` | `#2F6B3A` | `#7CCB8A` | Backup done |

Contrast requirement: `--text`, `--text-secondary`, `--annotation`, `--accent` on `--bg` and `--bg-elevated` must be ≥ 4.5:1; `--text-tertiary` ≥ 3:1 and only used for non-essential or large text. A unit test computes contrast ratios from the token file and fails below thresholds (values above are starting points; adjust to pass).

Language chips use **no per-language colour** (avoids rainbow UI and national-colour connotations); they use a two-letter code in a quiet outlined chip: `KO`, `JA`, `ZH`, `YUE` with full names for screen readers.

`<meta name="theme-color">` is emitted twice with `media="(prefers-color-scheme: light|dark)"` using `--bg` values, and updated by script when the user forces a theme.

---

## 4. Typography

### 4.1 Families

| Role | Stack | Notes |
|---|---|---|
| Display (song titles in headers, wordmark, empty states) | `"Instrument Serif"`, `ui-serif`, `Georgia`, serif | Self-hosted, Latin subset, WOFF2 (~20–30 KB), OFL. The only web font. `font-display: swap`. |
| UI | `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif` | |
| Korean | `"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif` | applied via `:lang(ko)` |
| Japanese | `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif` | `:lang(ja)` |
| Mandarin | `"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif` for `zh-Hans`; `"PingFang TC", "Noto Sans TC"` for `zh-Hant` | detect script per song (simplified vs traditional) and set `lang` accordingly |
| Cantonese | `"PingFang HK", "Noto Sans HK", "Microsoft JhengHei", sans-serif` | `:lang(zh-HK)` |
| Romanisation | UI stack, `font-feature-settings: "case"`; diacritics must render (ǎ ǚ ō) | |

CJK web fonts are **not** downloaded (multi-MB); iOS ships excellent system CJK fonts. Correct `lang` attributes on every lyric line/segment are mandatory — Han unification means the same code point renders differently in ja / zh-Hans / zh-Hant / zh-HK fonts.

### 4.2 Scale (base 17 px = iOS body)

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--type-large-title` | 34/41, Instrument Serif | 400 | Library title "Library" |
| `--type-title` | 28/34, Instrument Serif | 400 | Song title on Song screen |
| `--type-headline` | 17/22 | 600 | Row titles, sheet titles |
| `--type-body` | 17/24 | 400 | Body, form fields (≥ 16 px prevents iOS focus zoom) |
| `--type-subhead` | 15/20 | 400 | Artist, metadata |
| `--type-footnote` | 13/18 | 400 | Captions, section labels |
| `--type-caption` | 12/16 | 500, tracking +0.02em | Chips, badges |

Lyric sizes scale with the **Text size** setting (5 steps: 0.85, 0.92, 1, 1.12, 1.25 × base):

| Mode | Base text | Annotation | Line gap |
|---|---|---|---|
| Learn | 22 px CJK / 19 px Latin | 0.52 em (ruby), romaji line 0.72 em | 1.1 em between lines, 2 em stanza gap |
| Karaoke | 30 px, weight 500, line-height 1.35 | — | 0.6 em between lines, 1.6 em stanza gap |
| Clean | 19 px, line-height 1.6 | — | stanza gap 1.4 em |

Typography rules: `text-wrap: pretty` where supported; `overflow-wrap: anywhere` on romanisation and Latin runs; `hyphens: manual`; `font-variant-east-asian: proportional-width` off (keep CJK full-width); `text-spacing-trim`/`line-break: strict` for CJK where supported (progressive).

---

## 5. Spacing, shape, elevation

- Spacing scale (px): 2, 4, 8, 12, 16, 20, 24, 32, 40, 56. Screen side gutter 20 (16 at ≤ 340 px width) plus `env(safe-area-inset-left/right)`.
- Radii: 10 (controls), 14 (rows/menus), 20 (sheet top corners), 999 (chips, segmented control).
- Elevation: sheets use `--bg-elevated` + one shadow `0 -1px 0 var(--separator), 0 -12px 40px rgba(0,0,0,.12)` (dark: `.5`). No other shadows. Separators are hairlines (`0.5px` on 2×/3× via `transform: scaleY(.5)` or `1px` + low alpha).
- Icons: **lucide-react** (ISC), 1.75 stroke, 22 px default, `currentColor`. Only icons from Lucide; no mixed sets.

---

## 6. Layout and screens

Breakpoints: designed for 320–440 px phones first; ≥ 700 px (iPad/desktop) centres content in a 640 px column (lyrics) / 720 px (library) with the same layout — no separate tablet design in v0.1.

### 6.1 Library

```
┌───────────────────────────────┐ ← status bar (safe-area-inset-top)
│ Library                  ⚙︎  ＋ │ large title (Instrument Serif); collapses into
│ ┌───────────────────────────┐ │   a compact sticky bar on scroll
│ │ 🔍 Search songs, artists, lyrics│
│ └───────────────────────────┘ │
│ [All 12] [KO 5] [JA 4] [ZH 2] [YUE 1]   ⇅ Recently opened │
│───────────────────────────────│
│ Song title                 KO │ row: title (headline), artist · lines (subhead),
│ Artist · 32 lines     ▓▓▓░░ 60%│   progress bar 3 px, language chip; 64 px min height
│───────────────────────────────│
│ …                             │
└───────────────────────────────┘
```
- Add (`＋`) button is in the header and also a floating pill "Add song" at the bottom when the list is short? **Decision:** header button only + empty-state primary button. No FAB (non-iOS idiom).
- Row press → Song screen with push transition. Long-press → context menu (Open, Edit details, Delete).
- States: **Empty library** (mark, "Your songbook is empty", "Paste the lyrics of a song you love and Overtone will help you read, understand and sing it.", [Add a song]); **No results**; **Loading** (rows skeleton only if > 150 ms); **Recovery** (see PRODUCT_SPEC J12.5); **Backup reminder** banner (dismissible, above list); **Update available** toast; **Install tip** (Safari only).

### 6.2 Add Song sheet (full height)

- Top bar: Cancel · "New Song" · Save (accent, disabled until valid).
- Segmented control: **Paste lyrics** | **Search online**.
- Paste: Title, Artist, Language (menu button showing "Auto-detect · Looks like Japanese"), Lyrics textarea (auto-grows, monospace **not** used; uses language font once detected; min 8 rows).
- Han-only detection: inline choice row "Mandarin / Cantonese" with the suggestion pre-selected and labelled "Suggested".
- Search online: Title field, Artist field, Search button; results list (track, artist · album · 3:41, "No plain lyrics" disabled state); offline/empty/error states; licence notice footnote.
- Keyboard: the sheet's top bar stays visible; the focused field is scrolled into view above the keyboard using `visualViewport` (see §9.5).

### 6.3 Song screen

```
┌───────────────────────────────┐
│ ‹ Library                 ⋯   │ compact bar (title appears here after scroll)
│ Song Title                     │ title (Instrument Serif 28), artist, language chip
│ Artist · KO · 18/32 learned    │
│ [ Learn | Karaoke | Clean ]    │ segmented control, sticky under the bar
│───────────────────────────────│
│ ○  sa·rang·hae  bo·go  si·peo  │ Learn: check column (44 px) + annotated line
│    사랑해       보고   싶어     │
│ ✓  …(learned: muted)           │
└───────────────────────────────┘
```
- Mode switch: crossfade 150 ms; scroll position is preserved proportionally (anchor = first visible line index).
- Processing state: lines render immediately with original text; annotations fade in per line (opacity 0→1, 120 ms; none under reduced motion). A thin indeterminate bar under the segmented control while processing; "Downloading Japanese data · 8.2 / 21 MB" when a pack is loading.
- Banners: pack missing offline; some corrections couldn't be applied.
- `⋯` menu: Edit lyrics, Edit details, Reset progress, Re-process song, Delete song (destructive, red, confirm).

**Learn line anatomy**
- Leading 44 × 44 check button (circle outline → filled accent circle with check). `aria-pressed`, label "Mark line 3 as learned".
- Tokens: each word is a `<button>` styled as text (no background), with 4 px horizontal padding contributing to the hit area; pressed state: `--bg-sunken` rounded background. Tokens separated by natural spacing; Japanese/Chinese tokens show a 1 px gap between word tokens (word boundary cue) rather than underlines.
- Annotation above base via native `<ruby>`/`<rt>` (`ruby-position: over`; `rt` in `--annotation`). Japanese: furigana on kanji only + romaji line below in `--text-secondary`. Korean: romanisation over each eojeol. Chinese: syllable over each character.
- Low-confidence token: 1 px dotted underline in `--text-tertiary`. Unknown reading: "?" in `rt` in `--text-tertiary`. User-corrected: 4 px accent dot after the token (top-right).
- Learned line: text and annotation in `--learned`; check filled. No strikethrough.
- Section label: footnote style, uppercase tracking, `--text-tertiary`, no check button (column empty).

**Karaoke**: no check column; romanised lines centred-left; section labels as small captions; bottom padding = 40 vh so the last line can be scrolled to mid-screen.

**Clean**: segmented control "Original | Romanised" right-aligned under the title; plain paragraphs per stanza; selectable text.

### 6.4 Word sheet (half-height detent, expandable)

```
 愛してる                     ✕
 あいしてる · aishiteru
 Dictionary form 愛する (あいする) · verb
 1. to love
 2. to be in love with
 Source: JMdict                       Edited by you · Revert
 [ Correct… ]
```
- Senses ≤ 5; "Show more" if available. Particles show the static particle gloss.
- Low confidence explanation line: "This reading depends on context — check it" (polyphone), "Dictionary form guessed".
- Opening: from the token; focus moves to sheet heading; closing returns focus to the token.

### 6.5 Correction sheet (full height)

Fields depend on language (§PRODUCT_SPEC J8). Reading field with live preview of the annotated token. Scope radio group: "This line only" / "Every line in this song". Language menu for the span. Split/Merge: a row of the token's characters with tap-to-place split markers; "Merge with next word" button. Save / Cancel; Revert to generated.

### 6.6 Settings

Grouped list (iOS-style inset groups, real `<button>`/`<select>`/`<input type=checkbox role=switch>`):
Appearance · Text size (stepper with live lyric preview) · Romanisation · Offline language data (row per language: status "Downloaded · 21 MB" / "Not downloaded · ≈ 21 MB" / progress) · Backup (Export, Import, "Last backup: 3 days ago", storage protection status) · About (version, licences & data sources, diagnostics, "How your data is stored" explainer).

### 6.7 Toasts, dialogs, menus

- Toast: bottom, above safe area, 1 line + optional action, auto-dismiss 4 s (8 s with Undo), `role="status"`; pauses on focus/hover.
- Confirm dialog: native `<dialog>` centred card for destructive confirms (Delete song, Replace library, Reset progress).
- Menus: anchored popover (`<dialog>` or Popover API with fallback), items 44 px, destructive item last and red.

---

## 7. Motion

| Interaction | Animation | Reduced motion |
|---|---|---|
| Push to Song screen / back | View Transitions API: new page slides in 24 px + fade, 280 ms `cubic-bezier(0.2, 0.8, 0.2, 1)`; fallback: none | crossfade 100 ms or none |
| Sheet open/close | translateY 100 % → 0, 320 ms `cubic-bezier(0.32, 0.72, 0, 1)`; backdrop fade 0 → .35 | fade 120 ms |
| Sheet drag-to-dismiss | follows finger on the grabber/header; dismiss if > 30 % or velocity > 0.5 px/ms | still allowed (user-driven) |
| Learned toggle | check scales .8 → 1, 160 ms; line colour transition 200 ms | instant |
| Annotation arrival | opacity 0 → 1, 120 ms | instant |
| Large title collapse | scroll-linked (CSS `animation-timeline: scroll()` where supported; else IntersectionObserver toggle) | instant toggle |

Only `transform` and `opacity` are animated. No looping or decorative animation. Respect `prefers-reduced-motion: reduce` globally via a `--motion-scale` token (0 under reduced motion).

---

## 8. Accessibility

- Semantic HTML first: real buttons, links, inputs, `<dialog>`, headings (one `h1` per screen).
- Every lyric line container has the correct `lang`; romanisation `rt` has `lang="ko-Latn"` / `ja-Latn` / `zh-Latn-pinyin` / `yue-Latn-jyutping`.
- Screen readers: in Learn mode each token button's accessible name = surface + reading + "Show meaning"; `<rt>` is `aria-hidden` inside buttons to avoid double reading. Karaoke/Clean lines are plain text.
- Focus visible: 2 px `--accent` ring, 2 px offset, on `:focus-visible` only.
- Touch targets ≥ 44 × 44 pt; spacing between adjacent token targets ≥ 2 px (tokens overlap hit areas via padding, never via negative margins).
- Text size setting up to 1.25× plus browser zoom 200 % without horizontal scroll (reflow at 320 px).
- Colour never carries meaning alone: learned = check icon + state; low confidence = underline + sheet text.
- Live regions: processing status (`aria-live="polite"`, throttled), toasts.
- Keyboard: full operation with a hardware keyboard (iPad / desktop): Tab order, Enter/Space toggles, Escape closes sheets, arrow keys move within segmented controls and menus.

---

## 9. iOS PWA behaviour (primary platform)

### 9.1 Manifest (`public/manifest.webmanifest`)

```json
{
  "id": "/",
  "name": "Overtone",
  "short_name": "Overtone",
  "description": "Learn to read, understand and sing lyrics in Korean, Japanese, Mandarin and Cantonese.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#F6F2EC",
  "theme_color": "#F6F2EC",
  "lang": "en",
  "categories": ["education", "music"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
(Paths respect `VITE_BASE`.)

### 9.2 `index.html` head

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Overtone">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#F6F2EC" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121014" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="format-detection" content="telephone=no">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<!-- generated apple-touch-startup-image links (light + dark) -->
```
- **Do not** set `maximum-scale=1` or `user-scalable=no` (accessibility). Prevent focus zoom by keeping inputs ≥ 16 px.
- `black-translucent` puts content under the status bar; every top bar pads by `env(safe-area-inset-top)`. Status-bar text colour follows the system appearance in this mode; verify legibility in both themes on device (manual checklist).

### 9.3 Viewport and safe areas

- App height uses `100dvh` (fallback `100vh` → `-webkit-fill-available`). Avoid `100vh` for fixed layouts.
- Top bars: `padding-top: env(safe-area-inset-top)`; bottom-anchored UI (toasts, sheet footers): `padding-bottom: max(16px, env(safe-area-inset-bottom))`; side gutters add `env(safe-area-inset-left/right)` for landscape.
- Detect standalone: `matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`; expose as `data-standalone` on `<html>` for CSS tweaks (e.g. hide install tip).

### 9.4 Scrolling

- **Document scrolling** for Library and Song screens (not nested scroll containers). Reasons: iOS status-bar tap scroll-to-top works only for the document; momentum and rubber-banding are native; keyboard handling is more predictable.
- Sticky (not fixed) headers: `position: sticky; top: 0` with safe-area padding.
- `html { overscroll-behavior-y: none }` is **not** used on the document (keeps native bounce); set `background: var(--bg)` on `html` so the bounce area matches. Sheets use their own scroll container with `overscroll-behavior: contain` so scrolling inside a sheet never scrolls the page behind; `body` gets `overflow: hidden` while a sheet is open (with scroll position preserved and restored to prevent jump).
- Horizontal overflow guard: `html, body { overflow-x: clip }` **plus** a test that asserts `document.scrollingElement.scrollWidth <= innerWidth` on every screen and fixture (overflow-x clip hides bugs; the test catches them).
- `-webkit-tap-highlight-color: transparent` with explicit pressed states instead; `touch-action: manipulation` on interactive elements (removes double-tap-zoom delay); `-webkit-user-select: none` on chrome (buttons, bars) but **not** on Clean-mode lyrics; `-webkit-touch-callout: none` on token buttons (long-press opens our menu instead of the system callout) but not on text that should be copyable.

### 9.5 Keyboard

- iOS shrinks the visual viewport, not the layout viewport. `platform/keyboard.ts` listens to `visualViewport` `resize`/`scroll` and sets `--keyboard-inset = innerHeight - visualViewport.height - visualViewport.offsetTop` (clamped ≥ 0).
- Sheets with inputs reserve `padding-bottom: var(--keyboard-inset)` and call `scrollIntoView({ block: 'nearest' })` on the focused field after the resize settles (rAF ×2).
- Top bar Save stays reachable (it's at the top of the sheet, unaffected by the keyboard).
- `enterkeyhint` on inputs (`next`, `search`, `done`); `autocapitalize="off"` / `autocorrect="off"` / `spellcheck="false"` on the lyrics textarea and reading fields; `inputmode` where relevant.

### 9.6 Navigation in the installed app

- No browser chrome: every screen has visible Back/Close; links to external sites (licence pages) open with `target="_blank"` which iOS opens in an in-app Safari view — acceptable; never navigate the app's own window off-origin.
- Deep links (`/song/:id`) work on reload thanks to SPA fallback; standalone always launches at `start_url` — restore the last open song? **Decision:** no; launch to Library but keep scroll/search state (predictable and fast).
- iOS may terminate the PWA in the background; all state that matters is persisted on change, so relaunch is seamless. Draft autosave covers the Add sheet.

### 9.7 Launch and offline startup

- Splash: generated startup images (light/dark). The first paint of `index.html` contains an inline critical-CSS background in `--bg` and the mark (inline SVG) centred, matching the splash, so there's no flash between splash and app.
- Service worker precaches the shell; offline launch must reach the Library without any network request succeeding (tested).

### 9.8 Things deliberately avoided

- Fake iOS controls that break accessibility (e.g. div-based switches without roles).
- Pull-to-refresh (meaningless for local data; iOS PWAs don't provide it).
- Web push, badging, background sync (not needed).
- Haptics hacks.
