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
const LAST = 'end of M7';

const covered = {
  'J1.2': 'e2e/library.spec, e2e/screens.spec (Chromium; WebKit skipped)',
  'J2.1': 'e2e/add-song.spec, src/lyrics/lyrics.test.ts',
  'J2.2': 'e2e/add-song.spec',
  'J2.3': 'e2e/add-song.spec, src/engine/segment/detect.test.ts',
  'J2.5': 'e2e/add-song.spec, src/lyrics/lyrics.test.ts',
  'J2.6': 'e2e/add-song.spec',
  'J2.7': 'MANUAL iOS #14–16 (Not yet verified on device)',
  'J4.4': 'e2e/modes.spec, e2e/progress.spec',
  'J5.1':
    'e2e/modes.spec (≥ 28 px; scales with text size), e2e/packs.spec (Mandarin and Cantonese)',
  'J5.2': 'e2e/modes.spec (zero interactive elements)',
  'J5.3': 'e2e/modes.spec, tests/linguistic (routing 43/43)',
  'J5.4': 'e2e/modes.spec, src/engine/engine.test.ts',
  'J5.5': 'e2e/screens.spec (axe, dark)',
  'J6.1': 'e2e/modes.spec, e2e/packs.spec',
  'J6.2': 'e2e/modes.spec, e2e/packs.spec',
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
    'e2e/packs.spec (download with progress, remove with confirmation, sizes shown), src/engine/dict/dict.test.ts (atomic replacement, cancellation, legacy migration)',
  'J12.3':
    'e2e/packs.spec (notice with size, original text meanwhile, processing resumes, offline notice)',
  'J13.1': 'e2e/shell.spec',
  'J13.2': 'e2e/shell.spec, e2e/modes.spec (all three modes)',
};
const partial = {
  'J1.1':
    'Empty state done; service worker precaches the shell (e2e/packs.spec offline flow); dedicated offline.spec → M11',
  'J2.4':
    'Saving is independent of processing (engine runs after save, in a worker with main-thread fallback: engine.test); quota path e2e → M11',
  'J4.1':
    'Learn/Karaoke/Clean at 5 widths with Korean/Latin/URL fixtures (e2e/screens.spec) and annotated Mandarin/Cantonese (e2e/packs.spec); Japanese annotations → M8',
  'J4.2':
    'Ruby alignment measured in ADR 0007; per-width rt-vs-base bounding-box test not yet written',
  'J4.5':
    '"?" marker for unknown segments done (e2e/modes.spec); "No reading found" Word sheet → M9',
  'J4.6': 'Dotted underline for low-confidence tokens done; explanation in the Word sheet → M9',
  'J7.1':
    'Optimistic toggle + persistence done (e2e/progress.spec); the failure-revert path is not exercised by a test',
  'J7.4': 'Data-layer (repositories.test); correction UI → M10',
  'J8.1': 'Data-layer done (repositories.test); UI → M10',
  'J8.2': 'Data-layer done (repositories.test); UI → M10',
  'J9.1':
    'Edit details/language + corrections inactive/reactivated done (e2e/edit.spec, repositories.test); reprocessing is automatic via the cache key (not separately tested)',
  'J10.6': 'Node budget (fold.test: 1,000 songs < 50 ms); throttled CI measurement → M13',
  'J11.7': 'Rule + counters (libraryModel.test, repositories.test); banner e2e → later',
  'J12.1':
    'e2e/packs.spec reopens and analyses songs offline with both installed packs; full offline matrix → M11',
  'J12.6': 'Typed errors + no partial writes (repositories.test); e2e of the quota banner → M11',
  'J13.3':
    'Korean mode (e2e/modes.spec), Mandarin tone style and sandhi and fixed Cantonese tone numbers (e2e/packs.spec); Japanese options → M8',
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
