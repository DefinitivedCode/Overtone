import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import s from './TopBar.module.css';

export interface TopBarProps {
  /** Visible back control (installed iOS apps have no browser back button). */
  back?: { to: string; label: string };
  title?: string;
  /** The compact title fades in when the screen's large title has scrolled away. */
  titleVisible?: boolean;
  trailing?: ReactNode;
}

export function TopBar({ back, title, titleVisible = false, trailing }: TopBarProps) {
  return (
    <header className={s['bar']}>
      <div className={`screen ${s['inner']}`}>
        <div className={s['lead']}>
          {back ? (
            <Link to={back.to} className={s['back']} viewTransition>
              <ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />
              {back.label}
            </Link>
          ) : null}
        </div>
        {title ? (
          // The heading below already names the screen, so this copy is hidden from assistive technology.
          <div className={s['title']} aria-hidden="true" data-visible={titleVisible}>
            {title}
          </div>
        ) : null}
        <div className={s['trail']}>{trailing}</div>
      </div>
    </header>
  );
}
