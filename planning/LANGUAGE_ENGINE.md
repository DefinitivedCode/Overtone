# Overtone — Language Engine

How Overtone turns a lyric line into tokens with readings, romanisation and meanings, entirely on-device.

Status labels used below:
- **Verified (research)** — confirmed from the project's own documentation/README during planning (Nov 2026). Still re-check version numbers at implementation time.
- **To verify (spike)** — plausible but not confirmed; Milestone M4 must test it and record the result in an ADR before relying on it.
- **Decision** — a choice made in this plan.

---

## 1. Four different jobs (do not conflate them)

| Job | What it is | Deterministic? | Examples |
|---|---|---|---|
| **Transliteration** | Mapping script → Latin by fixed rules | Yes | Hangul → RR; kana → Hepburn; pinyin numbers → tone marks |
| **Contextual reading selection** | Choosing which pronunciation a character/word has in context | No (dictionary + heuristics/statistics) | 行 xíng/háng; 今日 きょう/こんにち; 長 coeng4/zoeng2 |
| **Morphological analysis / segmentation** | Splitting text into words/morphemes, finding dictionary forms | No (statistical tokenizer or rules) | Japanese tokenisation; 먹었어요 → 먹다 + endings |
| **Dictionary lookup** | Retrieving English meanings for a word/lemma | Data-driven | JMdict, CC-CEDICT, CC-Canto, Wiktionary |

Per language the chain is:

| Lang | Segmentation | Reading | Romanisation | Meanings |
|---|---|---|---|---|
| ja | Morphological tokenizer (kuromoji/IPADIC or alternative) | Tokenizer reading (katakana) → hiragana; furigana alignment | Own kana→Hepburn module using tokenizer pronunciation for long vowels | JMdict (by lemma + reading) |
| ko | Spaces (eojeol) + heuristic morpheme splitter (or ko-dic tokenizer if spike passes) | Hangul *is* the reading | Own RR module with standard pronunciation rules | Wiktionary-KO + kengdic (by lemma candidates) |
| zh | Forward maximum matching on CC-CEDICT headwords | pinyin-pro (contextual polyphones) | Pure projection of syllable+tone | CC-CEDICT, entry chosen by matching pinyin |
| yue | Forward maximum matching on CC-Canto + CC-CEDICT | to-jyutping (word-based, rime-cantonese data) | Jyutping (already Latin) | CC-Canto, CC-CEDICT (Cantonese readings) |
| en | Latin run | — | Unchanged | none in v0.1 |

---

## 2. Library and data evaluation

### 2.1 Japanese tokenizer

| Option | Licence | Browser | Data size | Maintenance | Notes |
|---|---|---|---|---|---|
| **kuromoji.js** (IPADIC) | Apache-2.0 | Yes (pure JS) | Dictionary ≈ 12 MB gzip reported by a third-party blog (**to verify**) | Unmaintained upstream (forks exist, also not long-term maintained) | Mature, widely used; outputs `surface_form`, `pos`, `basic_form`, `reading`, `pronunciation` (IPADIC fields). Known issue: browser loader uses `path.join`, which breaks absolute URLs — needs a custom loader or a fork. |
| **lindera-wasm** (IPADIC or UniDic) | MIT | Yes (WASM, browser builds listed) | Embedded dictionary; size **to verify** (UniDic notably larger) | Active; moved into the main Lindera monorepo | Requires WASM init before `TokenizerBuilder`; Vite `optimizeDeps.exclude` note in its README. Also supports ko-dic and CC-CEDICT (relevant for Korean, §5.3). |
| Sudachi (WASM) | Apache-2.0 | Possible | ≥ 50 MB reported | Active | Too heavy for a phone PWA. **Rejected.** |
| Suzume | (check) | WASM ≈ 360 KB gzip, dictionary ≈ 400 KB (self-reported) | Small | New | Lower accuracy on vocabulary by its own admission. **Rejected** for primary use; reading accuracy is our core value. |

**Decision:** default to **kuromoji.js (IPADIC)** wrapped behind a `JapaneseTokenizer` interface, with a custom fetch-based loader reading from `/packs/ja/<ver>/tokenizer/`. M4 spike benchmarks **lindera-wasm (IPADIC)** against it on the Japanese fixture suite, cold-load time and peak memory in Playwright WebKit. Switch only if lindera is ≥ as accurate and meaningfully better on size/speed, or if kuromoji fails in WebKit. Record in `docs/adr/0002-japanese-tokenizer.md`.

### 2.2 Kana → romaji

| Option | Licence | Notes |
|---|---|---|
| WanaKana | MIT (believed; **verify** in package) | Excellent kana↔romaji, but its romaji has no macron option and no particle awareness. |
| hepburn (lovell) | Apache-2.0 | Kana ↔ Hepburn; limited options. |
| **Own module** (`engine/ja/hepburn.ts`) | — | **Decision.** ~200 lines of tables; we need token-aware rules (particles, long vowels from pronunciation field, ん before vowels, っ gemination, ち→tch) that no package provides. WanaKana MAY still be used for `isKana`/`toHiragana` helpers and romaji→kana input conversion in the correction sheet. |

### 2.3 Korean

| Option | Licence | Notes |
|---|---|---|
| `aromanize` | (check) | Rule sets incl. `rr` transcription; README example shows output with hyphens. |
| `hangul-util` | (check) | `pronounce` applies standard pronunciation rules; `romanize` for RR. |
| `korean-pronunciation` | Apache-2.0 | Node port of g2pK; claims all 30 standard pronunciation rules; uses CMU dict for English; g2pK upstream relies on MeCab context that ports may lack. |
| `@romanize/korean` | MIT | RR and McCune–Reischauer. |
| **Own module** (`engine/ko/romanise.ts`) | — | **Decision (provisional).** RR with pronunciation rules is fully specifiable (§5.1) and testable; we need control over word boundaries and confidence flags. M4 spike runs the Korean fixture suite through `hangul-util` and `korean-pronunciation` as baselines; if one beats our module and is browser-compatible, maintained and small, adopt it behind the same interface (ADR 0003). |

Korean morphology for meanings: lindera `ko-dic` (mecab-ko-dic) would give real morphemes and lemmas. **To verify (spike):** browser package availability, compressed size, load time. Default plan is the heuristic lemmatiser (§5.3) because it is tiny and offline-trivial.

### 2.4 Mandarin

| Option | Licence | Notes |
|---|---|---|
| **pinyin-pro** | MIT (verified via package listings) | Per-character pinyin with word-based polyphone resolution; `segment` API (docs recommend loading a full dictionary via `addDict` for accurate segmentation); `polyphonic()` lists all readings; custom dictionaries; self-reported 99.8 % accuracy on its own benchmark (not independently verified). Traditional-character support **to verify**. |
| `pinyin` (hotoo) | MIT | Older, lower reported accuracy. Rejected. |
| **opencc-js** | Apache-2.0 (**verify**) | Traditional ↔ Simplified conversion, for feeding pinyin-pro and for Cantonese simplified input. Used in character mode with a length-preservation check. |

**Decision:** pinyin-pro for readings; CC-CEDICT max-match for word segmentation and meanings; entry selection by matching the pinyin-pro reading.

### 2.5 Cantonese

| Option | Licence | Notes |
|---|---|---|
| **to-jyutping** (CanCLID) | BSD-2-Clause; data from rime-cantonese, CC BY 4.0 | TypeScript, `getJyutpingList` per character, word-level special cases customisable. Last push 2023 (slowed). |
| rime-cantonese data directly | CC BY 4.0 | Fallback: build our own longest-match reader from `jyut6ping3` dictionaries if to-jyutping is unsuitable. |

**Decision:** to-jyutping behind a `CantoneseReader` interface; fallback documented above.

### 2.6 Dictionaries

| Data | Languages | Licence | Use |
|---|---|---|---|
| **JMdict** via `jmdict-simplified` JSON releases | ja→en | EDRDG licence (JMdict is CC BY-SA 4.0 under EDRDG terms; attribution required) | Japanese meanings, POS, frequency (priority tags), readings for unknown-word fallback |
| JmdictFurigana (MAY) | ja | CC BY-SA (**verify**) | Per-kanji furigana splits for JMdict entries; improves alignment of compounds |
| **CC-CEDICT** | zh→en | CC BY-SA 4.0 (some sources say 3.0 — **verify on mdbg.net** and record) | Mandarin meanings & segmentation; also traditional forms for Cantonese |
| **CC-Canto** + CC-CEDICT Cantonese readings (cantonese.org) | yue→en | CC BY-SA 3.0; © Pleco Software | Cantonese-specific vocabulary and readings |
| words.hk | yue | Non-Commercial Open Data Licence | **Excluded from v0.1** (licence restricts reuse; app may be shared). Candidate optional pack later (ADR). |
| **Wiktionary (English) Korean entries** via kaikki.org/wiktextract | ko→en | CC BY-SA 3.0 + GFDL (secondhand; **verify**); kaikki requests a link back | Korean meanings, POS, some inflection info |
| **kengdic** | ko→en | MPL 2.0 or LGPL 2.0+ (dual) | Coverage fallback for Korean |
| KRDict (NIKL learners' dictionary) | ko→en | **To verify** (open API requires a key; bulk download terms unclear) | Not used unless an offline bulk export with a compatible licence is confirmed |

All attribution strings live in `public/packs/manifest.json` `sources[]` and are rendered in About & licences. CC BY-SA "ShareAlike" applies to the derived data files we distribute (packs), not the app code; packs therefore ship under the same licence, stated in the manifest.

---

## 3. Data model produced by the engine (`engine/model.ts`)

```ts
type Confidence = 'high' | 'medium' | 'low' | 'none';

interface RubyUnit {          // one alignment unit inside a token
  base: string;               // characters this annotation sits over
  reading: string | null;     // ja: hiragana; zh/yue: syllable; ko: null (roman used instead)
  tone?: number;              // zh: 1–5 (5 = neutral); yue: 1–6
  syllable?: string;          // zh: toneless pinyin with ü (e.g. "lü"); yue: jyutping without tone
}

interface Token {
  start: number; end: number; // UTF-16 offsets into the line text
  surface: string;
  kind: 'word' | 'particle' | 'punct' | 'space' | 'latin' | 'number' | 'symbol';
  lang: 'ko' | 'ja' | 'zh' | 'yue' | 'en' | 'other';
  ruby: RubyUnit[];           // empty for kinds without annotation
  reading: string | null;     // whole-token reading (ja hiragana, zh/yue joined syllables)
  roman: string | null;       // whole-token romanisation (before user display preferences)
  lemma: string | null;       // dictionary form
  pos: string | null;         // coarse POS: noun|verb|adj|adv|particle|aux|pron|num|interj|other
  dict: { entryIds: string[] } | null;  // resolved dictionary candidates (lazy senses fetched by Word sheet)
  attachToPrev: boolean;      // romaji spacing: join to previous token without space
  confidence: Confidence;
  notes: string[];            // machine-readable reasons, e.g. 'polyphone', 'lemma-guess', 'unknown-word'
  userReading?: boolean;      // reading came from user-supplied ruby (Aozora) or correction
}

interface LineAnalysis {
  lineKey: string;
  lang: LangCode;
  engineVersion: number;
  status: 'ok' | 'partial' | 'failed';
  tokens: Token[];            // cover the full line text with no gaps or overlaps
}
```

Invariants (property-tested):
1. Tokens are sorted, contiguous, and `tokens.map(t => t.surface).join('') === lineText`.
2. For each token, `ruby.map(u => u.base).join('') === surface` when `ruby.length > 0`.
3. `kind ∈ {punct, space, latin, number, symbol}` ⇒ `ruby = []`, `roman` is the surface (or null for space).
4. No token has `confidence: 'high'` with `reading === null` for a kind that requires a reading.

**Romanised line** for Karaoke/Clean is a pure function `romaniseLine(tokens, prefs)`: joins token romanisations with spaces according to `attachToPrev`, keeps punctuation (converted to ASCII equivalents: `、`→`,`, `。`→`.`, `「」`→`" "`, `！`→`!`, `？`→`?`, `～`→`~`, full-width space → space), keeps Latin as written, and falls back to the surface for tokens with no romanisation.

---

## 4. Script segmentation and language routing (`engine/segment/`)

### 4.1 Script classes

Use Unicode property escapes (supported in Safari ≥ 11.1):

| Class | Regex | Notes |
|---|---|---|
| Hangul | `\p{Script=Hangul}` | Includes compatibility jamo (ㅋㅋ) — treated as Korean symbols, romanised letter-wise (`ㅋ`→`k`) with `low` confidence. |
| Kana | `\p{Script=Hiragana}\|\p{Script=Katakana}` plus `ー` (U+30FC), `ゝゞヽヾ` | `ー` has Script=Common; handle explicitly. Half-width katakana: NFKC-normalised for analysis only. |
| Han | `\p{Script=Han}` | Includes `々`, `〆`, `〇` (check each explicitly in tests). |
| Latin | `\p{Script=Latin}` plus digits and `'’-` inside words | |
| Other | everything else (punctuation, emoji, symbols, spaces) | |

### 4.2 Runs → segments

1. Split the line into maximal runs of the same class; spaces and punctuation attach as their own runs.
2. Assign a segment language:
   - Hangul run → `ko`.
   - Kana run → `ja`. A Han run adjacent (ignoring no-space boundaries) to a kana run is merged into the same `ja` segment.
   - Han run not attached to kana → song language if the song is `ja`/`zh`/`yue`; in a `ko` song → `other` (Hanja; shown without reading in v0.1, documented limitation; MAY add Hanja→Hangul via a small table later).
   - Latin run → `en` (no romanisation). Exception: none. (Romanised lyrics written in Latin are left alone.)
   - User correction with `segLang` overrides all of the above for its span.
3. Each segment is handed to its analyser; outputs are concatenated and offsets adjusted.

### 4.3 Auto-detect (song level)

Counts over the whole lyrics (excluding section lines): `H` Hangul, `K` kana, `C` Han, `L` Latin letters.

- `H ≥ 0.3·(H+K+C)` → **ko** (high).
- `K ≥ 0.05·(H+K+C)` and `K > 0` → **ja** (high if `K ≥ 0.2·(K+C)`, else medium).
- `H+K+C == 0` → "Couldn't detect — choose a language" (Latin-only songs are not a supported primary language; user must pick one).
- Han-only → **Chinese, unresolved**. Score Cantonese markers: characters `嘅 咗 唔 冇 佢 哋 喺 嘢 啲 噉 咁 嚟 睇 瞓 揾 搵 攰 乜 嘢 咩 囉 喎 嗰 呢 係 冚 啱 靚` (note `係`, `呢`, `咁` also appear in Mandarin — weight them lower) → if weighted score ≥ 2 per 100 Han chars → suggest **Cantonese**, else suggest **Mandarin**. Always require user confirmation (PRODUCT_SPEC J2.3). Simplified-only text nudges toward Mandarin; it is a hint, not a rule.

Detection output: `{ language, confidence, reason }`, unit-tested on fixtures.

---

## 5. Korean

### 5.1 Romanisation (Revised Romanization, pronunciation-based)

Implementation in `engine/ko/romanise.ts`, operating per eojeol (space-separated word); no liaison across spaces.

1. Decompose syllables: `code = ch - 0xAC00; L = code / 588 | 0; V = (code % 588) / 28 | 0; T = code % 28`.
2. Apply rules in order on the jamo sequence (each rule unit-tested with the examples below):

| # | Rule | Example → pronunciation → RR |
|---|---|---|
| 1 | Complex final simplification before consonant/end (ㄳ→ㄱ, ㄵ→ㄴ, ㄼ→ㄹ (but 밟- → ㅂ), ㄺ→ㄱ, ㄻ→ㅁ, ㄿ→ㅂ, ㄾ/ㄽ/ㅀ→ㄹ, ㅄ→ㅂ) | 닭 → 닥 → dak; 없다 → 업다 → eopda |
| 2 | Liaison: final + ㅇ-initial vowel moves final (complex finals split: 앉아 → 안자) | 사랑이 → 사랑이 → sarangi; 먹어 → 머거 → meogeo; 앉아 → 안자 → anja |
| 3 | ㅎ: aspiration (ㄱ/ㄷ/ㅂ/ㅈ ↔ ㅎ → ㅋ/ㅌ/ㅍ/ㅊ) | 좋다 → 조타 → jota; 축하 → 추카 → chuka |
| 4 | ㅎ deletion before vowel; ㄶ/ㅀ + vowel | 좋아 → 조아 → joa; 많아 → 마나 → mana |
| 5 | Palatalisation ㄷ/ㅌ + 이/히 | 같이 → 가치 → gachi; 굳이 → 구지 → guji |
| 6 | Nasalisation: ㄱ/ㄷ/ㅂ(-class) before ㄴ/ㅁ → ㅇ/ㄴ/ㅁ | 합니다 → 함니다 → hamnida; 국물 → 궁물 → gungmul |
| 7 | ㄹ → ㄴ after ㅁ/ㅇ; ㄱ/ㅂ + ㄹ → ㅇ/ㅁ + ㄴ | 종로 → 종노 → jongno; 협력 → 혐녁 → hyeomnyeok |
| 8 | Liquidisation ㄴ+ㄹ / ㄹ+ㄴ → ㄹㄹ | 신라 → 실라 → silla; 설날 → 설랄 → seollal |
| 9 | Final neutralisation (ㅅㅆㅈㅊㅌㅎ→ㄷ, ㅋㄲ→ㄱ, ㅍ→ㅂ) | 꽃 → 꼳 → kkot; 밖 → 박 → bak |
| 10 | Letter mapping: initial ㄹ = r, final ㄹ = l, ㄹㄹ = ll; ㄱㄷㅂ = g/d/b before vowels, k/t/p finals | 사랑해 → saranghae; 별 → byeol |

Not applied (documented limitations, flagged `confidence: 'medium'` where detectable):
- Tensification (경음화) — official RR does not mark it, so this is *correct* to omit.
- ㄴ-insertion (ㄴ첨가, e.g. 솜이불 → 솜니불 → somnibul; 한여름 → 한녀름 → hannyeoreum) — requires morpheme boundaries, so the rule engine outputs `somibul`. Known cases go in a data-driven exceptions table (`engine/ko/exceptions.ts`, word → pronunciation) that is checked before the rules; every entry has a fixture.
- 의 as particle pronounced [에]: RR writes `ui`; keep `ui`.
- Hyphens are not inserted (lyrics romanisation convention). Option "letter-by-letter" uses rules 10 only (+ ㄹ/r/l) without 1–9.

Word spacing: one romanised word per eojeol. Capitalisation: none (lowercase), except preserve Latin segments.

### 5.2 Segmentation for display

Korean tokens are eojeol-level for ruby display (romanisation centred above the whole word). Internally each eojeol may carry `lemma` candidates from §5.3 for the Word sheet.

### 5.3 Lemma heuristics for dictionary lookup (`engine/ko/lemma.ts`)

Given an eojeol (punctuation stripped):

1. Exact headword match → done (high).
2. **Particles**: strip the longest matching particle from a list (`에서부터, 에게서, 한테서, 으로서, 으로써, 에서는, 에게는, 이라도, 처럼, 까지, 부터, 마저, 조차, 에게, 한테, 에서, 으로, 이랑, 하고, 보다, 이나, 이야, 은, 는, 이, 가, 을, 를, 에, 의, 도, 만, 로, 와, 과, 랑, 나, 야, 아, 여`), respecting batchim agreement (은/을/이/과/으로 after batchim; 는/를/가/와/로 after vowel or ㄹ for 로), then exact match (high if the stem is a noun entry).
3. **Copula**: `-이에요/-예요/-이야/-야/-이다/-입니다` on nouns.
4. **Predicates**: generate candidate stems by stripping endings (ordered longest first: `-았었어요, -었었어요, -겠습니다, -습니다, -ㅂ니다, -았어요, -었어요, -였어요, -해요, -아요, -어요, -았어, -었어, -였어, -잖아, -는데, -지만, -니까, -면서, -도록, -더라, -네요, -군요, -고, -지, -면, -서, -는, -은, -을, -던, -게, -죠, -요` …), reverse contractions (해→하, 했→하, 봐→보, 와→오, 줘→주, 돼→되, 됐→되, 써→쓰, 커→크, 꺼→끄, 워→ㅂ-irregular (고마워→고맙), 러→르-irregular (몰라→모르), ㄷ-irregular (들어→듣/들), ㅅ-irregular (나아→낫), ㅎ-irregular (그래→그렇)), and ㄴ/ㄹ/ㅂ final-jamo endings (간→가, 갈→가, 갑니다→가). Append `다` and keep candidates that exist as verb/adjective headwords. Rank by dictionary frequency; mark `confidence: 'medium'`, `notes: ['lemma-guess']`.
5. **Auxiliary constructions**: `-고 싶다`, `-고 있다`, `-아/어 주다`, `-지 않다`, `-지 마` — when the next eojeol is an auxiliary, annotate both with their lemmas.
6. No match → `dict: null`, Word sheet shows "No dictionary entry" with the eojeol and any stripped particle explained ("을 — object particle") from a static particle gloss table.

Particles are also glossed from the static table (e.g. "-는: topic marker"), which is high-value for learners and fully deterministic.

---

## 6. Mandarin

### 6.1 Pipeline

1. If the segment contains Traditional characters, create a simplified shadow string with opencc-js (character mode) for pinyin-pro; assert equal length, else fall back to feeding the original.
2. `pinyin(shadow, { type: 'all', toneType: 'num' /* or equivalent */, v: true })` → per-character syllable + tone. Store syllable with `ü` and tone 1–5.
3. Segment for meanings: forward maximum matching over CC-CEDICT headwords (both simplified and traditional forms indexed), max word length 8, against the **original** characters. Single-character fallback.
4. For each word, look up CEDICT entries; prefer entries whose pinyin (normalised, tone numbers) equals the pinyin-pro reading of those characters; if none match, still show entries but set `confidence: 'medium'` and note `'reading-mismatch'`. Proper-noun entries (capitalised pinyin) are ranked after common entries.
5. Polyphone flag: if a character is in pinyin-pro's polyphonic set and not part of a multi-character dictionary word, set `notes: ['polyphone']`, `confidence: 'medium'`.

### 6.2 Character alignment

Ruby units are one per Han character. Non-Han characters (Latin, digits, punctuation) inside a word produce units with `reading: null`.

### 6.3 Neutral tone, erhua

- Neutral tone (tone 5) shown without a mark (`de`) or as `de5`/`de` (numbers mode shows `5`). Accept whatever pinyin-pro returns; fixtures check common particles (的 了 吗 呢 吧 们 子 着).
- Erhua (儿 after a syllable as r-colouring, e.g. 一点儿): v0.1 shows `ér`/`r` as returned by pinyin-pro, flagged `notes: ['erhua']` with `low` confidence if ambiguous. Documented limitation.

### 6.4 Tone sandhi

Dictionaries and textbooks write citation tones (`yī`, `bù`); the third-tone sandhi is never written. Some learners want 一/不 sandhi shown (`yí ge`, `bú shì`). pinyin-pro reportedly has a tone-sandhi option — **to verify**. Settings default: **off** (citation tones). If pinyin-pro lacks it, implement 一/不 sandhi as a render-time projection from neighbouring tones (deterministic rules: 不 + tone 4 → bú; 一 + tone 4 → yí; 一 + tones 1/2/3 → yì; ordinal/counting contexts like 第一, 一月, standalone 一 keep yī).

### 6.5 Pinyin projection

`formatPinyin(syllable, tone, mode)`: tone-mark placement rule — `a`/`e` take the mark; in `ou` mark the `o`; otherwise the last vowel; `ü` keeps its dots (`lǜ`). Numbers mode: `lv4`→ display `lü4`.

---

## 7. Cantonese

### 7.1 Pipeline

1. If the segment contains Simplified-only characters, convert to HK Traditional with opencc-js (`s2hk` or equivalent) for analysis; keep the original for display; length check as in Mandarin.
2. `ToJyutping.getJyutpingList(text)` → per-character jyutping (or null). Split each into syllable + tone digit.
3. Segment for meanings by forward maximum matching over CC-Canto ∪ CC-CEDICT (traditional headwords).
4. Choose entries whose Jyutping matches (CC-Canto readings, CC-CEDICT Cantonese readings file); else `medium`.
5. Characters with multiple common readings that were resolved without a multi-character word match get `notes: ['polyphone']`.

### 7.2 Known issues to test explicitly

- Literary vs colloquial readings (文白異讀): 生 saang1/sang1, 命 meng6/ming6, 聽 teng1/ting1, 青 ceng1/cing1. Lyrics frequently use literary readings in set phrases; the engine follows the data, users correct. Fixtures mark these as "acceptable alternatives".
- Cantonese-specific characters (嘅 咗 唔 冇 佢 哋 喺 嘢 啲 嚟 睇 瞓) must all have readings.
- Changed-tone (變調) readings (e.g. 女 neoi5 → neoi2 in 仔女) are not predicted unless in the data.

---

## 8. Japanese

### 8.1 Pipeline

1. Pre-pass: extract Aozora ruby (`|base《reading》` or `漢字《reading》`) if enabled; record user readings by character offset (they override the tokenizer for those spans; tokens covering them get `userReading: true`, `confidence: 'high'`).
2. Tokenize the `ja` segment. For each token take `surface`, `pos`, `pos_detail`, `basic_form`, `reading` (katakana), `pronunciation` (katakana with ー).
3. Reading = `toHiragana(reading)`; if missing: kana-only surface → surface; else try JMdict lookup by surface (single unambiguous reading → `medium`; multiple → first by priority, `low`, `notes: ['unknown-word']`); else `none` (shown with "?").
4. Furigana alignment (§8.2).
5. Romanisation (§8.3).
6. Dictionary: look up `basic_form` + reading in JMdict, falling back to surface. Particles and auxiliaries get short static glosses (は topic, が subject, を object, に to/at, で at/by, と and/with, も also, の 's/of, よ/ね/な sentence-final, て/た/ない/ます forms) — deterministic and very useful.

### 8.2 Furigana alignment

For a token with kanji:
1. Split surface into alternating runs of kanji (`Han` + `々〆ヶ`) and kana.
2. Build a regex from the runs: kana runs → literal (hiragana-normalised), kanji runs → `(.+?)`; anchor `^…$`; match against the hiragana reading.
3. If it matches: each kanji run gets its captured reading as one `RubyUnit`; kana runs get `reading: null`. If the regex allows more than one split (two adjacent-ish kanji runs separated by a kana that also appears in the reading), try all splits and prefer one where each kanji-run reading length ≥ number of kanji in it; if still ambiguous, mark `medium`.
4. If no match (jukujikun like 今日, 大人; irregular okurigana) → one `RubyUnit` spanning the whole kanji part (or whole token) with the full reading.
5. MAY: use JmdictFurigana to split multi-kanji runs into per-kanji units (東京 → 東|とう 京|きょう) for finer display.

Kana-only tokens: no furigana (option to show for katakana words: off).

### 8.3 Hepburn (Modified Hepburn) — `engine/ja/hepburn.ts`

- Base table: standard Modified Hepburn (shi, chi, tsu, fu, ji, zu for づ, ja/ju/jo, cha/chu/cho, etc.).
- `っ` doubles the next consonant; before `ch` → `tch` (`matcha`). At the end of a token or before a vowel/punctuation (interjections like `あっ`, `えっ`) there is nothing to double: render nothing (`a`, `e`) — the っ stays visible in the original text.
- `ん` → `n`; before a vowel or `y` → `n'` (`kin'yōbi`, `ren'ai`).
- Particles by POS (助詞): `は`→`wa`, `へ`→`e`, `を`→`o`.
- Long vowels — derive from the **pronunciation** field: a `ー` after o/u in the pronunciation → macron (`ō`, `ū`) when the reading has `おう/おお/うう` at that position; `えい` stays `ei` (Modified Hepburn), `ああ/いい/ええ` stay doubled. Katakana `ー` in loanwords → macron on the preceding vowel (`kōhī`). Setting "doubled vowels" renders `ou/uu/oo` per reading instead.
- Word spacing: each token separated by spaces, except `attachToPrev` for: auxiliary verbs (助動詞), conjunctive particle `て/で` after verbs, verb suffixes (動詞,接尾 / 非自立 like `ている` parts), and `ます/です` forms. Example: `食べてしまった` → `tabete shimatta`; `行きます` → `ikimasu`; `君のことが好き` → `kimi no koto ga suki`.
- Lowercase output; Latin segments untouched.

### 8.4 Lyric-specific limitations

- Poetic/gikun readings (運命→さだめ, 宇宙→そら, 本気→マジ, 地球→ほし) cannot be predicted: they come from the artist's printed furigana. Aozora import (§8.1) and corrections are the remedy. Fixtures include these as "expected engine miss" cases to prevent false accuracy claims.
- Readings that depend on meaning across lines (e.g. 何 なに/なん, 一日 ついたち/いちにち, 方 かた/ほう, 人気 にんき/ひとけ) follow the tokenizer; flagged when the tokenizer itself has alternatives is not possible with kuromoji (single-best output), so we maintain a small list of known-ambiguous surfaces → `confidence: 'medium'`, `notes: ['ambiguous-reading']`.

---

## 9. Packs: build, budgets and loading

Build scripts (`scripts/packs/`) produce, per language, JSON Lines files gzip-compressed:

```
{"f":"食べる","e":"1358280","r":"たべる","s":[{"p":"v1","g":["to eat"]},{"p":"v1","g":["to live on (e.g. a salary)"]}],"q":20}
```

- `f` form (each kanji form and each kana form gets a row → lookups by either), `e` entry id, `r` primary reading for that form, `s` senses (≤ 5 senses, ≤ 3 glosses each, glosses ≤ 80 chars), `q` frequency score (from JMdict priority tags / CEDICT none → 0 / Wiktionary none).
- Korean rows include `pos` mapped to `verb|adj|noun|…` so lemma candidates can be validated.
- Mandarin/Cantonese rows include both traditional and simplified forms and readings (`r` = tone-number pinyin / jyutping).

Budgets (targets; the build prints actual sizes and fails if exceeded by > 25 %):

| Pack | Target compressed download |
|---|---|
| ja-core (tokenizer + JMdict trimmed) | ≤ 25 MB |
| zh-core (CC-CEDICT) | ≤ 6 MB |
| yue-core (CC-Canto + readings) | ≤ 4 MB |
| ko-core (Wiktionary-KO + kengdic) | ≤ 8 MB |
| JS chunks with embedded data (pinyin-pro dict, to-jyutping data) | measured; listed in pack UI as part of the language |

If a pack exceeds its budget: first drop gloss text beyond the limits above, then drop JMdict entries that have no priority tag **and** no kanji form shorter than 6 characters **and** are tagged archaic/rare — record in ADR with coverage impact measured on fixtures. Never silently drop coverage.

Install flow (worker): fetch with progress (`Content-Length`), `DecompressionStream('gzip')`, `TextDecoderStream`, split lines, bulk insert in batches of 5,000 rows inside chunked transactions; total time and rows logged to diagnostics.

---

## 10. Things this engine does **not** do (and why)

| Not done | Reason | Alternative in v0.1 |
|---|---|---|
| Whole-line English translation | No free, offline, licence-clean model of acceptable quality was confirmed for ko/ja/zh/yue→en within a phone memory budget. (Firefox's Bergamot offline translation models are worth a future spike.) | Word meanings + user "meaning" notes per word; user can add a free-text translation note per line (MAY). |
| Distinguishing Mandarin from Cantonese automatically | Same script; marker heuristics only suggest | User chooses; marker heuristic suggests |
| Hanja readings in Korean songs | Rare in lyrics; needs a Hanja table | Shown unannotated, user can correct |
| Song-specific readings (gikun) | Not predictable | Aozora import + corrections |
| Singing-specific pronunciation (vowel elongation, dropped syllables) | Not in text | Corrections |

---

## 11. Fallback and confidence summary

| Situation | Display | Confidence / note |
|---|---|---|
| Pack not installed / offline | Original text, banner to download | status `partial` |
| Analyser throws on a line | Original text tokens | status `failed`, diagnostic logged |
| Unknown Japanese kanji word | Original, "?" in Learn | `none`, `unknown-word` |
| Polyphone without word context | Reading shown, dotted underline | `medium`, `polyphone` |
| Korean lemma guessed | Meaning shown with "Likely dictionary form: 보다" | `medium`, `lemma-guess` |
| No dictionary entry | "No dictionary entry" | `dict: null` |
| User correction present | Corrected value, small dot marker | `high`, `userReading` |

---

## 12. Correction overlay (`engine/overlay.ts`)

Applied after analysis, before rendering, in this order per line:
1. Collect corrections for the song where `language === song.language` and (`lineKey === line.key` or `lineKey === null`).
2. `segLang` / split / merge corrections first (they change token boundaries) — re-run the affected span through the target-language analyser lazily if `segLang` changes the analyser (handled by including segLang overrides in the worker request so the cache key includes a hash of structural corrections for that line). **Decision:** structural corrections (segLang, split, merge) are sent to the worker and included in the cache key; value corrections (reading, romanisation, gloss) are applied on the main thread at render time. This keeps value edits instant and structural edits correct.
3. Value corrections match tokens by `surface` and `occurrence` (nth occurrence of that surface in the line; `null` = all).
4. If a reading is corrected, romanisation is recomputed from the new reading (ja: Hepburn; zh: projection; yue: identity; ko: user-supplied RR) unless the user also set `romanisation` explicitly.
5. Corrections that no longer match any token (e.g. after an engine change re-segments the line) are reported in the Song menu as "1 correction couldn't be applied" with a list to review — never silently dropped.
