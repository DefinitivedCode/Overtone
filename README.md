# Overtone

*Read it. Say it. Sing it.*

Overtone is a local-first app for learning song lyrics in Korean, Japanese, Mandarin and Cantonese. Paste lyrics to see pronunciation in Learn mode and mark lines as learned. Karaoke shows large romanised text, and Clean shows the lyrics in a plain layout.

- Designed first for the iOS Home Screen (installed as a PWA), and it works offline.
- No accounts and no server. Everything stays on your device. You can back up and restore with JSON export/import.
- Free to run. It has no paid APIs and no hosted AI.

> **Status** — Pronunciation, display modes, progress, and local backups are implemented for all four languages. Japanese also supports pasted Aozora readings. Tap-for-meaning is planned.

## Local development

Use Node 22 or newer. Run `npm ci`, `npm run packs`, then `npm run dev`. Japanese, Mandarin and Cantonese packs are downloaded on demand from Settings or a song and work offline after installation in the production build.

`npm run packs` verifies the upstream archives against `scripts/packs/sources.json`. Keep the pinned archives in `.cache/dicts` for reproducible rebuilds when a publisher updates its download. The pack manifest records the sources and licences.

Run `npx playwright install chromium webkit`, `npm run verify`, and `npm run test:ling` to check the production app and linguistic fixtures.

## Planning

The full engineering plan is in [`planning/`](planning/README.md). Start with [`planning/AUTONOMOUS_AGENT.md`](planning/AUTONOMOUS_AGENT.md).
