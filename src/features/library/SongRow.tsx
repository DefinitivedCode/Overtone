import { useRef } from 'react';
import type { Ref } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { progressFraction } from '@/db/repositories/progress';
import type { Song } from '@/db/types';
import { langAttr } from '@/engine/segment/detect';
import { LANG_CODE, LANG_NAME } from '@/features/language';
import { Chip, IconButton, Menu, ProgressBar } from '@/ui';
import s from './SongRow.module.css';

const LONG_PRESS_MS = 500;

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

export interface SongRowProps {
  song: Song;
  onEditDetails: (song: Song) => void;
  onDelete: (song: Song) => void;
  onOpen: (song: Song) => void;
}

export function SongRow({ song, onEditDetails, onDelete, onOpen }: SongRowProps) {
  const more = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const fraction = progressFraction(song);
  const learned = song.lineCount > 0 && song.learnedCount >= song.lineCount;
  const lines = `${song.lineCount} ${song.lineCount === 1 ? 'line' : 'lines'}`;

  const cancel = () => window.clearTimeout(timer.current);
  const openMenu = () => {
    longPressed.current = true;
    more.current?.click();
  };

  return (
    <li className={s['row']}>
      <Link
        to={`/song/${song.id}`}
        viewTransition
        className={s['link']}
        onPointerDown={() => {
          longPressed.current = false;
          cancel();
          timer.current = window.setTimeout(openMenu, LONG_PRESS_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          e.preventDefault();
          cancel();
          openMenu();
        }}
        onClick={(e) => {
          if (longPressed.current) {
            e.preventDefault();
            longPressed.current = false;
            return;
          }
        }}
      >
        <span className={s['main']}>
          <span className={s['title']} lang={langAttr(song.language, song.title)}>
            {song.title}
          </span>
          <span className={s['meta']}>
            {song.artist ? (
              <span lang={langAttr(song.language, song.artist)}>{song.artist}</span>
            ) : null}
            {song.artist ? ' · ' : ''}
            {lines}
            {learned ? <span className={s['badge']}> · Learned ✓</span> : null}
          </span>
          {song.lineCount > 0 ? (
            <ProgressBar
              value={fraction}
              label={`${song.learnedCount} of ${song.lineCount} lines learned`}
            />
          ) : null}
        </span>
        <Chip ariaLabel={LANG_NAME[song.language]}>{LANG_CODE[song.language]}</Chip>
      </Link>
      <Menu
        renderTrigger={(p) => (
          <IconButton
            {...p}
            label={`More options for ${song.title}`}
            ref={(el) => {
              more.current = el;
              assignRef(p.ref, el);
            }}
          >
            <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        )}
        items={[
          { key: 'open', label: 'Open', onSelect: () => onOpen(song) },
          { key: 'edit', label: 'Edit details', onSelect: () => onEditDetails(song) },
          { key: 'delete', label: 'Delete', destructive: true, onSelect: () => onDelete(song) },
        ]}
      />
    </li>
  );
}
