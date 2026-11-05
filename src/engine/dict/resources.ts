import { PACK_CACHE } from './types';

/** Verified tokenizer resources are private to one installation attempt. */
export async function storeTokenizer(url: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const cache = await caches.open(PACK_CACHE);
  await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/gzip' } }));
}

export async function readTokenizer(url: string): Promise<Response> {
  const cached = await caches.match(url, { cacheName: PACK_CACHE });
  if (!cached?.body)
    throw new Error(
      'The installed Japanese tokenizer is missing. Reinstall Japanese language data.',
    );
  return new Response(cached.body.pipeThrough(new DecompressionStream('gzip')), {
    headers: { 'Content-Type': 'application/wasm' },
  });
}

/** Derived downloads can be evicted even if Cache Storage is unavailable. */
export async function evictPackFiles(urls: string[]): Promise<void> {
  if (!urls.length) return;
  try {
    const cache = await globalThis.caches?.open(PACK_CACHE);
    if (cache) await Promise.all(urls.map((url) => cache.delete(url, { ignoreVary: true })));
  } catch {
    // IndexedDB state remains authoritative.
  }
}
