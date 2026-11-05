# ADR 0008 — Brand asset toolchain dependencies

Status: accepted · Date: 2026-11-05

DESIGN_SYSTEM §1.4 requires deterministic SVG→PNG generation with outlined text and **no dependence on fonts installed on the build machine**.

## Dependencies added (all dev-only, none in the app bundle)

| Package                               | Licence           | Purpose                                                            |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| `@resvg/resvg-js`                     | MPL-2.0 (tooling) | SVG → PNG (planned)                                                |
| `opentype.js` 2.0.0                   | MIT               | Outline text to `<path>` (planned)                                 |
| `@fontsource/instrument-serif`        | OFL-1.1           | Wordmark outlines **and** the self-hosted WOFF2 shipped in the app |
| `@fontsource/inter`                   | OFL-1.1           | Tagline / romanisation specimen outlines only (not shipped)        |
| `@fontsource/noto-sans-{kr,jp,sc,hk}` | OFL-1.1           | Banner specimen glyph outlines only (not shipped)                  |
| `tsx`                                 | MIT               | Run TypeScript scripts                                             |

## Decision: Fontsource npm packages instead of SHA-pinned downloads into `.cache/fonts/`

The plan suggested downloading font files with SHA-256 pins. Fontsource republishes the same OFL fonts as npm packages; `package-lock.json` integrity hashes pin them, so no extra download/verify code is needed and `npm ci` reproduces them offline. CJK fonts are split into unicode-range slices; the script scans slices for each glyph.

## Findings (surprises)

- `opentype.js` 2.0.0 has no bundled types (a minimal `scripts/brand/opentype.d.ts` was written) and exposes only a default export in ESM.
- `Path.toPathData()` produced malformed path data for some glyphs (a `Q` command lost coordinates; resvg then stops at the first bad command, truncating the wordmark). Fixed by serialising `path.commands` ourselves.
- Some Noto WOFF slices fail in opentype's inflater; they are skipped, and a glyph that exists in no loadable slice makes the build fail loudly (none were missing for the banner text).

## Consequences

`npm run brand` is deterministic (tested: two runs byte-identical, and committed assets equal a fresh build). Output is committed so normal builds need no native tooling.
