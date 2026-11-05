import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { TopBar } from '@/app/TopBar';
import { useLearnedKeys, useLines, useSettings, useSong } from '@/db/hooks';
import { resetProgress } from '@/db/repositories/progress';
import { setCleanVariant, setDisplayMode, touchOpened } from '@/db/repositories/songs';
import type { DisplayMode } from '@/db/types';
import { DEFAULT_ROMAN_PREFS } from '@/engine/romanLine';
import type { RomanPrefs } from '@/engine/romanLine';
import { langAttr } from '@/engine/segment/detect';
import { LANG_CODE, LANG_NAME } from '@/features/language';
import {
  Banner,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  useToast,
} from '@/ui';
import type { MenuItem } from '@/ui';
import type { Song } from '@/db/types';
import { EditDetailsSheet } from './EditDetailsSheet';
import { EditLyricsSheet } from './EditLyricsSheet';
import { CleanView, KaraokeView, LearnView } from './LyricViews';
import { firstVisibleLineIndex, toItems } from './lyricModel';
import type { LyricItem } from './lyricModel';
import s from './SongScreen.module.css';
import { useDeleteSong } from './useDeleteSong';
import { useLineAnalyses } from './useLineAnalyses';

const MODE_OPTIONS = [
  { value: 'learn', label: 'Learn' },
  { value: 'karaoke', label: 'Karaoke' },
  { value: 'clean', label: 'Clean' },
] as const;

export function SongScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const song = useSong(id);
  const lines = useLines(id);
  const settings = useSettings();
  const learned = useLearnedKeys(id);
  const [sheet, setSheet] = useState<'details' | 'lyrics' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const { requestDelete, dialog } = useDeleteSong(() => navigate('/', { replace: true }));
  const anchor = useRef<number | null>(null);
  // Optimistic: the control reflects the click at once; the stored value catches up a moment later.
  const [optMode, setOptMode] = useState<DisplayMode | null>(null);
  const [optVariant, setOptVariant] = useState<'original' | 'romanised' | null>(null);
  if (optMode !== null && song && song.displayMode === optMode) setOptMode(null);
  if (optVariant !== null && song && song.cleanVariant === optVariant) setOptVariant(null);

  const songId = song?.id;
  useEffect(() => {
    if (songId) void touchOpened(songId).catch(() => undefined);
  }, [songId]);

  const prefs: RomanPrefs = useMemo(
    () => (settings ? { ko: { mode: settings.romanisation.ko.mode } } : DEFAULT_ROMAN_PREFS),
    [settings],
  );

  // Keep the first visible lyric line in place when the mode (and so the layout) changes.
  const modeKey = `${optMode ?? song?.displayMode}|${optVariant ?? song?.cleanVariant}`;
  useLayoutEffect(() => {
    if (anchor.current === null) return;
    const el = document.querySelector(`[data-line-index="${anchor.current}"]`);
    anchor.current = null;
    el?.scrollIntoView({ block: 'start' });
  }, [modeKey]);

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

  const items = toItems(lines);
  const remember = () => {
    anchor.current = firstVisibleLineIndex(document, 112);
  };
  const mode = optMode ?? song.displayMode;
  const variant = optVariant ?? song.cleanVariant;
  const changeMode = (m: DisplayMode) => {
    remember();
    setOptMode(m);
    void setDisplayMode(song.id, m);
  };
  const menuItems: MenuItem[] = [
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
            items={menuItems}
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
              {song.learnedCount} of {song.lineCount} {song.lineCount === 1 ? 'line' : 'lines'}
            </span>
            {song.lineCount > 0 && song.learnedCount >= song.lineCount ? (
              <span className={s['badge']}>Learned ✓</span>
            ) : null}
            {song.source.kind === 'lrclib' ? <span>· Lyrics from LRCLIB</span> : null}
          </p>
          {song.lineCount > 0 ? (
            <ProgressBar
              value={song.learnedCount / song.lineCount}
              label={`${song.learnedCount} of ${song.lineCount} lines learned`}
            />
          ) : null}
        </header>

        <div className={s['modes']}>
          <SegmentedControl
            label="Mode"
            value={mode}
            options={MODE_OPTIONS}
            onChange={changeMode}
          />
        </div>

        {song.language !== 'ko' ? (
          <div className={s['banner']}>
            <Banner>
              Pronunciation for {LANG_NAME[song.language]} isn&rsquo;t available yet, so the
              original text is shown. Marking lines as learned still works.
            </Banner>
          </div>
        ) : null}

        <SongBody
          key={song.id}
          song={song}
          items={items}
          prefs={prefs}
          learned={learned ?? new Set()}
          mode={mode}
          variant={variant}
          onVariant={(v) => {
            remember();
            setOptVariant(v);
            void setCleanVariant(song.id, v);
          }}
        />
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

/** Owns the analysis hook so the (possibly slow) engine never blocks the rest of the screen. */
function SongBody({
  song,
  items,
  prefs,
  learned,
  mode,
  variant,
  onVariant,
}: {
  song: Song;
  mode: DisplayMode;
  variant: 'original' | 'romanised';
  items: LyricItem[];
  prefs: RomanPrefs;
  learned: ReadonlySet<string>;
  onVariant: (v: 'original' | 'romanised') => void;
}) {
  const lines = useMemo(() => items.map((i) => i.line), [items]);
  const { byKey, processing } = useLineAnalyses(song, lines);
  const common = {
    items,
    language: song.language,
    rawLyrics: song.rawLyrics,
    analyses: byKey,
    prefs,
  };
  return (
    <>
      {processing ? (
        <div className={s['processing']} aria-live="polite">
          <span className="visually-hidden">Adding pronunciation…</span>
          <div className={s['processingBar']} aria-hidden="true" />
        </div>
      ) : null}
      {mode === 'karaoke' ? (
        <KaraokeView {...common} />
      ) : mode === 'clean' ? (
        <CleanView {...common} variant={variant} onVariant={onVariant} />
      ) : (
        <LearnView {...common} songId={song.id} learned={learned} />
      )}
    </>
  );
}
