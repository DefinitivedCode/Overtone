# Release checklist: Overtone v0.1.0

Version `0.1.0` is set in `package.json` and `src/app/version.ts`. The git tag `v0.1.0` is **prepared, not created**: tag only when the owner asks.

## Automated gates (run by `npm run verify` and `npm run test:ling`)

- [x] `npm run packs`: all four packs build from the pinned, checksummed sources, inside their size budgets.
- [x] `npm run lint`: ESLint (typescript-eslint, react-hooks, jsx-a11y, import boundaries) and Prettier.
- [x] `npm run typecheck`: strict TypeScript.
- [x] `npm test`: unit, engine and tooling tests.
- [x] `npm run build`: production build; warns if the precache exceeds 2 MiB.
- [x] `npm run e2e`: Playwright against the production build in WebKit (iPhone 15, iPhone SE) and Chromium (mobile, desktop): layout at 320–768 px, axe, offline, updates, packs, all four languages, corrections, LRCLIB (mocked).
- [x] `npm run test:ling`: linguistic accuracy and dictionary coverage suites.

The counts for the release candidate are in the final section of `docs/PROGRESS.md`.

## Content checks

- [x] No placeholders, TODOs or dead controls in shipped UI (grep of `src/`; the iOS/Chrome-only features are feature-detected).
- [x] No secrets: the app has no keys, no `.env` use, and the build output contains none.
- [x] Privacy: no analytics, no third-party scripts, no third-party fonts; network is limited to the app's own origin and, on user action, `lrclib.net`.
- [x] Security: CSP (`<meta>` plus `_headers` with `frame-ancestors`), `nosniff`, `Referrer-Policy: no-referrer`; user and fetched text is rendered only through React text nodes (`dangerouslySetInnerHTML` is banned by lint); imports are schema-validated.
- [x] Licences: About & licences lists every dictionary, font and runtime dependency (generated; a test fails when it goes stale).
- [x] `docs/KNOWN_LIMITATIONS.md` is current. `docs/TRACEABILITY.md` maps every acceptance criterion to its test (71 covered, 2 partial, none pending).

## Not done and not claimable from this environment

- **Real-iPhone verification.** `docs/IOS_VERIFICATION.md` lists 32 checks, every one **Not yet verified**. Playwright WebKit is desktop WebKit with mobile emulation.
- **Fluent-speaker review** of the linguistic fixtures (all self-authored; see `docs/LINGUISTIC_REPORT.md`).
- **Wiktionary reuse wording** was taken from kaikki.org's statement (CC BY-SA 4.0 and GFDL) and not re-read on Wiktionary's own page.

## Manual iPhone test (about 15 minutes)

On the deployed URL, in Safari on an iPhone:

1. Open the site and wait a few seconds. Tap Share → **Add to Home Screen**, then launch it from the Home Screen. It should open full screen with the Overtone icon and a splash screen that matches light or dark mode.
2. **Add song**: paste a few Korean lines (or Japanese/Chinese), give it a title, Save. Learn mode shows the romanisation above each word, with English words in the same row. Long-press a line for Copy / Mark learned.
3. Tap a word: the Word sheet opens. Tap **Download Korean dictionary** (2 MB), and meanings appear. Try **Correct…** on a word, then **Revert**.
4. Switch to **Karaoke**; for Korean tap **Split into syllables**. Switch to **Clean** and toggle Original / Romanised.
5. **Settings**: change text size and check lyrics scale; open Pronunciation → Japanese/Mandarin; download a language pack on Wi-Fi (Japanese is 25 MB).
6. Turn on **airplane mode** and force-quit and relaunch the app: the Library, your songs and Learn/Karaoke/Clean still work.
7. **Settings → Export backup**, Save to Files; then Import it again and check the preview.
8. Rotate to landscape on a song; check nothing sits under the notch and there is no horizontal scroll.
9. Try the on-screen keyboard in Add song (long text): the caret stays visible; the Title field does not zoom the page.
10. Record results in `docs/IOS_VERIFICATION.md` (it has a row for each check).

## Deploy

See the README (Cloudflare Pages). Build with `npm run packs && npm run build`, then upload `dist/`. Do not deploy a `dist/` that lacks `packs/` (language downloads would 404).
