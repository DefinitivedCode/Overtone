import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { TopBar } from '@/app/TopBar';
import { useLines, useSong } from '@/db/hooks';
import { resetProgress } from '@/db/repositories/progress';
import { touchOpened } from '@/db/repositories/songs';
import { langAttr } from '@/engine/segment/detect';
import { LANG_CODE, LANG_NAME } from '@/features/language';
import {
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  Skeleton,
  useToast,
} from '@/ui';
import type { MenuItem } from '@/ui';
import { EditDetailsSheet } from './EditDetailsSheet';
import { EditLyricsSheet } from './EditLyricsSheet';
import s from './SongScreen.module.css';
import { useDeleteSong } from './useDeleteSong';

export function SongScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const song = useSong(id);
  const lines = useLines(id);
  const [sheet, setSheet] = useState<'details' | 'lyrics' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const { requestDelete, dialog } = useDeleteSong(() => navigate('/', { replace: true }));

  const songId = song?.id;
  useEffect(() => {
    if (songId) void touchOpened(songId).catch(() => undefined);
  }, [songId]);

  const back = { to: '/', label: 'Library' };

  if (song === undefined || lines === undefined)
    return (
      <>
        <TopBar back={back} />
        <main className="screen" aria-busy="true">
          <Skeleton height={36} width="60%" />
        </main>
      </>
    );
  if (song === null)
    return (
      <>
        <TopBar back={back} />
        <main className="screen">
          <EmptyState
            title="Song not found"
            action={
              <Link to="/">
                <Button variant="secondary">Back to Library</Button>
              </Link>
            }
          >
            It may have been deleted.
          </EmptyState>
        </main>
      </>
    );

  const lang = langAttr(song.language, song.rawLyrics);
  const items: MenuItem[] = [
    { key: 'lyrics', label: 'Edit lyrics', onSelect: () => setSheet('lyrics') },
    { key: 'details', label: 'Edit details', onSelect: () => setSheet('details') },
    ...(song.learnedCount > 0
      ? [{ key: 'reset', label: 'Reset progress', onSelect: () => setConfirmReset(true) }]
      : []),
    { key: 'delete', label: 'Delete song', destructive: true, onSelect: () => requestDelete(song) },
  ];

  return (
    <>
      <TopBar
        back={back}
        trailing={
          <Menu
            renderTrigger={(p) => (
              <IconButton {...p} label="Song options">
                <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            )}
            items={items}
          />
        }
      />
      <main className="screen">
        <header className={s['header']}>
          <h1 className="title" lang={langAttr(song.language, song.title)}>
            {song.title}
          </h1>
          {song.artist ? (
            <p className="subhead" lang={langAttr(song.language, song.artist)}>
              {song.artist}
            </p>
          ) : null}
          <p className={s['meta']}>
            <Chip ariaLabel={LANG_NAME[song.language]}>{LANG_CODE[song.language]}</Chip>
            <span>
              {song.lineCount} {song.lineCount === 1 ? 'line' : 'lines'}
            </span>
            {song.source.kind === 'lrclib' ? <span>· Lyrics from LRCLIB</span> : null}
          </p>
        </header>

        <article className={s['lyrics']} lang={lang} aria-label="Lyrics">
          {lines.map((line) => {
            const kind = line.kindOverride ?? line.kind;
            if (kind === 'blank')
              return <div key={line.id} className={s['gap']} aria-hidden="true" />;
            if (kind === 'section')
              return (
                <p key={line.id} className={s['section']}>
                  {line.text}
                </p>
              );
            return (
              <p key={line.id} className={s['line']}>
                {line.text}
              </p>
            );
          })}
        </article>
      </main>

      <EditDetailsSheet song={sheet === 'details' ? song : null} onClose={() => setSheet(null)} />
      <EditLyricsSheet song={sheet === 'lyrics' ? song : null} onClose={() => setSheet(null)} />
      <ConfirmDialog
        open={confirmReset}
        title="Reset progress?"
        message="All lines in this song will be marked as not learned."
        confirmLabel="Reset progress"
        destructive
        onConfirm={() => {
          setConfirmReset(false);
          void resetProgress(song.id).then(() => toast.show({ message: 'Progress reset' }));
        }}
        onCancel={() => setConfirmReset(false)}
      />
      {dialog}
    </>
  );
}
