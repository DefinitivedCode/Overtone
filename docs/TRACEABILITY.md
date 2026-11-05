# Traceability: acceptance criteria → verification

Generated from planning/PRODUCT_SPEC.md; status maintained by hand per milestone. "Pending" means not yet implemented. Nothing here is marked verified on a real device.

Last updated: end of M3.

| AC    | Level  | Status  | Verification                                                                                                      |
| ----- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------- |
| J1.1  | MUST   | Partial | Empty state done; offline after first load needs the service worker → M11                                         |
| J1.2  | MUST   | Covered | e2e/library.spec (Chromium; WebKit skipped), e2e/screens.spec                                                     |
| J1.3  | SHOULD | Pending | → M11                                                                                                             |
| J2.1  | MUST   | Covered | e2e/add-song.spec, src/lyrics/lyrics.test.ts                                                                      |
| J2.2  | MUST   | Covered | e2e/add-song.spec                                                                                                 |
| J2.3  | MUST   | Covered | e2e/add-song.spec, src/engine/segment/detect.test.ts                                                              |
| J2.4  | MUST   | Partial | Partial: saving is independent of processing by construction (no engine yet); re-verify in M5                     |
| J2.5  | MUST   | Covered | e2e/add-song.spec, src/lyrics/lyrics.test.ts                                                                      |
| J2.6  | MUST   | Covered | e2e/add-song.spec                                                                                                 |
| J2.7  | MUST   | Covered | MANUAL iOS #14–16 (Not yet verified on device)                                                                    |
| J2.8  | SHOULD | Pending | → M8                                                                                                              |
| J3.1  | MUST   | Pending | → M12                                                                                                             |
| J3.2  | MUST   | Pending | → M12                                                                                                             |
| J3.3  | MUST   | Pending | → M12                                                                                                             |
| J3.4  | MUST   | Pending | → M12                                                                                                             |
| J3.5  | MUST   | Pending | → M12                                                                                                             |
| J3.6  | MUST   | Pending | → M12                                                                                                             |
| J4.1  | MUST   | Partial | Original-text view verified at 5 widths (e2e/screens.spec); Learn mode → M6                                       |
| J4.2  | MUST   | Pending | → M6                                                                                                              |
| J4.3  | MUST   | Pending | → M6                                                                                                              |
| J4.4  | MUST   | Pending | → M6                                                                                                              |
| J4.5  | MUST   | Pending | → M6                                                                                                              |
| J4.6  | MUST   | Pending | → M6                                                                                                              |
| J4.7  | MUST   | Pending | → M6                                                                                                              |
| J4.8  | SHOULD | Pending | → M6                                                                                                              |
| J5.1  | MUST   | Pending | → M6                                                                                                              |
| J5.2  | MUST   | Pending | → M6                                                                                                              |
| J5.3  | MUST   | Pending | → M6                                                                                                              |
| J5.4  | MUST   | Pending | → M6                                                                                                              |
| J5.5  | SHOULD | Pending | → M6                                                                                                              |
| J5.6  | MAY    | Pending | → M6                                                                                                              |
| J6.1  | MUST   | Pending | → M6                                                                                                              |
| J6.2  | MUST   | Pending | → M6                                                                                                              |
| J6.3  | SHOULD | Pending | → M6                                                                                                              |
| J7.1  | MUST   | Partial | Data-layer done (repositories.test); UI toggle → M6                                                               |
| J7.2  | MUST   | Partial | Data-layer + Library bar done; header/all-modes → M6                                                              |
| J7.3  | MUST   | Partial | Data-layer done (repositories.test); UI → M6                                                                      |
| J7.4  | MUST   | Partial | Data-layer done (repositories.test); UI → M10                                                                     |
| J7.5  | MUST   | Covered | e2e/edit.spec, src/db/repositories/repositories.test.ts, src/features/song/editSummary.test.ts                    |
| J7.6  | MUST   | Covered | e2e/edit.spec                                                                                                     |
| J7.7  | SHOULD | Covered | e2e/library.spec                                                                                                  |
| J8.1  | MUST   | Partial | Data-layer done (corrections persist, survive cache clear); UI → M10                                              |
| J8.2  | MUST   | Partial | Data-layer done (repositories.test); UI → M10                                                                     |
| J8.3  | MUST   | Pending | → M10                                                                                                             |
| J8.4  | MUST   | Pending | → M10                                                                                                             |
| J8.5  | MUST   | Pending | → M10                                                                                                             |
| J9.1  | MUST   | Covered | e2e/edit.spec (details/language), repositories.test (corrections inactive/reactivated); re-processing → M5        |
| J9.2  | MUST   | Covered | e2e/library.spec, e2e/edit.spec                                                                                   |
| J9.3  | MUST   | Covered | e2e/library.spec (row menu / long-press)                                                                          |
| J10.1 | MUST   | Partial | Original/lyrics/diacritic search done (fold.test, library.spec); romanised search (saranghae) → M5/M6             |
| J10.2 | MUST   | Covered | e2e/library.spec                                                                                                  |
| J10.3 | MUST   | Covered | src/features/library/libraryModel.test.ts, e2e/library.spec                                                       |
| J10.4 | MUST   | Covered | e2e/library.spec                                                                                                  |
| J10.5 | MUST   | Covered | e2e/library.spec                                                                                                  |
| J10.6 | MUST   | Partial | Node budget (fold.test: 1,000 songs < 50 ms); throttled CI measurement → M13                                      |
| J11.1 | MUST   | Covered | e2e/backup.spec, src/db/backup/backup.test.ts                                                                     |
| J11.2 | MUST   | Covered | e2e/backup.spec (share + download paths; real iOS share sheet → MANUAL #19)                                       |
| J11.3 | MUST   | Covered | e2e/backup.spec, src/db/backup/backup.test.ts                                                                     |
| J11.4 | MUST   | Covered | e2e/backup.spec                                                                                                   |
| J11.5 | MUST   | Covered | src/db/backup/backup.test.ts                                                                                      |
| J11.6 | MUST   | Covered | src/db/backup/backup.test.ts, e2e/backup.spec                                                                     |
| J11.7 | MUST   | Partial | Rule + counters done (libraryModel.test, repositories.test); banner UI e2e → later                                |
| J12.1 | MUST   | Pending | → M11                                                                                                             |
| J12.2 | MUST   | Pending | → M11                                                                                                             |
| J12.3 | MUST   | Pending | → M11                                                                                                             |
| J12.4 | MUST   | Covered | e2e/add-song.spec (API stubbed; real iOS grant → MANUAL #18)                                                      |
| J12.5 | MUST   | Covered | e2e/recovery.spec, src/db/repositories/repositories.test.ts                                                       |
| J12.6 | MUST   | Partial | Typed errors + no partial writes (repositories.test); Add-sheet error banner implemented, e2e of quota path → M11 |
| J12.7 | MUST   | Pending | → M11                                                                                                             |
| J13.1 | MUST   | Covered | e2e/shell.spec                                                                                                    |
| J13.2 | MUST   | Partial | Setting + preview done (e2e/shell.spec); lyric modes → M6                                                         |
| J13.3 | MUST   | Pending | → M9                                                                                                              |
| J13.4 | MUST   | Pending | → M9                                                                                                              |
