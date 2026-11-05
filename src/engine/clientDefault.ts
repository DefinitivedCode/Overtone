import { wrap } from 'comlink';
import { EngineClient } from './client';
import type { WorkerHandle } from './client';
import type { EngineApi } from './worker';

/** Real module-worker factory. Kept out of client.ts so the client stays testable in Node/jsdom. */
function createModuleWorker(): WorkerHandle {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const remote = wrap<EngineApi>(worker);
  let failure: Error | undefined;
  let rejectPending: ((reason: Error) => void) | undefined;
  const fail = (error: Error) => {
    failure = error;
    rejectPending?.(error);
  };
  worker.addEventListener('error', (event) =>
    fail(new Error(event.message || 'Language worker failed')),
  );
  worker.addEventListener('messageerror', () =>
    fail(new Error('Could not read language worker response')),
  );
  return {
    analyse: async (req) => {
      if (failure) throw failure;
      try {
        return await new Promise((resolve, reject) => {
          rejectPending = reject;
          void remote.analyse(req).then(resolve, reject);
        });
      } finally {
        rejectPending = undefined;
      }
    },
    terminate: () => {
      fail(new DOMException('Language worker released', 'AbortError'));
      worker.terminate();
    },
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
