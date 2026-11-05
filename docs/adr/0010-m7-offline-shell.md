# ADR 0010 — M7 offline shell and precache budget

Status: accepted for M7 · Date: 2026-11-05

M7 introduces a Vite-generated service worker for the offline shell and the versioned pack route. The shell uses a network-first navigation with a three-second timeout. Built assets are precached, pack binaries are cache-first, and the small pack manifest has a network-first route with an offline fallback. Installing, updating, and removing a dictionary remains an IndexedDB operation. The app uses the installed database after a download, including when analysis runs on the main thread after a worker failure.

The Windows production build precaches 2,320,689 bytes (2.213 MiB) across 22 URLs, excluding dictionary binaries. The 2 MiB planning budget is exceeded by 223,537 bytes. Vite generates separate copies of the Mandarin and Cantonese readers for the worker and the main-thread fallback. Both are precached so an offline worker failure can still use the fallback with an installed pack. The main JavaScript bundle is 175.95 kB gzip against a 180 kB budget.

Keep the warning visible and accept the 2.213 MiB precache for this milestone. Revisit duplication and the final service-worker implementation in M11, where the plan also requires app-update prompts and real-device offline verification.
