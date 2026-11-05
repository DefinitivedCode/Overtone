# ADR 0011 — Japanese worker resources and pasted readings

Status: accepted for M8 · Date: 2026-11-05

## Tokenizer and dictionary

Use the exact `lindera-wasm-web-ipadic` 2.0.0 web build selected in ADR 0002. The installed Japanese pack has a checksummed gzip WASM file and a separate checksummed JMdict JSONL file. An opaque `.pack` extension prevents a static server from setting `Content-Encoding: gzip` and changing the bytes exposed to the verifier. Vite emits only the wasm-bindgen JavaScript glue as an app asset. The worker loads it on the first Japanese request with an installed pack and initializes it from a streamed Cache Storage response. The service worker precaches the glue so a fresh worker can initialize offline. The large WASM and JMdict payloads stay outside the shell.

Verified tokenizer data is staged under a generation-specific cache key. The IndexedDB publish transaction references that key and exposes the JMdict generation together. WebKit 27.2 lost the verified cache entry after reloading a page that installed without service-worker control. The same entry survived when installed from a controlled page. The production installer asks the active service worker to claim the page before starting a tokenizer install, so the cold offline path works even if the user installs from Settings before opening a Japanese song. Failure, replacement, and removal clean up their own cache keys. The app uses one pinned WASM ABI per app build and releases the instance by terminating the worker. If the module worker fails, Japanese falls back to the original text and any pasted readings to keep the WASM heap out of the page.

JMdict keeps written and kana forms and alternate readings with form restrictions applied. Keep up to three senses with two English glosses of 72 characters each. This reduces the first build's 25.61 MiB to 24.87 MiB without removing headwords to meet the size target. JMdict places many forms in the kana Unicode page. The largest block would have held about 36 MiB under ADR 0009's Chinese bucket sizes, so Japanese uses separate initial-character buckets for that page. Other pages and the Chinese layout retain the prior bucketing.

Use IPADIC reading and pronunciation separately, exact JMdict fallback for unreadable kanji, and bounded kana-anchor alignment for furigana. Token offsets remain UTF-16. Render-time Hepburn uses inflection and POS to keep attached forms together and distinguish, for example, 東京 from 思う. The shipped polyphone rules cover common standalone counters and mark ambiguous forms. Particle and auxiliary glosses are stored for later presentation.

## Aozora and compatibility

Preserve the original paste in `Song.rawLyrics`, with an explicit per-song `usePastedReadings` choice. The line parser derives stripped display text and UTF-16 reading spans. Progress keys still use displayed text, so repeated text shares progress even if occurrences have different pasted readings. The analysis cache also keys on each occurrence's spans. Pasted readings are available before installation. The general correction overlay remains scheduled for M10.

Backups with a pasted-reading choice use schema v2. They export the source and choice and rebuild line rows on import. Legacy v1 backups retain literal text and their original progress keys. A library without any pasted-reading choice still exports v1. No IndexedDB schema migration is needed for these optional fields.

The public pack includes the MIT notice and links to the original IPADIC redistribution notice. Settings acknowledges JMdict and EDRDG. See the [IPADIC source](https://github.com/lindera-morphology/mecab-ipadic/blob/master/COPYING) and [EDRDG licence](https://www.edrdg.org/edrdg/newlic.html).

## Shell budget

Continue ADR 0010's precache exception for M8. The shell precaches 2,374,008 bytes (2.264 MiB) against 2 MiB, including 27,779 bytes of Japanese loader glue for cold offline startup. It already exceeded the target by 223,537 bytes in M7 because of duplicated Chinese readers. Keep the budget warning visible and retain the existing offline fallback in this milestone. The WASM and JMdict stay outside the shell, and backup export code loads on demand. The initial JavaScript bundle is 153.36 kB gzip against 180 kB.
