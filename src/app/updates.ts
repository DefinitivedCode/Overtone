import { useSyncExternalStore } from 'react';

/**
 * App updates (ARCHITECTURE §9, J12.7): a new service worker waits until the user chooses to reload, so an update
 * never replaces the page while they are editing. Checks run at start and when the app becomes visible, at most once
 * an hour.
 */
let waiting: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
let lastCheck = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const setWaiting = (worker: ServiceWorker) => {
  waiting = worker;
  emit();
};

function track(reg: ServiceWorkerRegistration): void {
  registration = reg;
  // An update that finished installing in an earlier session is already waiting.
  if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      // `controller` is null on the very first install, which is not an update.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
    });
  });
}

export function checkForUpdates(now = Date.now()): void {
  if (!registration || now - lastCheck < CHECK_INTERVAL_MS) return;
  lastCheck = now;
  registration.update().catch(() => undefined); // offline or the host is down: try again later
}

/** Registers the service worker (production only) and starts watching for updates. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () =>
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        track(reg);
        lastCheck = Date.now();
      })
      .catch((e: unknown) => console.warn('Service worker registration failed', e));
  // 'load' may already have fired by the time this module runs.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
}

/** Activates the waiting worker and reloads once it takes control. Only called from a user action. */
export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
    once: true,
  });
  waiting.postMessage('skip-waiting');
}

export const useUpdateReady = (): boolean =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => waiting !== null,
  );

/** Test seam. */
export function __setWaitingForTests(worker: ServiceWorker | null): void {
  waiting = worker;
  emit();
}
