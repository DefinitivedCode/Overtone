import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { TopBar } from '@/app/TopBar';
import { EmptyState } from '@/ui';
import s from './LibraryScreen.module.css';

export function LibraryScreen() {
  return (
    <>
      <TopBar
        trailing={
          <Link to="/settings" aria-label="Settings" className={s['iconLink']}>
            <Settings size={22} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        }
      />
      <main className="screen">
        <h1 className="large-title">Library</h1>
        <EmptyState title="Your songbook is empty">
          Paste the lyrics of a song you love and Overtone will help you read, understand and sing
          it.
        </EmptyState>
      </main>
    </>
  );
}
