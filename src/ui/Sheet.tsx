import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Button } from './simple';
import s from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  detent?: 'half' | 'full';
  /** Control shown at the leading edge of the header (e.g. Cancel). Defaults to nothing. */
  leading?: ReactNode;
  /** Control shown at the trailing edge (e.g. Save, or a close button). */
  trailing?: ReactNode;
  children: ReactNode;
}

const EXIT_MS = 320;

// Safari does not focus a button when it is clicked, so `document.activeElement` would be <body>
// when a sheet opens. Remember the last pressed control to return focus to it on close.
let lastPressed: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPressed =
        (e.target as Element | null)?.closest<HTMLElement>('button, a, [tabindex]') ?? null;
    },
    true,
  );
}

/**
 * Modal bottom sheet built on <dialog>: focus trap, Escape and inert background come from the
 * platform. Adds a history entry (hardware back closes it), scroll lock, and drag-to-dismiss from
 * the header (DESIGN_SYSTEM §6.7/§7/§9.4, ARCHITECTURE §6.5).
 */
export function Sheet({
  open,
  onClose,
  title,
  detent = 'full',
  leading,
  trailing,
  children,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const pushed = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Mount as soon as we are asked to open (adjusting state while rendering is the supported pattern).
  if (open && !mounted) setMounted(true);

  // Unmount after the exit transition.
  useEffect(() => {
    if (open || !mounted) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(
      () => {
        // Close the native dialog (releases the inert background) and return focus to the opener.
        dialogRef.current?.close();
        opener.current?.focus();
        setMounted(false);
        setShown(false);
      },
      reduced ? 0 : EXIT_MS,
    );
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  // Present the dialog once mounted and open.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!mounted || !open || !dlg) return;
    if (!dlg.open) {
      const active = document.activeElement;
      opener.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : lastPressed?.isConnected
            ? lastPressed
            : null;
      dlg.showModal();
    }
    document.documentElement.dataset['scrollLocked'] = 'true';
    const raf = requestAnimationFrame(() => {
      setShown(true);
      titleRef.current?.focus();
    });
    history.pushState({ ...(history.state as object | null), overtoneSheet: true }, '');
    pushed.current = true;
    const onPop = () => {
      if (pushed.current) {
        pushed.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('popstate', onPop);
      delete document.documentElement.dataset['scrollLocked'];
      if (pushed.current) {
        pushed.current = false;
        // Pop our own entry only if it is still current; if the app has navigated on (e.g. Save →
        // Song screen), going back would undo that navigation.
        if ((history.state as { overtoneSheet?: boolean } | null)?.overtoneSheet) history.back();
      }
    };
  }, [mounted, open]);

  // Close the native dialog after the exit animation ends.
  useEffect(() => {
    if (!mounted && dialogRef.current?.open) dialogRef.current.close();
  }, [mounted]);

  // Drag to dismiss.
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);
  const onDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startT: e.timeStamp, dy: 0 };
    panelRef.current?.setAttribute('data-dragging', 'true');
  }, []);
  const onMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    panelRef.current?.style.setProperty('--drag', `${d.dy}px`);
  }, []);
  const onUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const panel = panelRef.current;
    if (!d || !panel) return;
    panel.removeAttribute('data-dragging');
    const velocity = d.dy / Math.max(1, e.timeStamp - d.startT);
    panel.style.removeProperty('--drag');
    if (d.dy > panel.offsetHeight * 0.3 || velocity > 0.5) onCloseRef.current();
  }, []);

  if (!mounted) return null;
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- backdrop click is a pointer shortcut; Escape and the visible close control are the keyboard paths
    <dialog
      ref={dialogRef}
      className={s['dialog']}
      data-state={open && shown ? 'open' : 'closed'}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className={`${s['panel']} ${s[detent]}`}>
        <div
          className={s['header']}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className={s['grabber']} aria-hidden="true" />
          <div className={s['lead']}>{leading}</div>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className={s['title']}>
            {title}
          </h2>
          <div className={s['trail']}>{trailing}</div>
        </div>
        <div className={s['body']}>{children}</div>
      </div>
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centred native <dialog> for destructive confirmations. Focus starts on Cancel. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      cancelRef.current?.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s['confirm']}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className={s['confirmTitle']}>
        {title}
      </h2>
      <p className={s['confirmMessage']}>{message}</p>
      <div className={s['confirmActions']}>
        <Button variant={destructive ? 'destructiveFilled' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </dialog>
  );
}
