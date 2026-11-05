import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { PackFile, PackInfo, PackManifest } from '../../src/engine/dict/types';
import { fetchSource, root, sources } from './fetch-sources';
import type { SourceId } from './fetch-sources';
import { parseCanto, parseCedict, toJsonLines } from './parse';
import { unzip } from './zip';
import { parseJMdict } from './jmdict';

/** Compressed size budgets (LANGUAGE_ENGINE §9) — the build fails if exceeded by more than 25 %. */
const BUDGET_MB: Record<string, number> = { 'zh-core': 6, 'yue-core': 4, 'ja-core': 25 };
const require = createRequire(import.meta.url);

async function text(id: SourceId, entry: RegExp): Promise<string> {
  const files = unzip(await fetchSource(id));
  const name = [...files.keys()].find((n) => entry.test(n));
  if (!name) throw new Error(`${id}: no file matching ${entry} in the archive`);
  return files.get(name)!.toString('utf8');
}

async function rowsFor(pack: string) {
  if (pack === 'zh-core') return parseCedict(await text('cedict', /cedict_ts\.u8$/));
  if (pack === 'ja-core') return parseJMdict(await text('jmdict', /jmdict-eng.*\.json$/));
  const canto = parseCanto(await text('cccanto', /cccanto-webdist\.txt$/), true);
  const readings = parseCanto(await text('cccanto-readings', /\.txt$/), false, 1_000_000);
  return [...canto, ...readings];
}

const outRoot = path.join(root, 'public', 'packs');

function packFile(rel: string, data: Buffer, role: PackFile['role']): PackFile {
  const file = path.join(outRoot, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  return {
    path: rel,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    role,
  };
}

const manifest: PackManifest = { packs: [] };
for (const [id, def] of Object.entries(sources.packs)) {
  const rows = await rowsFor(id);
  const jsonl = toJsonLines(rows);
  const gz = gzipSync(jsonl, { level: 9 });
  const prefix = `${id}/${def.version}`;
  const files = [packFile(`${prefix}/dict.pack`, gz, 'dictionary')];
  let unpackedBytes = Buffer.byteLength(jsonl);
  if (id === 'ja-core') {
    const wasm = readFileSync(require.resolve('lindera-wasm-web-ipadic/lindera_wasm_bg.wasm'));
    // An opaque extension avoids server-side Content-Encoding on the checksummed gzip bytes.
    files.unshift(packFile(`${prefix}/ipadic.pack`, gzipSync(wasm, { level: 9 }), 'tokenizer'));
    unpackedBytes += wasm.length;
  }
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const mb = bytes / 1048576;
  console.log(
    `${id.padEnd(9)} ${rows.length.toString().padStart(7)} rows  ${mb.toFixed(2)} MB gzip (budget ${BUDGET_MB[id]} MB)`,
  );
  if (mb > BUDGET_MB[id]! * 1.25)
    throw new Error(`${id} exceeds its size budget by more than 25 %`);
  const info: PackInfo = {
    id,
    lang: def.lang as PackInfo['lang'],
    version: def.version,
    bytes,
    unpackedBytes,
    rows: rows.length,
    files,
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
  if (id === 'ja-core') {
    const licence = readFileSync(require.resolve('lindera-wasm-web-ipadic/LICENSE'), 'utf8');
    writeFileSync(path.join(outRoot, prefix, 'LINDERA-LICENSE.txt'), licence);
    info.sources.push({
      name: 'Lindera WASM / IPADIC',
      version: '2.0.0',
      licence: 'MIT (Lindera) and IPADIC terms',
      url: 'https://github.com/lindera/lindera',
      attribution: `Lindera project authors and the IPADIC authors. See ${prefix}/LINDERA-LICENSE.txt and licenses/IPADIC-COPYING.txt.`,
    });
  }
  manifest.packs.push(info);
}
writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${path.relative(root, path.join(outRoot, 'manifest.json'))}`);
