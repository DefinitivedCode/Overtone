# Overtone v0.1 — progress log

Branch: `v0.1-implementation`. Nothing has been pushed or deployed.

## Needs human input

_None at present._

## Conflicts between planning documents

_None found yet._

## Scope deviations

_None. (Tooling deviations are recorded in `docs/adr/0001-stack.md`.)_

---

## M0 — Project scaffold and quality gates — done

Date: 2026-11-05

### Delivered

- Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`), npm, `.nvmrc` (22), `engines`.
- ESLint 9 flat config (typescript-eslint, react-hooks, jsx-a11y, import boundaries per ARCHITECTURE §2, `dangerouslySetInnerHTML` banned), Prettier.
- Vitest projects `unit` (jsdom), `engine` (node), `linguistic` (node); Testing Library, fake-indexeddb, fast-check installed.
- Playwright with `webkit-iphone`, `webkit-iphone-se`, `chromium-mobile`, `chromium-desktop`, run against `build` + `vite preview`; a fixture fails any test that logs `console.error`.
- Scripts: `dev, build, preview, lint, format, typecheck, test, test:ling, e2e, verify`. (`packs` → M7, `brand` → M1; see ADR 0001.)
- `.gitignore` additions, `.github/workflows/ci.yml`, `docs/KNOWN_LIMITATIONS.md`, `docs/adr/0001-stack.md`.

### Verification (actual output)

- `npm run verify`: lint clean, typecheck clean, 1 unit test passed, build OK, 4 e2e passed (webkit-iphone, webkit-iphone-se, chromium-mobile, chromium-desktop).
- Initial JS: 68.6 KB gzip (React + router not yet used).
- Not run: CI workflow (GitHub Actions) has not been executed — nothing pushed.

### Scope deviations / limitations

- ESLint pinned to 9 (jsx-a11y peer constraint). See ADR 0001.

### Follow-ups

- `test:ling` uses `--passWithNoTests` until M5 adds linguistic suites.
