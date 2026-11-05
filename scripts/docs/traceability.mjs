// Regenerates docs/TRACEABILITY.md from planning/PRODUCT_SPEC.md ACs and the status map below.
// Update the maps when a milestone lands; "Pending" is anything not listed.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const spec = readFileSync(path.join(root, 'planning/PRODUCT_SPEC.md'), 'utf8');
const rows = [...spec.matchAll(/^- (J\d+\.\d+) (MUST|SHOULD|MAY):? ?(.*)$/gm)].map((m) => ({
  id: m[1],
  lvl: m[2],
}));
const LAST = 'M13 (release candidate)';

const covered = {
  'J11.7':
    'libraryModel.test, repositories.test, e2e/backup.spec (appears after 7 days, dismissal persists)',
  'J1.1':
    'e2e/offline.spec (cold reload and deep link offline, modes, progress, Settings, Licences), e2e/packs.spec',
  'J1.3':
    'e2e/offline.spec (iPhone projects show the tip, others do not, dismissal persists); real Safari → MANUAL #29',
  'J2.4':
    'engine.test (saving is independent of processing), e2e/learn-interactions.spec (quota error keeps the form and offers Export)',
  'J3.1':
    'e2e/lrclib.spec (offline state, service blocked, manual save), src/online/lrclib.test.ts',
  'J3.2':
    'src/online/lrclib.test.ts (every error kind, 429 + Retry-After), e2e/lrclib.spec (503 + Retry, 429 countdown, unreadable reply)',
  'J3.3': 'src/online/lrclib.test.ts (normalised, capped, markup stays text), e2e/lrclib.spec',
  'J3.4': 'e2e/lrclib.spec (instrumental and lyric-less results disabled with a reason)',
  'J3.5':
    'e2e/lrclib.spec (source with untouched synced lyrics stored; "Lyrics from LRCLIB" shown)',
  'J3.6': 'e2e/lrclib.spec (notice visible)',
  'J4.3':
    'e2e/learn-interactions.spec (accessible name, ≥ 44 × 24 px target), e2e/screens.spec and e2e/packs.spec (axe target-size)',
  'J4.5':
    'e2e/learn-interactions.spec ("?" marker, "No reading found", Correct… gives it a reading), e2e/modes.spec',
  'J4.6': 'e2e/learn-interactions.spec (dotted underline and explanation)',
  'J4.7':
    'e2e/word-sheet.spec ("No dictionary entry was found…", missing-pack prompt), src/features/word/lookup.test.ts',
  'J4.8':
    'e2e/learn-interactions.spec (right-click and context-menu key: mark learned, copy original/romanised). Long-press on iOS → MANUAL #12',
  'J5.6':
    'Implemented in KaraokeView (feature-detected, released on leave); cannot be exercised in CI → MANUAL',
  'J7.1': 'e2e/progress.spec, e2e/learn-interactions.spec (failed write reverts and toasts)',
  'J7.4': 'e2e/learn-interactions.spec, repositories.test',
  'J8.1': 'e2e/corrections.spec (reload), backup.test (all patch types), overlay.test.ts',
  'J8.2': 'e2e/corrections.spec (lyric edits), repositories.test',
  'J8.3': 'e2e/corrections.spec (Learn, Karaoke and Clean update at once)',
  'J8.4':
    'src/engine/overlay.test.ts (romaji → kana, pinyin marks/numbers, Jyutping), e2e/corrections.spec (syllable-count error)',
  'J8.5': 'e2e/corrections.spec (Revert), overlay.test.ts',
  'J9.1':
    'e2e/edit.spec, repositories.test, overlay.test.ts (language mismatch is inactive); re-processing is automatic via the cache key',
  'J12.1': 'e2e/offline.spec, e2e/packs.spec, e2e/japanese.spec',
  'J12.6':
    'repositories.test (typed errors, no partial writes), e2e/learn-interactions.spec (quota error with Export)',
  'J12.7':
    'e2e/update.spec (real worker swap in Chromium and WebKit: held while a sheet is open, Reload, data intact)',
  'J13.4':
    'e2e/word-sheet.spec (Licences screen), tests/tooling/licences.test.ts (generated list matches dependencies and pinned sources)',
  'J1.2': 'e2e/library.spec, e2e/screens.spec (Chromium; WebKit skipped)',
  'J2.1': 'e2e/add-song.spec, src/lyrics/lyrics.test.ts',
  'J2.2': 'e2e/add-song.spec',
  'J2.3': 'e2e/add-song.spec, src/engine/segment/detect.test.ts',
  'J2.5': 'e2e/add-song.spec, src/lyrics/lyrics.test.ts',
  'J2.6': 'e2e/add-song.spec',
  'J2.7': 'MANUAL iOS #14–16 (Not yet verified on device)',
  'J2.8':
    'e2e/japanese.spec, src/lyrics/aozora.test.ts, backup.test (pasted readings and persistence)',
  'J4.1':
    'e2e/screens.spec, e2e/packs.spec, e2e/japanese.spec (five widths across supported languages)',
  'J4.4': 'e2e/modes.spec, e2e/progress.spec',
  'J5.1':
    'e2e/modes.spec (≥ 28 px and scales with text size), e2e/packs.spec and e2e/japanese.spec',
  'J5.2': 'e2e/modes.spec (zero interactive elements)',
  'J5.3': 'e2e/modes.spec, tests/linguistic (routing 43/43)',
  'J5.4': 'e2e/modes.spec, src/engine/engine.test.ts',
  'J5.5': 'e2e/screens.spec (axe, dark)',
  'J6.1': 'e2e/modes.spec, e2e/packs.spec, e2e/japanese.spec',
  'J6.2': 'e2e/modes.spec, e2e/packs.spec, e2e/japanese.spec',
  'J6.3': 'e2e/modes.spec (user-select: text)',
  'J7.2': 'e2e/progress.spec, repositories.test',
  'J7.3': 'e2e/progress.spec, repositories.test',
  'J7.5': 'e2e/edit.spec, e2e/progress.spec, repositories.test, editSummary.test',
  'J7.6': 'e2e/progress.spec, e2e/edit.spec',
  'J7.7': 'e2e/library.spec, e2e/progress.spec',
  'J9.2': 'e2e/library.spec, e2e/edit.spec',
  'J9.3': 'e2e/library.spec (row menu / long-press)',
  'J10.1':
    'fold.test, libraryModel.test, e2e/library.spec, e2e/modes.spec (saranghae finds 사랑해)',
  'J10.2': 'e2e/library.spec',
  'J10.3': 'libraryModel.test, e2e/library.spec',
  'J10.4': 'e2e/library.spec',
  'J10.5': 'e2e/library.spec',
  'J11.1': 'e2e/backup.spec, backup.test',
  'J11.2': 'e2e/backup.spec (share + download; real iOS share sheet → MANUAL #19)',
  'J11.3': 'e2e/backup.spec, backup.test',
  'J11.4': 'e2e/backup.spec',
  'J11.5': 'backup.test',
  'J11.6': 'backup.test, e2e/backup.spec',
  'J12.4': 'e2e/add-song.spec (API stubbed; real iOS grant → MANUAL #18)',
  'J12.5': 'e2e/recovery.spec, repositories.test',
  'J12.2':
    'e2e/packs.spec, e2e/japanese.spec, dict.test (verified tokenizer cache and dictionary publication, cancellation, legacy migration)',
  'J12.3':
    'e2e/packs.spec, e2e/japanese.spec (notice with size, original text meanwhile, processing resumes, offline notice)',
  'J13.1': 'e2e/shell.spec',
  'J13.2': 'e2e/shell.spec, e2e/modes.spec (all three modes)',
  'J13.3':
    'e2e/modes.spec (Korean), e2e/packs.spec (Mandarin and Cantonese), e2e/japanese.spec (Japanese)',
};
const partial = {
  'J4.2':
    'e2e/japanese.spec checks ruby alignment at five widths; e2e/screens.spec and e2e/packs.spec check overflow at five widths for the other languages. ADR 0007 measured them.',
  'J10.6':
    'Node budget (fold.test: 1,000 songs < 50 ms). The throttled-browser CI measurement was not built.',
};
const milestone = (id) =>
  ({
    1: 'M11',
    2: 'M8',
    3: 'M12',
    4: 'M9',
    5: 'M6',
    6: 'M6',
    7: 'M6',
    8: 'M10',
    9: 'M10',
    10: 'M5',
    11: 'M11',
    12: 'M11',
    13: 'M9',
  })[Number(id.slice(1).split('.')[0])];

let md = `# Traceability: acceptance criteria → verification\n\nGenerated by \`scripts/docs/traceability.mjs\` from planning/PRODUCT_SPEC.md; the status maps live in that script. "Pending" means not yet implemented. Nothing here is marked verified on a real device.\n\nLast updated: ${LAST}.\n\n| AC | Level | Status | Verification |\n|---|---|---|---|\n`;
for (const r of rows) {
  const [status, ver] = covered[r.id]
    ? ['Covered', covered[r.id]]
    : partial[r.id]
      ? ['Partial', partial[r.id]]
      : ['Pending', `→ ${milestone(r.id)}`];
  md += `| ${r.id} | ${r.lvl} | ${status} | ${ver} |\n`;
}
writeFileSync(path.join(root, 'docs/TRACEABILITY.md'), md);
const lines = md.split('\n').filter((l) => l.startsWith('| J'));
console.log(
  `${rows.length} ACs: ${lines.filter((l) => l.includes('| Covered |')).length} covered, ${lines.filter((l) => l.includes('| Partial |')).length} partial`,
);
