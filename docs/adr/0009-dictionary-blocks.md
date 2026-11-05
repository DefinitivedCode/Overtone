# ADR 0009 — Store dictionary shards in byte blocks

Status: accepted · Date: 2026-11-05

## Context

The M7 draft inserted each `(form, entry)` into its own IndexedDB record. Chromium finished, but WebKit did not finish either real pack within 180 seconds. Removing glosses or a secondary index would still leave one write per row. Grouping by full headword would also retain one record per distinct form.

First-character sharding preserves exact lookup and reduces the write count, but the full source files have 14,429 Mandarin and 8,742 Cantonese initial code points. One record per initial still timed out in the WebKit Mandarin benchmark. Loading the whole dictionary into JavaScript would avoid those writes at the expense of startup and worker memory. A Blob per group of initials would permit lazy byte reads, but a direct test on Playwright WebKit 27.2 for Windows rejected a simple Blob write with `UnknownError` while a typed-array write succeeded.

## Decision

- Keep the gzip JSON Lines format and group rows by initial Unicode code point at build time. Version the resulting URLs so existing Cache Storage entries cannot supply the old ordering.
- Store raw UTF-8 JSONL in a `Uint8Array` block with byte ranges for each initial. Use 256 BMP code points per block and 4,096 supplementary code points per block, where the data is sparse. The pack stays compressed in transit. Installation verifies SHA-256, validates rows and counts, and stages blocks as it decompresses the file. The installer retains the compressed download and a batch of encoded blocks, with no full parsed dictionary.
- Read a block at a time and decode only the requested ranges. Match the complete form before returning candidates. Preserve simplified and traditional aliases, multiple entries per form and the existing order by common entry and entry ID.
- Key staged data by a generation ID. The staging record identifies the only attempt that can write or publish. Readers fetch metadata and blocks in one transaction. Publication switches the active generation and retires the previous one in the same transaction. A retry or removal invalidates any unfinished attempt. After an interrupted tab, the next attempt or removal reclaims its staged blocks. Updates and cancellations leave songs and progress in the separate user database.
- Keep the v1 per-row store readable after the v2 schema upgrade so previously installed M7 development packs open offline. Replace or remove those rows when the user updates or removes the corresponding pack. Clearing the last legacy pack uses a single store clear. Targeted cleanup may take longer when another legacy pack is still installed.

## Measured data shape

| Pack      |    Rows | Initials | IndexedDB data records | Largest UTF-8 block | Largest initial range |
| --------- | ------: | -------: | ---------------------: | ------------------: | --------------------: |
| Mandarin  | 203,358 |   14,429 |                    130 |         1,466,425 B |             194,278 B |
| Cantonese | 215,170 |    8,742 |                    116 |         1,020,324 B |             170,064 B |

Sizes are payload measurements. IndexedDB serialization and browser heap overhead vary by platform. The low-space warning uses the larger of three times the download size or the compressed plus uncompressed payload size.

See `docs/PROGRESS.md` for the production installer benchmark and browser checks. Reproduce with `node scripts/spikes/idb-install.mjs` after building packs and the app.
