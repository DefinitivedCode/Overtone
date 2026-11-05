import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import s from './TopBar.module.css';

export interface TopBarProps {
  /** Visible back control (installed iOS apps have no browser back button). */
  back?: { to: string; label: string };
  title?: string;
  trailing?: ReactNode;
}

export function TopBar({ back, title, trailing }: TopBarProps) {
  return (
    <header className={s['bar']}>
      <div className={`screen ${s['inner']}`}>
        <div className={s['lead']}>
          {back ? (
            <Link to={back.to} className={s['back']}>
              <ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />
              {back.label}
            </Link>
          ) : null}
        </div>
        {title ? <div className={s['title']}>{title}</div> : null}
        <div className={s['trail']}>{trailing}</div>
      </div>
    </header>
  );
}
