let unloading = false;
if (typeof window !== 'undefined') {
  // In-flight storage requests are aborted when the page goes away; those errors are not worth reporting.
  window.addEventListener('pagehide', () => (unloading = true));
  window.addEventListener('beforeunload', () => (unloading = true));
}
export const isUnloading = (): boolean => unloading;
