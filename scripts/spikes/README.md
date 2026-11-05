# M4 spike harnesses

These scripts produced the numbers in `docs/adr/0002`–`0007`. They are not part of the build or tests.

## Setup (untracked folders)

```bash
mkdir -p .cache/spikes && cd .cache/spikes && npm init -y
npm install kuromoji lindera-wasm-ipadic lindera-wasm-nodejs-ipadic lindera-wasm-web-ipadic lindera-wasm-nodejs-ko-dic \
  hangul-util korean-pronunciation aromanize @romanize/korean hangul-romanization pinyin-pro opencc-js to-jyutping wanakana
mkdir -p web && cp node_modules/lindera-wasm-web-ipadic/lindera_wasm.js node_modules/lindera-wasm-web-ipadic/lindera_wasm_bg.wasm web/
# plus web/worker.js and web/index.html as described in scripts/spikes/japanese-browser.mjs
```

Dictionary sources go in `.cache/dicts/` (see ADR 0006 for URLs and SHA-256).

## Run

| Script                                | ADR  | Notes                                                                                                                                                             |
| ------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `korean-romanisers.mjs [--misses]`    | 0003 | needs `scripts/spikes/.own-ko*.mjs`, a transpiled copy of `src/engine/ko/*` (generated with `typescript.transpileModule`; gitignored)                            |
| `japanese-tokenizers.mjs [--misses]`  | 0002 | Node                                                                                                                                                              |
| `japanese-browser.mjs`                | 0002 | WebKit + Chromium module worker; needs `.cache/spikes/web/{index.html,worker.js,lindera_wasm*}`                                                                   |
| `chinese.mjs`                         | 0004, 0005 | reads `fixtures/linguistic/{zh,yue}/starter.json`                                                                                                           |
| `dict-sizes.mjs`                      | 0006 | needs the extracted files in `.cache/dicts`                                                                                                                       |
| `ruby/run.mjs`                        | 0007 | writes screenshots to `docs/adr/assets/`                                                                                                                          |

Numbers depend on the machine (Windows 11, Node 22, Playwright WebKit 27.2); rerun to compare.
