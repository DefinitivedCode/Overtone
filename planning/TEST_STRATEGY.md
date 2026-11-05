# Overtone — Test Strategy

Two kinds of correctness are tested separately and reported separately:

- **Structural correctness** — the software does what it should with whatever the engine outputs: tokens cover the text, data persists, modes agree, nothing overflows. Pass/fail.
- **Linguistic accuracy** — the readings, romanisations and meanings are actually right. Measured as percentages against gold fixtures, with thresholds. A structural pass never implies linguistic accuracy.

Never report a test as passing unless it was run and passed in this environment. Never claim real-device iOS verification unless a human performed it and recorded it.

---

## 1. Tooling

| Layer | Tool |
|---|---|
| Unit / integration | **Vitest** (jsdom for components, `node` env for engine), **@testing-library/react**, **@testing-library/user-event**, **fake-indexeddb** |
| Property tests | **fast-check** (token invariants, parse/serialize round-trips, search folding) |
| E2E | **Playwright** with projects: `webkit-iphone` (WebKit, device `iPhone 15` descriptor or nearest available), `webkit-iphone-se` (320–375 px), `chromium-mobile` (Pixel), `chromium-desktop` |
| Accessibility | **@axe-core/playwright** on every screen/state; manual VoiceOver checklist |
| Visual | Playwright screenshots (`toHaveScreenshot`) for key screens in light/dark at 375 px, threshold 0.2 %; brand asset snapshots |
| Performance | Playwright with CDP CPU throttling (Chromium only) for budgets; bundle size check via `vite build` stats |
| Lint / types | ESLint (typescript-eslint, react-hooks, jsx-a11y), `tsc --noEmit`, Prettier check |

Scripts:

```
npm run lint        # eslint + prettier --check
npm run typecheck   # tsc -b --noEmit
npm test            # vitest run (unit + integration + structural engine tests)
npm run test:ling   # vitest run --project linguistic  (accuracy report; requires packs)
npm run e2e         # playwright test (builds + previews production bundle)
npm run verify      # lint + typecheck + test + build + e2e  (quality gate)
```

Playwright runs against `vite preview` of a **production build** (service worker active) — never against the dev server for offline tests.

Note: Playwright's WebKit is a desktop WebKit build with mobile emulation. It approximates iOS Safari layout and APIs but is **not** iOS: standalone mode, Home Screen storage, the real keyboard, safe areas, and status bar cannot be verified there. Those go to the manual checklist (§7).

---

## 2. Unit and integration tests (by module)

### 2.1 `lyrics/`
- `parse`: preserves text exactly (blank lines, leading spaces, full-width punctuation, emoji, mixed scripts); line-ending normalisation; control-char stripping; NFC; section detection positives (`[Chorus]`, `[Verse 2: Jungkook]`, `(Repeat x2)`, `【サビ】`, `후렴`) and negatives (`(I love you)`, `(사랑해)`, `(oh oh oh)` — backing vocals stay lyric lines), per ARCHITECTURE §3.1.
- Line keys: identical lines share keys; whitespace/case/trailing-punctuation variants share keys; different lines differ.
- `diff`: summary counts for insert/delete/modify/reorder cases.
- `aozora`: `|東京《とうきょう》`, `運命《さだめ》`, nested/invalid brackets left untouched.
- Property: `parse(text).map(l => l.text).join('\n') === normalise(text)`.

### 2.2 `db/`
- Repositories: create/read/update/delete song; soft delete + undo + purge; lines rewritten on edit; `learnedCount` and `searchText` maintained.
- Progress: toggle; shared key for repeated lines; percentage computed on occurrences; reset; progress unchanged by corrections; edit-preservation matrix (unchanged, changed, inserted, deleted, reordered, duplicated lines).
- Corrections: create/update/revert; scope line vs song; inactive after language change and active again on switch back; orphaned after edit; survive engine version bump.
- Migrations: for every `db.version(n)`, a test seeds a frozen v(n-1) fixture and asserts the upgraded data.
- Failure handling: simulated `QuotaExceededError` and `db.open()` failure produce typed errors, no partial writes.
- Library marker: empty DB + marker → recovery state.

### 2.3 `db/backup/`
- Export shape validates against the zod schema; deterministic output for a seeded library (snapshot).
- Round trip: seed rich library → export → clear → import (Replace) → deep-equal (songs, raw text, overrides, progress, corrections, settings).
- Merge: id conflicts (newer wins), progress union, corrections union, new songs inserted.
- Rejections: wrong `format`, newer `schemaVersion`, malformed JSON, oversized file, over-long strings, invalid UUIDs, `__proto__` keys; assert DB unchanged after each.
- Migrations: each `fixtures/backups/v{n}.json` imports correctly into the current version.
- Checksum mismatch → warning path.

### 2.4 `engine/` (structural)
- Token invariants (§3 of LANGUAGE_ENGINE.md) via fast-check over random mixed-script strings for every analyser (with packs mocked by small fixture dictionaries).
- Script segmentation & routing table tests, incl. `ー`, `々`, half-width katakana, compatibility jamo, full-width Latin, emoji, ZWJ sequences.
- Auto-detect: fixtures per language + Han-only Mandarin vs Cantonese marker cases; Latin-only → undetected.
- Korean romaniser: each rule's examples (LANGUAGE_ENGINE.md §5.1) as table tests; letter-by-letter mode.
- Hepburn: table tests for every kana, っ/ん/long vowel/particle rules, macron vs doubled setting.
- Pinyin projection: tone-mark placement for every vowel combination; ü handling; numbers mode; sandhi projection rules.
- Furigana alignment: okurigana cases (食べる, 取り扱い, 申し込み), jukujikun fallback (今日, 大人, 一人), katakana-mixed (ドイツ語), 々 (人々), ヶ (三ヶ月).
- Overlay: value corrections, structural corrections, unmatched corrections reported.
- Worker protocol: batching, dedupe, cancellation, failure → `status: 'failed'` lines; idle termination.
- Pack installer: progress events, resumability, atomic switch, checksum failure handling (mock fetch with streams).

### 2.5 `online/lrclib`
- Mocked fetch: success; empty; 404; 429 with `Retry-After`; 500/503; timeout; malformed JSON; non-JSON content type; instrumental; oversized lyrics; header `Lrclib-Client` present.

### 2.6 `search/`
- Folding: case, width, diacritics (ài → ai, tōkyō → tokyo), katakana→hiragana; Korean via romanised text ("saranghae").
- AND semantics for multi-word queries; filters + sort combinations; collation per language.
- Performance: 1,000 synthetic songs filter < 50 ms in Node (structural budget).

### 2.7 Components
- Each feature screen renders all designed states (empty, loading, partial, offline, error, populated).
- Forms: validation, disabled states, limits, discard confirmation, draft autosave/restore.
- Learn token buttons have correct accessible names; Karaoke has no interactive lyric elements; Clean has no tokens/checks.

---

## 3. E2E (Playwright, production build)

| Spec | Covers |
|---|---|
| `library.spec` | empty state → add → appears with chip/progress; search (original, romanised, diacritic-insensitive); filters with counts; sort options; state persists after reload |
| `add-song.spec` | manual add each language; Auto-detect hints; Han-only requires Mandarin/Cantonese choice; limits; discard confirm; draft survives reload |
| `modes.spec` | Learn/Karaoke/Clean per language fixture; mode remembered per song; Clean original⇄romanised remembered; Karaoke has zero focusable elements inside lyrics |
| `progress.spec` | toggle line; chorus shared; percentage in header and library; persists across reload and mode changes; reset with confirm |
| `edit.spec` | edit lyrics → toast summary; unchanged lines keep progress & corrections; changed lines reset; change language → re-process; delete + undo; delete permanent after toast |
| `corrections.spec` | correct Japanese reading (romaji input → kana), Mandarin tone-number input, Cantonese jyutping, Korean RR; scope line vs song; revert; reflected in Karaoke/Clean |
| `word-sheet.spec` | meaning shown; no-entry state; particle gloss; low-confidence explanation; focus management |
| `offline.spec` | load once → go offline (`context.setOffline(true)`) → reload → library, songs, all modes, progress toggling work; pack missing offline → banner; reconnect → processing resumes |
| `packs.spec` | download pack with progress; remove pack; storage estimate low warning (mocked) |
| `backup.spec` | export (download path in Playwright) → clear site data → import → identical; invalid file rejected; merge vs replace |
| `update.spec` | deploy build A, open, deploy build B (serve different dist), reload prompt appears; not shown while editing |
| `lrclib.spec` | **mocked** via `page.route('https://lrclib.net/**')` — search, pick, prefill, errors, offline state. One opt-in live smoke test (`LIVE_LRCLIB=1`) not run in CI by default |
| `layout.spec` | at widths 320, 375, 393, 430 and 768: no horizontal overflow on every screen with long-text fixtures; tokens wrap with annotations aligned (bounding-box checks: each `rt` horizontally overlaps its base) |
| `a11y.spec` | axe on every screen and sheet in light and dark; keyboard-only full journey (add → learn → toggle → correct → export) |
| `theme.spec` | system/light/dark; theme-color meta updates |
| `recovery.spec` | marker present + empty DB → recovery screen → import |

---

## 4. Linguistic fixtures and accuracy

### 4.1 Copyright rule for fixtures

**Do not put copyrighted song lyrics in the repository.** Fixtures use:
- Lines written for this project in lyric style (simple love-song/pop phrasing), or
- Public-domain / traditional songs and texts: e.g. Korean 아리랑 (traditional), Japanese さくらさくら, ふるさと (lyrics by 高野辰之, d. 1947 — public domain in Japan), 七つの子 (野口雨情, d. 1945); Mandarin 茉莉花 (folk), classical poems (静夜思, 春晓); Cantonese nursery rhymes (月光光, 氹氹轉) and classical poems read in Cantonese. Verify each item's public-domain status before inclusion and note it in the fixture file.

### 4.2 Fixture format (`fixtures/linguistic/<lang>/*.json`)

```jsonc
{
  "id": "ja-okurigana-001",
  "lang": "ja",
  "text": "君の名前を呼んでいた",
  "source": "original (written for Overtone)",
  "expected": {
    "tokens": [
      { "surface": "君", "reading": "きみ", "roman": "kimi" },
      { "surface": "の", "reading": "の", "roman": "no" },
      { "surface": "名前", "reading": "なまえ", "roman": "namae" },
      { "surface": "を", "reading": "を", "roman": "o" },
      { "surface": "呼んで", "reading": "よんで", "roman": "yonde", "ruby": [["呼","よ"],["んで",null]] },
      { "surface": "いた", "reading": "いた", "roman": "ita" }
    ],
    "romanLine": "kimi no namae o yonde ita",
    "lemmas": { "呼んで": "呼ぶ" },
    "meanings": { "名前": "name" }       // gloss must contain this substring
  },
  "tags": ["okurigana", "particle-wo"],
  "acceptable": { "romanLine": ["kimi no namae wo yonde ita"] },  // optional alternatives
  "expectEngineMiss": false,             // true for gikun/poetic readings (counted separately)
  "reviewed": false                      // true only after a fluent human reviewed it
}
```

Token-boundary expectations are compared on *readings per character span*, so a different but valid segmentation doesn't fail a reading check (segmentation is scored separately).

### 4.3 Required coverage (minimum counts)

| Language | Min lines | Must include |
|---|---|---|
| ko | 120 | Every rule in LANGUAGE_ENGINE §5.1 (≥ 5 lines each); ㄴ-insertion exceptions; particles; contractions (해, 봐, 줘, 돼); irregular verbs (ㅂ, ㄷ, 르, ㅅ, ㅎ); English mixed lines ("baby 내 맘을"); compatibility jamo (ㅋㅋ); lyric spellings (사랑해, 보고 싶어, 괜찮아, 날 봐) |
| ja | 150 | Okurigana; jukujikun (今日, 明日, 大人, 一人, 二人, 昨日, 今年); particles は/へ/を; long vowels (東京, 思う, 大きい, 先生, 映画, コーヒー); っ/ん cases; katakana loanwords; 々; numbers + counters (一つ, 三人); ambiguous (何, 方, 一日, 人気); poetic readings with `expectEngineMiss: true` (運命=さだめ, 宇宙=そら, 本気=マジ); Aozora input; English mixed ("I love you 君が好き") |
| zh | 120 | Polyphones in context (行 银行/行走, 长 长大/很长, 重 重要/重新, 还 还是/还钱, 得 得到/跑得快/得去, 了 了解/走了, 觉 睡觉/觉得, 乐 音乐/快乐, 着 看着/着急, 只 一只/只有, 地 地方/慢慢地); neutral tones; 一/不 (sandhi setting on/off); erhua (一点儿, 哪儿); Traditional-character input (我愛你, 對不起); English mixed |
| yue | 120 | Cantonese characters (嘅 咗 唔 冇 佢哋 喺 嘢 啲 嚟 睇 瞓 揾); polyphones (行 銀行/行路, 長 長大/好長, 重 重要/好重, 樂 音樂/快樂, 覺 瞓覺/覺得, 落 落雨); literary/colloquial pairs (生, 命, 聽, 青) with acceptable alternatives; Simplified input; English mixed ("I miss you 我好掛住你") |
| mixed | 40 | Language routing: Korean song with Japanese line; Japanese song with English; Han in Korean song; Latin with diacritics; full-width Latin; emoji |

### 4.4 Metrics and thresholds (`npm run test:ling`)

Computed over fixtures with `expectEngineMiss: false`:

| Metric | Definition | v0.1 threshold |
|---|---|---|
| ja reading accuracy | % of kanji-containing tokens whose reading matches expected (or acceptable) | ≥ 95 % |
| ja romanisation line exact | % of lines whose `romanLine` matches expected/acceptable | ≥ 85 % |
| ko romanisation accuracy | % of eojeol matching expected | ≥ 97 % (rule-covered); exceptions table cases 100 % |
| zh pinyin accuracy | % of Han characters with correct syllable + tone | ≥ 98 % (polyphone subset ≥ 92 %) |
| yue jyutping accuracy | % of Han characters with correct (or acceptable) syllable + tone | ≥ 95 % (polyphone subset ≥ 88 %) |
| Dictionary coverage | % of content-word tokens (noun/verb/adj/adv) with ≥ 1 entry | ≥ 90 % per language |
| Meaning relevance | % of `meanings` expectations whose substring appears in top 3 senses | ≥ 85 % |
| Language routing | % of segments routed to the expected language | 100 % on the mixed suite |
| Engine-miss suite | reported only (count of `expectEngineMiss` lines the engine got right anyway) | — |

The report (`reports/linguistic-<date>.md`, gitignored except the latest summary committed to `docs/LINGUISTIC_REPORT.md`) lists per-tag accuracy and every failure with expected vs actual. Thresholds failing blocks v0.1 completion; the implementer may adjust analysers but must **never** edit expected values to make tests pass unless the fixture is demonstrably wrong — and then must cite an authoritative source (dictionary entry) in the fixture's `source`/`note` field and leave `reviewed: false`.

Honesty caveat to keep in the report: fixtures are authored by the implementing agent with dictionary verification, not by fluent native reviewers; scores indicate consistency with reference dictionaries, not proven native-level accuracy. Lines with `reviewed: true` (human-verified) are scored separately.

---

## 5. Quality gates (CI and per milestone)

Every milestone must pass `npm run verify` locally. CI (GitHub Actions, free tier) runs: install → `npm run packs` (cached) → lint → typecheck → test → build → e2e (webkit + chromium) → test:ling (after M8). Artifacts: Playwright HTML report, linguistic report, bundle stats.

Budgets checked automatically:
- Initial JS ≤ 180 KB gzip (build stats script).
- Precache ≤ 2 MB excluding packs.
- Pack sizes within LANGUAGE_ENGINE §9 budgets.
- No horizontal overflow (layout.spec).
- axe: zero serious/critical violations.

---

## 6. Performance tests

- Chromium E2E with 4× CPU throttling: Library interactive ≤ 3.5 s from navigation on cached load; open processed song ≤ 300 ms; processing time per language fixture song (60 lines) within PRODUCT_SPEC §5 budgets (after pack warm-up; cold pack load reported separately).
- Memory: `performance.measureUserAgentSpecificMemory` where available (Chromium, cross-origin isolated preview only) or `performance.memory` heap snapshot proxy; report, don't gate, except the 150 MB Japanese budget on Chromium.
- WebKit: functional only (no throttling API); record timings for information.

---

## 7. Manual iOS verification checklist

To be performed by a human on a real iPhone (latest iOS and one older supported version if available) with the app installed via Share → Add to Home Screen. Record results in `docs/IOS_VERIFICATION.md` as a table with device, iOS version, date, tester, pass/fail, notes. The implementer must create this file with every row set to **Not yet verified** and must not change statuses itself.

**Install & launch**
1. Add to Home Screen shows "Overtone" and the correct icon (no white border, correct corners).
2. Launch shows the splash in light mode and in dark mode (toggle system appearance); no white flash into the app.
3. App opens standalone (no Safari UI); status bar content is legible in both themes.
4. Airplane mode → cold launch → Library appears with songs.

**Layout**
5. Notch/Dynamic Island: no content under the status bar; home indicator area clear on bottom toasts/sheets.
6. Landscape: side safe areas respected; no horizontal scroll.
7. Rotate on Song screen: scroll position roughly preserved.

**Scrolling & touch**
8. Status bar tap scrolls Library and Song to top.
9. Rubber-band shows matching background colour (no white).
10. Sheet scrolling never scrolls the page behind; drag-to-dismiss works and doesn't fight inner scroll.
11. Token taps are accurate on dense Chinese text at default and smallest text size; no accidental line toggles.
12. Long-press on a token doesn't show the iOS callout/magnifier; Clean-mode text is selectable.
13. No double-tap zoom on buttons; pinch zoom still works.

**Keyboard**
14. Add Song: focusing lyrics textarea keeps the caret visible above the keyboard while typing at the end of long text.
15. Title/Artist fields don't zoom the page on focus.
16. Dismissing the keyboard restores layout without a gap.
17. Correction sheet inputs: Japanese kana keyboard, pinyin with numbers — values accepted.

**Data safety**
18. Settings shows storage protection status after adding a song (record what iOS granted).
19. Export via share sheet → Save to Files works; file opens as JSON.
20. Import from Files works; merge preview correct.
21. Force-quit during Add Song with long paste → relaunch → draft restored.
22. After an app update (deploy new build), the update toast appears; Reload works; data intact.

**Accessibility**
23. VoiceOver: Library rows, mode switcher, Learn tokens (reading announced once), learned toggle state, sheets (focus trapped, escape gesture closes).
24. Larger text setting in app (max) — no clipping.
25. Reduce Motion on → no slide animations.
26. Increase Contrast / Smart Invert — remains usable (note results).

**Languages**
27. Each language song renders with the correct system font (no Chinese-style glyphs in Japanese text; HK forms for Cantonese).
28. Downloading the Japanese pack over cellular shows size first; completes; works offline after.

---

## 8. Regression policy

- Every bug fixed gets a test that failed before the fix.
- Every linguistic error reported by a user (or found manually) becomes a fixture line (`reviewed: true` if a fluent reviewer confirmed it).
- Snapshot updates (visual or export) must be reviewed in the diff and justified in the commit message.
