import { ENGINE_VERSION, SETTINGS_HASH } from './version';
import type { LangCode } from './model';

/** Fast, synchronous 53-bit string hash (cyrb53). Cache keys only need to differ when the text differs. */
export function hashText(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * `${lang}|${engineVersion}|${settingsHash}|${lineKey}|${hash(text)}` (ARCHITECTURE §3.2). The text hash
 * (not only the content key) is included because the key ignores case/punctuation but analysis does not.
 */
export function analysisCacheKey(
  lang: LangCode,
  lineKey: string,
  text: string,
  packVersion: string | null = null,
): string {
  // The installed language-pack version is part of the key: results made without data (or with an older
  // pack) are ignored once a pack is installed or updated, so lines are re-analysed.
  return `${lang}|${ENGINE_VERSION[lang]}|${SETTINGS_HASH}|${packVersion ?? 'none'}|${lineKey}|${hashText(text)}`;
}
