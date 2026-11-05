// Run after `npm run packs && npm run build`. Measures the real production pack and worker.
import { readFileSync, readdirSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import { preview } from 'vite';

const outDir = process.argv[2] ?? 'dist';
const trials = Number(process.argv[3] ?? '3');
const lines = JSON.parse(readFileSync('fixtures/linguistic/ja/lines.json', 'utf8'))
  .filter((f) => !f.expectEngineMiss && !f.pasted)
  .slice(0, 60)
  .map(({ id, text }) => ({ key: id, text }));
const workerPath = `/assets/${readdirSync(`${outDir}/assets`).find((f) => /^worker-.*\.js$/.test(f))}`;
const server = await preview({
  configFile: false,
  build: { outDir },
  preview: { host: '127.0.0.1', port: 0 },
});
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;

async function chromiumHeap(browser, url) {
  const protocol = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = await protocol.send('Target.getTargets');
    const targetId = targetInfos.find(
      (target) => target.type === 'worker' && target.url === url,
    )?.targetId;
    if (!targetId) return null;
    const { sessionId } = await protocol.send('Target.attachToTarget', {
      targetId,
      flatten: false,
    });
    let receive;
    const reply = new Promise((resolve) => {
      receive = resolve;
    });
    protocol.on('Target.receivedMessageFromTarget', (event) => {
      const msg = JSON.parse(event.message);
      if (event.sessionId === sessionId && msg.id === 1) receive(msg.result ?? null);
    });
    await protocol.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id: 1, method: 'Runtime.getHeapUsage' }),
    });
    const timeout = setTimeout(() => receive(null), 2_000);
    const heap = await reply;
    clearTimeout(timeout);
    return heap;
  } catch (e) {
    return { unavailable: e.message };
  } finally {
    await protocol.detach();
  }
}

try {
  for (const type of [chromium, webkit]) {
    const browser = await type.launch();
    try {
      for (let i = 0; i < trials; i++) {
        const page = await browser.newPage();
        try {
          await page.goto(`${origin}/settings`);
          const row = page.getByRole('listitem').filter({ hasText: 'Japanese' });
          const download = row.getByRole('button', { name: /Download ·/ });
          await download.waitFor();
          const start = performance.now();
          await download.click();
          const installed = row.getByRole('button', { name: 'Remove' });
          const error = row.getByRole('alert');
          await installed.or(error).first().waitFor({ timeout: 60_000 });
          if (await error.isVisible()) throw new Error(await error.innerText());
          const installMs = Math.round(performance.now() - start);
          await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
          await page.reload();
          await page.waitForFunction(() => !!navigator.serviceWorker.controller);
          await page.context().setOffline(true);
          if (type === chromium) {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          }
          const workerReady = page.waitForEvent('worker');
          const result = await page.evaluate(
            async ({ workerPath, lines }) => {
              const worker = new Worker(workerPath, { type: 'module' });
              globalThis.benchmarkWorker = worker;
              // Same Comlink APPLY messages as EngineClient, with explicit timing around each call.
              function analyse(lines) {
                return new Promise((resolve, reject) => {
                  worker.onerror = (e) => reject(new Error(e.message));
                  worker.onmessage = (e) => {
                    if (
                      e.data.type !== 'RAW' ||
                      e.data.value.some(
                        (a) => a.status === 'failed' || !a.tokens.some((t) => t.reading),
                      )
                    )
                      reject(new Error('Japanese analysis returned no reading'));
                    else resolve();
                  };
                  worker.postMessage({
                    id: 'benchmark',
                    type: 'APPLY',
                    path: ['analyse'],
                    argumentList: [{ type: 'RAW', value: { lang: 'ja', lines } }],
                  });
                });
              }
              const cold = performance.now();
              await analyse(lines.slice(0, 1));
              const warm = performance.now();
              for (let offset = 0; offset < lines.length; offset += 20)
                await analyse(lines.slice(offset, offset + 20));
              return {
                coldMs: Math.round(warm - cold),
                warm60Ms: Math.round(performance.now() - warm),
              };
            },
            { workerPath, lines },
          );
          const worker = await workerReady;
          const phases = await worker.evaluate(() =>
            performance.getEntriesByType('measure').map((p) => ({
              name: p.name,
              ms: Math.round(p.duration),
              wasmBytes: p.detail?.wasmBytes,
            })),
          );
          const heap = type === chromium ? await chromiumHeap(browser, origin + workerPath) : null;
          console.log(
            JSON.stringify({
              engine: type.name(),
              version: browser.version(),
              trial: i + 1,
              installMs,
              ...result,
              phases,
              heap,
            }),
          );
          await page.evaluate(() => globalThis.benchmarkWorker.terminate());
        } finally {
          await page.context().close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
