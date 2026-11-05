import { wrap } from 'comlink';
import { EngineClient } from './client';
import type { WorkerHandle } from './client';
import type { EngineApi } from './worker';

/** Real module-worker factory. Kept out of client.ts so the client stays testable in Node/jsdom. */
function createModuleWorker(): WorkerHandle {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const remote = wrap<EngineApi>(worker);
  return {
    analyse: (req) => remote.analyse(req),
    terminate: () => worker.terminate(),
  };
}

let shared: EngineClient | null = null;

/** The app-wide engine client; terminates its worker when idle or when the page is hidden for a while. */
export function getEngineClient(): EngineClient {
  if (!shared) {
    shared = new EngineClient({ createWorker: createModuleWorker });
    if (typeof document !== 'undefined') {
      let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
      document.addEventListener('visibilitychange', () => {
        clearTimeout(hiddenTimer);
        if (document.visibilityState === 'hidden')
          hiddenTimer = setTimeout(() => shared?.terminate(), 30_000);
      });
    }
  }
  return shared;
}
