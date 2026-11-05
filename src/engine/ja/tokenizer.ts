import glueUrl from 'lindera-wasm-web-ipadic/lindera_wasm.js?url';
import type * as Lindera from 'lindera-wasm-web-ipadic';
import { getDictDb, packMetaKey } from '../dict/db';
import { readTokenizer } from '../dict/resources';

export interface JapaneseMorph {
  surface: string;
  reading?: string;
  pronunciation?: string;
  baseForm?: string;
  partOfSpeech?: string;
  partOfSpeechSubcategory1?: string;
  /** The pinned binding exposes the IPADIC inflection form under this field. */
  conjugationType?: string;
}

export interface JapaneseTokenizer {
  tokenize(text: string): JapaneseMorph[];
}

export function buildTokenizer(Builder: typeof Lindera.TokenizerBuilder): JapaneseTokenizer {
  const builder = new Builder();
  builder.setDictionary('embedded://ipadic');
  builder.setMode('normal');
  return builder.build(); // wasm-bindgen consumes the builder.
}

let tokenizer: Promise<JapaneseTokenizer> | undefined;
let testTokenizer: JapaneseTokenizer | undefined;

/** Test seam for supplying the real pack WASM in Node or small tokenizer fixtures in unit tests. */
export function setJapaneseTokenizerForTests(value?: JapaneseTokenizer): void {
  testTokenizer = value;
}

export async function installedTokenizer(
  version?: string | null,
): Promise<JapaneseTokenizer | null> {
  if (version === null) return null;
  if (testTokenizer) return testTokenizer;
  const pack = (await getDictDb().meta.get(packMetaKey('ja-core')))?.value;
  if (!pack?.tokenizer || (version !== undefined && pack.version !== version)) return null;
  const resource = pack.tokenizer;
  // WASM ABI is pinned to the app build. Keep a single tokenizer in the module worker until it terminates.
  tokenizer ??= (async () => {
    const start = performance.now();
    // Import the wasm-bindgen glue as an asset so Vite never follows its default WASM URL.
    const lindera = (await import(/* @vite-ignore */ glueUrl)) as typeof Lindera;
    const wasm = await lindera.default({ module_or_path: await readTokenizer(resource) });
    const ready = performance.now();
    const adapter = buildTokenizer(lindera.TokenizerBuilder);
    performance.measure('ja: wasm load', { start, end: ready });
    performance.measure('ja: tokenizer build', {
      start: ready,
      detail: { wasmBytes: wasm.memory.buffer.byteLength },
    });
    return adapter;
  })().catch((error: unknown) => {
    tokenizer = undefined;
    throw error;
  });
  return tokenizer;
}
