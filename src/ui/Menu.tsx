import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import s from './ui.module.css';

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** Renders as a radio-style choice with a check mark when true. */
  checked?: boolean;
  onSelect: () => void;
}

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
}

export interface MenuProps {
  renderTrigger: (props: MenuTriggerProps) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}

/** Anchored popover menu: arrow keys, Home/End, Escape (returns focus), outside click, 44 px items. */
export function Menu({ renderTrigger, items, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Collision handling: keep the whole menu inside the visual viewport (with a margin that respects the
  // safe-area insets, see `scroll-padding` in .menu) and flip above the trigger when there is no room below.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const wrap = wrapRef.current;
    if (!open || !menu || !wrap) return;
    const place = () => {
      menu.style.removeProperty('--menu-shift');
      menu.removeAttribute('data-flip');
      const vv = window.visualViewport;
      const vw = document.documentElement.clientWidth;
      const vh = vv?.height ?? window.innerHeight;
      const cs = getComputedStyle(menu);
      const padL = parseFloat(cs.scrollPaddingLeft) || 8;
      const padR = parseFloat(cs.scrollPaddingRight) || 8;
      const r = menu.getBoundingClientRect();
      let shift = 0;
      if (r.left < padL) shift = padL - r.left;
      else if (r.right > vw - padR) shift = vw - padR - r.right;
      // A menu wider than the available space is narrowed by max-width; shifting then only fixes the start edge.
      if (shift !== 0) menu.style.setProperty('--menu-shift', `${shift}px`);
      const trigger = wrap.getBoundingClientRect();
      const room = { below: vh - trigger.bottom, above: trigger.top };
      if (r.height + 8 > room.below && room.above > room.below)
        menu.setAttribute('data-flip', 'true');
    };
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (n: number) => buttons[(n + buttons.length) % buttons.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        focus(0);
        break;
      case 'End':
        e.preventDefault();
        focus(buttons.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={wrapRef} className={s['menuWrap']}>
      {renderTrigger({
        ref: triggerRef,
        onClick: () => setOpen((o) => !o),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
      })}
      {open ? (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          tabIndex={-1}
          className={`${s['menu']} ${align === 'end' ? s['menuEnd'] : s['menuStart']}`}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
              {...(item.checked !== undefined ? { 'aria-checked': item.checked } : {})}
              className={`${s['menuItem']} ${item.destructive ? s['menuItemDanger'] : ''}`}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
