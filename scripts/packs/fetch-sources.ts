import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sources from './sources.json' with { type: 'json' };

export const root = path.resolve(import.meta.dirname, '..', '..');
export const cacheDir = path.join(root, '.cache', 'dicts');

export type SourceId = keyof typeof sources.sources;
export type Source = (typeof sources.sources)[SourceId];
export { sources };

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/**
 * Returns a verified source file, downloading it from the official URL into `.cache/dicts` when absent.
 * A SHA-256 mismatch is an error: the upstream file changed, so the pin and pack version must be updated on purpose.
 */
export async function fetchSource(id: SourceId): Promise<Buffer> {
  const s = sources.sources[id];
  const file = path.join(cacheDir, s.file);
  mkdirSync(cacheDir, { recursive: true });
  const cached = existsSync(file);
  let buf: Buffer;
  if (cached) buf = readFileSync(file);
  else {
    console.log(`downloading ${s.url}`);
    const res = await fetch(s.url);
    if (!res.ok) throw new Error(`Download of ${s.name} failed: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const got = sha256(buf);
  if (got !== s.sha256)
    throw new Error(
      `${s.name}: checksum mismatch (expected ${s.sha256}, got ${got}). The upstream file changed; refresh scripts/packs/sources.json deliberately and bump the pack version.`,
    );
  if (!cached) writeFileSync(file, buf);
  return buf;
}
