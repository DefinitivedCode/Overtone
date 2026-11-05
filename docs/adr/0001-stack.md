# ADR 0001 — Stack

Status: accepted · Date: 2026-11-05

Records the stack from ARCHITECTURE §1 as installed, with the exact versions resolved at implementation time (see `package.json` / lockfile).

| Concern     | Choice                                                                                                   | Version                               |
| ----------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Build       | Vite + `@vitejs/plugin-react`                                                                            | vite 8.3.6                            |
| UI          | React, React Router (declarative)                                                                        | react 19.3.1, react-router-dom 7.18.5 |
| Persistence | Dexie + dexie-react-hooks                                                                                | 4.4.7 / 4.4.0                         |
| Validation  | zod                                                                                                      | 4.6.7                                 |
| Worker RPC  | Comlink                                                                                                  | 4.4.2                                 |
| Icons       | lucide-react                                                                                             | 1.69.0                                |
| Unit tests  | Vitest (projects: unit/jsdom, engine/node, linguistic/node), Testing Library, fake-indexeddb, fast-check | vitest 5.1.0                          |
| E2E         | Playwright (WebKit + Chromium), @axe-core/playwright                                                     | 1.64.1                                |
| Lint        | ESLint **9** (flat config), typescript-eslint, react-hooks, jsx-a11y, Prettier                           |                                       |

## Deviations from the plan

- **ESLint 9, not 10.** `eslint-plugin-jsx-a11y` (required by the plan) declares peer support only up to ESLint 9. Pinned `eslint@9` / `@eslint/js@9` instead of forcing a broken peer resolution. Revisit when the plugin supports ESLint 10.
- **`tsc --noEmit`** instead of `tsc -b --noEmit`: a single tsconfig covers `src`, `e2e`, `scripts` and `tests`; project references add nothing at this size.
- **`packs` and `brand` npm scripts** are added in the milestones that implement them (M7 and M1) rather than as empty stubs in M0, to avoid dead placeholder scripts.

## Consequences

Dependency versions are exact-pinned; upgrades are deliberate commits.
