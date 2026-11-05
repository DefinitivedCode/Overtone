import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { PackInfo, PackManifest } from '../../src/engine/dict/types';
import { fetchSource, root, sources } from './fetch-sources';
import type { SourceId } from './fetch-sources';
import { parseCanto, parseCedict, toJsonLines } from './parse';
import { unzip } from './zip';

/** Compressed size budgets (LANGUAGE_ENGINE §9) — the build fails if exceeded by more than 25 %. */
const BUDGET_MB: Record<string, number> = { 'zh-core': 6, 'yue-core': 4 };

async function text(id: SourceId, entry: RegExp): Promise<string> {
  const files = unzip(await fetchSource(id));
  const name = [...files.keys()].find((n) => entry.test(n));
  if (!name) throw new Error(`${id}: no file matching ${entry} in the archive`);
  return files.get(name)!.toString('utf8');
}

async function rowsFor(pack: string) {
  if (pack === 'zh-core') return parseCedict(await text('cedict', /cedict_ts\.u8$/));
  const canto = parseCanto(await text('cccanto', /cccanto-webdist\.txt$/), true);
  const readings = parseCanto(await text('cccanto-readings', /\.txt$/), false, 1_000_000);
  return [...canto, ...readings];
}

const outRoot = path.join(root, 'public', 'packs');
rmSync(outRoot, { recursive: true, force: true });

const manifest: PackManifest = { packs: [] };
for (const [id, def] of Object.entries(sources.packs)) {
  const rows = await rowsFor(id);
  const jsonl = toJsonLines(rows);
  const gz = gzipSync(jsonl, { level: 9 });
  const rel = `${id}/${def.version}/dict.pack`;
  const file = path.join(outRoot, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, gz);
  const mb = gz.length / 1048576;
  console.log(
    `${id.padEnd(9)} ${rows.length.toString().padStart(7)} rows  ${mb.toFixed(2)} MB gzip (budget ${BUDGET_MB[id]} MB)`,
  );
  if (mb > BUDGET_MB[id]! * 1.25)
    throw new Error(`${id} exceeds its size budget by more than 25 %`);
  const info: PackInfo = {
    id,
    lang: def.lang as PackInfo['lang'],
    version: def.version,
    bytes: gz.length,
    unpackedBytes: Buffer.byteLength(jsonl),
    rows: rows.length,
    files: [
      {
        path: rel,
        bytes: gz.length,
        sha256: createHash('sha256').update(gz).digest('hex'),
        role: 'dictionary',
      },
    ],
    sources: def.sources.map((sid) => {
      const s = sources.sources[sid as SourceId];
      return {
        name: s.name,
        licence: s.licence,
        url: s.url,
        version: s.version,
        attribution: s.attribution,
      };
    }),
  };
  manifest.packs.push(info);
}
writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${path.relative(root, path.join(outRoot, 'manifest.json'))}`);
