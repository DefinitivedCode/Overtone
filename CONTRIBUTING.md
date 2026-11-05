# Contributing to Overtone

Thanks for helping. Overtone is a small, local-first PWA; the bar is "does it help someone learn a song, without breaking privacy or offline use".

## Set up

```bash
npm ci
npm run packs
npx playwright install chromium webkit
npm run dev
```

## Before you open a pull request

Run `npm run verify` (lint, typecheck, unit tests, build, Playwright in WebKit and Chromium) and, if you touched pronunciation or dictionaries, `npm run test:ling`. Keep changes small and focused, and add a test that fails without your change.

## Ground rules

- No analytics, third-party scripts, fonts from CDNs, or new network calls beyond the app's own origin and `lrclib.net`.
- User and fetched text is rendered only as React text (`dangerouslySetInnerHTML` is banned by lint).
- Prefer existing dependencies; explain any new one.
- Do not claim accuracy you have not measured. Linguistic fixtures should say who wrote or reviewed them; fluent-speaker review of the fixtures in `fixtures/linguistic` is especially welcome.
- Bigger design decisions go in `docs/adr/` with measurements.

## Reporting problems

Open an issue with the language, the lyric line, what Overtone showed, and what you expected. For a wrong reading, the line and the correct reading are enough. Please do not paste full copyrighted lyrics: a single line is plenty.
