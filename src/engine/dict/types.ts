/** Dictionary pack row (LANGUAGE_ENGINE §9): one row per form → entry mapping. */
export interface PackRow {
  /** Form (headword): traditional or simplified for Chinese. */
  f: string;
  /** Entry id (stable within the pack). */
  e: number;
  /** Reading: tone-numbered pinyin (zh) or jyutping (yue), lower case, ü as ü. */
  r: string;
  /** Senses, each with up to 3 glosses ≤ 80 chars. Empty for reading-only rows. */
  s: { g: string[] }[];
  /** 1 = ordinary entry, 0 = proper noun (ranked after common entries). */
  q: number;
}

/** Row as stored in the dictionary database. */
export interface DictRow extends PackRow {
  lang: 'zh' | 'yue' | 'ja' | 'ko';
  packVersion: string;
}

/** Pack 256 BMP initials per block, with wider blocks for sparse supplementary characters. */
export function dictionaryBlock(codePoint: number): number {
  return codePoint < 0x10000 ? codePoint >>> 8 : 0x100 + (codePoint >>> 12);
}

export interface PackFile {
  path: string;
  bytes: number;
  sha256: string;
  role: 'dictionary';
}

export interface PackSource {
  name: string;
  licence: string;
  url: string;
  version: string;
  attribution: string;
}

export interface PackInfo {
  id: string;
  lang: 'zh' | 'yue' | 'ja' | 'ko';
  version: string;
  /** Compressed download size in bytes. */
  bytes: number;
  /** Uncompressed JSONL size, used as a proxy for dictionary storage. */
  unpackedBytes?: number;
  rows: number;
  files: PackFile[];
  sources: PackSource[];
}

export interface PackManifest {
  packs: PackInfo[];
}

export const PACK_CACHE = 'overtone-packs-v1';
