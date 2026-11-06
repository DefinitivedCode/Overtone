import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { TopBar } from '@/app/TopBar';
import { useCollapsedTitle } from '@/app/useCollapsedTitle';
import { useCorrections, useLearnedKeys, useLines, useSettings, useSong } from '@/db/hooks';
import { resetProgress } from '@/db/repositories/progress';
import { updateSettings } from '@/db/repositories/settings';
import { setCleanVariant, setDisplayMode, touchOpened } from '@/db/repositories/songs';
import type { DisplayMode, DisplaySettings } from '@/db/types';
import { DEFAULT_ROMAN_PREFS } from '@/engine/romanLine';
import type { RomanPrefs } from '@/engine/romanLine';
import { langAttr } from '@/engine/segment/detect';
import { LANG_CODE, LANG_NAME } from '@/features/language';
import { LanguageDataBanner } from '@/features/packs/PackUi';
import {
  Banner,
  Button,
  Chip,
  ChipButton,
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
import type { WordTarget } from '@/features/word/target';
import { EditDetailsSheet } from './EditDetailsSheet';
import { EditLyricsSheet } from './EditLyricsSheet';
import { CleanView, KaraokeView, LearnView } from './LyricViews';
import { firstVisibleLine, toItems } from './lyricModel';
import type { LyricItem } from './lyricModel';
import s from './SongScreen.module.css';
import { UnmatchedSheet } from '@/features/word/UnmatchedSheet';
import { WordSheet } from '@/features/word/WordSheet';
import { useInstalledPacks } from '@/features/packs/packs';
import { useDeleteSong } from './useDeleteSong';
import { useLineAnalyses } from './useLineAnalyses';
import { applyCorrections } from '@/engine/overlay';
import type { LineAnalysis } from '@/engine/model';

/** Height of the sticky top bar plus mode selector that lyric lines scroll underneath. */
const STICKY_BARS = 112;
/** At or below this scroll offset the reader is still at the top of the page and is left there. */
const NEAR_TOP = 16;
/** How long the reading position keeps being restored while the new layout settles. */
const SETTLE_MS = 600;

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
  // The line being read, where it sits on screen and the scroll offset, captured just before a layout-changing choice.
  const anchor = useRef<{ index: number; top: number; scrollY: number } | null>(null);
  const { ref: titleRef, collapsed } = useCollapsedTitle<HTMLHeadingElement>();
  // Optimistic: the control reflects the click at once; the stored value catches up a moment later.
  const [optMode, setOptMode] = useState<DisplayMode | null>(null);
  const [optVariant, setOptVariant] = useState<'original' | 'romanised' | null>(null);
  if (optMode !== null && song && song.displayMode === optMode) setOptMode(null);
  if (optVariant !== null && song && song.cleanVariant === optVariant) setOptVariant(null);

  const songId = song?.id;
  useEffect(() => {
    if (songId) void touchOpened(songId).catch(() => undefined);
  }, [songId]);

  const display = settings?.display;
  const prefs: RomanPrefs = useMemo(
    () => (settings ? settings.romanisation : DEFAULT_ROMAN_PREFS),
    [settings],
  );

  // Keep the line being read at the same place on screen when the layout changes (mode, Clean variant, syllables).
  // A reader still at the top (inside the collapsing header) stays at the top, so the mode selector does not move.
  const modeKey = `${optMode ?? song?.displayMode}|${optVariant ?? song?.cleanVariant}|${display?.karaokeSyllables ?? false}`;
  useLayoutEffect(() => {
    const a = anchor.current;
    if (a === null) return;
    anchor.current = null;
    if (a.scrollY <= NEAR_TOP) return;
    // Content can settle a few frames later (romanisation arrives, the page briefly shortens and the browser clamps the
    // scroll offset), so keep restoring the line's position for a short window, until the reader scrolls themselves.
    const start = performance.now();
    let raf = 0;
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stop = () => {
      cancelAnimationFrame(raf);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
    const restore = () => {
      const el = document.querySelector(`[data-line-index="${a.index}"]`);
      if (!el) return;
      const delta = el.getBoundingClientRect().top - a.top;
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
    };
    const tick = () => {
      restore();
      if (performance.now() - start < SETTLE_MS) raf = requestAnimationFrame(tick);
      else stop();
    };
    restore();
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    raf = requestAnimationFrame(tick);
    return stop;
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
    const found = firstVisibleLine(document, STICKY_BARS);
    anchor.current = found && { ...found, scrollY: window.scrollY };
  };
  const mode = optMode ?? song.displayMode;
  const variant = optVariant ?? song.cleanVariant;
  const changeMode = (m: DisplayMode) => {
    remember();
    setOptMode(m);
    void setDisplayMode(song.id, m);
  };
  const showSyllableToggle = mode === 'karaoke' && song.language === 'ko';
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
        title={song.title}
        titleVisible={collapsed}
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
      <main
        className={`screen ${s['page']}`}
        style={showSyllableToggle ? ({ '--sticky-extra': '44px' } as CSSProperties) : undefined}
      >
        <header className={s['header']}>
          <h1 ref={titleRef} className="title" lang={langAttr(song.language, song.title)}>
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
          {showSyllableToggle ? (
            <KaraokeOptions
              syllables={display?.karaokeSyllables ?? false}
              onBeforeChange={remember}
            />
          ) : null}
        </div>

        {song.language !== 'ko' ? (
          <div className={s['banner']}>
            <LanguageDataBanner language={song.language} />
          </div>
        ) : null}

        <SongBody
          key={song.id}
          song={song}
          items={items}
          prefs={prefs}
          emphasis={display?.learnEmphasis ?? 'reading'}
          syllables={display?.karaokeSyllables ?? false}
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
  emphasis,
  syllables,
  learned,
  mode,
  variant,
  onVariant,
}: {
  emphasis: DisplaySettings['learnEmphasis'];
  syllables: boolean;
  song: Song;
  mode: DisplayMode;
  variant: 'original' | 'romanised';
  items: LyricItem[];
  prefs: RomanPrefs;
  learned: ReadonlySet<string>;
  onVariant: (v: 'original' | 'romanised') => void;
}) {
  const lines = useMemo(() => items.map((i) => i.line), [items]);
  const { byLine: generated, processing } = useLineAnalyses(song, lines);
  const stored = useCorrections(song.id);
  const corrections = useMemo(
    () => (stored ?? []).filter((c) => c.language === song.language),
    [stored, song.language],
  );
  // Corrections are applied at render time, so edits show in every mode at once and never need re-analysis (J8.3).
  const { byLine, applied } = useMemo(() => {
    const out = new Map<string, LineAnalysis>();
    const hit = new Set<string>();
    const keyOf = new Map(lines.map((l) => [l.id, l.key]));
    for (const [id, a] of generated) {
      const key = keyOf.get(id);
      const r =
        key === undefined
          ? { analysis: a, applied: new Set<string>() }
          : applyCorrections(a, key, corrections);
      out.set(id, r.analysis);
      r.applied.forEach((x) => hit.add(x));
    }
    return { byLine: out, applied: hit };
  }, [generated, lines, corrections]);
  // Not-applied corrections are reported once every line has been analysed (never silently dropped).
  const packs = useInstalledPacks();
  const analysed = items.every((i) => i.kind !== 'lyric' || generated.has(i.line.id));
  const ready =
    !processing &&
    analysed &&
    (song.language === 'ko' || !!packs?.some((p) => p.lang === song.language));
  const unmatched = useMemo(
    () => (ready ? corrections.filter((c) => !applied.has(c.id)) : []),
    [ready, corrections, applied],
  );
  const [reviewing, setReviewing] = useState(false);
  const [word, setWord] = useState<WordTarget | null>(null);
  const [wordOpen, setWordOpen] = useState(false);
  const common = {
    items,
    language: song.language,
    rawLyrics: song.rawLyrics,
    analyses: byLine,
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
      {unmatched.length > 0 ? (
        <div className={s['banner']}>
          <Banner
            tone="warning"
            action={
              <Button variant="secondary" onClick={() => setReviewing(true)}>
                Review
              </Button>
            }
          >
            {unmatched.length === 1
              ? "1 correction couldn't be applied."
              : `${unmatched.length} corrections couldn't be applied.`}
          </Banner>
        </div>
      ) : null}
      <UnmatchedSheet
        corrections={unmatched}
        open={reviewing && unmatched.length > 0}
        onClose={() => setReviewing(false)}
      />
      {mode === 'karaoke' ? (
        <KaraokeView {...common} syllables={syllables} />
      ) : mode === 'clean' ? (
        <CleanView {...common} variant={variant} onVariant={onVariant} />
      ) : (
        <>
          <LearnView
            {...common}
            songId={song.id}
            learned={learned}
            emphasis={emphasis}
            onWord={(target) => {
              setWord(target);
              setWordOpen(true);
            }}
          />
          <WordSheet
            target={word}
            language={song.language}
            prefs={prefs}
            songId={song.id}
            corrections={corrections}
            open={wordOpen}
            onClose={() => setWordOpen(false)}
          />
        </>
      )}
    </>
  );
}

/** Karaoke-only choice, remembered on this device; Learn and Clean never read it. */
function KaraokeOptions({
  syllables,
  onBeforeChange,
}: {
  syllables: boolean;
  onBeforeChange: () => void;
}) {
  const toast = useToast();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  if (optimistic !== null && optimistic === syllables) setOptimistic(null);
  const value = optimistic ?? syllables;
  return (
    <div className={s['karaokeOptions']}>
      <ChipButton
        pressed={value}
        onClick={() => {
          const karaokeSyllables = !value;
          onBeforeChange();
          setOptimistic(karaokeSyllables);
          void updateSettings((x) => ({ ...x, display: { ...x.display, karaokeSyllables } })).catch(
            () => {
              setOptimistic(null);
              toast.show({ message: 'Could not save this choice.' });
            },
          );
        }}
      >
        Split into syllables
      </ChipButton>
    </div>
  );
}
