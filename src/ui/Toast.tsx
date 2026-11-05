import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import s from './ui.module.css';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Called when the toast times out without its action being used (e.g. finalise a soft delete). */
  onExpire?: () => void;
  /** ms before auto-dismiss; defaults to 4000, or 8000 when there is an action (e.g. Undo). */
  duration?: number;
}
interface ToastItem extends ToastOptions {
  id: number;
}
interface ToastApi {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((l) => [...l.slice(-(MAX_VISIBLE - 1)), { ...options, id }]);
    return id;
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext value={api}>
      {children}
      <div className={s['toasts']} role="status" aria-live="polite">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

/** Auto-dismisses; the timer pauses while hovered or focused (DESIGN_SYSTEM §6.7). */
function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [paused, setPaused] = useState(false);
  const duration = item.duration ?? (item.actionLabel ? 8000 : 4000);
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => {
      item.onExpire?.();
      onDone();
    }, duration);
    return () => window.clearTimeout(t);
  }, [paused, duration, onDone, item]);
  return (
    <div
      className={s['toast']}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span>{item.message}</span>
      {item.actionLabel ? (
        <button
          type="button"
          className={s['toastAction']}
          onClick={() => {
            item.onAction?.();
            onDone();
          }}
        >
          {item.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
