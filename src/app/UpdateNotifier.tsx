import { useEffect, useRef } from 'react';
import { useToast } from '@/ui';
import { applyUpdate, useUpdateReady } from './updates';

/** Announces "A new version is ready" once, and never while a sheet (Add song, Edit lyrics, …) is open. */
export function UpdateNotifier() {
  const ready = useUpdateReady();
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (!ready || shown.current) return;
    const tryShow = (): boolean => {
      if (document.querySelector('dialog[open]')) return false; // the user may be editing: wait
      shown.current = true;
      toast.show({
        message: 'A new version is ready',
        actionLabel: 'Reload',
        onAction: applyUpdate,
        duration: 600_000,
      });
      return true;
    };
    if (tryShow()) return;
    const timer = window.setInterval(() => {
      if (tryShow()) window.clearInterval(timer);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [ready, toast]);
  return null;
}
