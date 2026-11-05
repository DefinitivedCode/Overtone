import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { setLearned } from '@/db/repositories/progress';
import type { DisplaySettings, LangCode } from '@/db/types';
import type { LineAnalysis, Token } from '@/engine/model';
import { japaneseRomanRuns, romaniseLine, tokenRoman, tokenUnits } from '@/engine/romanLine';
import type { RomanOptions, RomanPrefs } from '@/engine/romanLine';
import { langAttr } from '@/engine/segment/detect';
import { Button, Sheet, SegmentedControl, useToast } from '@/ui';
import type { WordTarget } from '@/features/word/target';
import type { LyricItem } from './lyricModel';
import s from './LyricViews.module.css';

interface ViewProps {
  items: LyricItem[];
  language: LangCode;
  rawLyrics: string;
  analyses: ReadonlyMap<string, LineAnalysis>;
  prefs: RomanPrefs;
}

const ROMAN_LANG = {
  ko: 'ko-Latn',
  ja: 'ja-Latn',
  zh: 'zh-Latn-pinyin',
  yue: 'yue-Latn-jyutping',
} as const;

/** Renders one analysed token for Learn mode: ruby over the word, markers for uncertainty. */
function LearnToken({
  t,
  units,
  prefs,
  language,
  readingFirst,
  trail,
}: {
  t: Token;
  /** Per-character display syllables (Mandarin/Cantonese), or null. */
  units: string[] | null;
  prefs: RomanPrefs;
  language: LangCode;
  /** Reading-first layout: English joins the reading row instead of interrupting it. */
  readingFirst: boolean;
  /** Punctuation directly after an English word, shown with it in the reading row. */
  trail: string;
}): ReactNode {
  if (t.kind === 'space') return t.surface;
  // English in a Korean/Chinese song: when the reading leads, sing it from the same row as the romanisation.
  // The base stays in the DOM (collapsed) so copy, search and screen readers still get the lyric text.
  if (readingFirst && language !== 'ja' && t.kind === 'latin') {
    // One ruby per word so a long English phrase wraps like normal text; trailing punctuation stays with the last word.
    const text = t.surface + trail;
    return (
      <>
        {text.split(/(\s+)/u).map((part, i) =>
          part === '' || /^\s+$/u.test(part) ? (
            part
          ) : (
            <ruby key={i} className={s['english']}>
              <span className={s['englishBase']} lang="en">
                {part}
              </span>
              <rt aria-hidden="true" lang="en">
                {part}
              </rt>
            </ruby>
          ),
        )}
      </>
    );
  }
  if (language === 'ja') {
    if (t.lang === 'en') return <span lang="en">{t.surface}</span>;
    if (t.lang !== 'ja') return t.surface;
    const low = t.confidence === 'low' || t.confidence === 'medium';
    const ruby = t.ruby.length
      ? t.ruby
      : t.reading && (prefs.ja.furiganaForKanaWords || t.userReading)
        ? [{ base: t.surface, reading: t.reading }]
        : [
            {
              base: t.surface,
              reading:
                t.confidence === 'none' && !t.notes.includes('needs-language-data') ? '?' : null,
            },
          ];
    return (
      <span className={low ? s['uncertain'] : undefined}>
        {ruby.map((unit, i) =>
          unit.reading === null ? (
            <span key={i}>{unit.base}</span>
          ) : (
            <ruby key={i}>
              <span>{unit.base}</span>
              <rt lang="ja-Hira">{unit.reading}</rt>
            </ruby>
          ),
        )}
      </span>
    );
  }
  if (units && t.ruby.length > 0 && t.lang === language) {
    const low = t.confidence === 'low' || t.confidence === 'medium';
    return (
      <span className={low ? s['uncertain'] : undefined}>
        {t.ruby.map((u, i) => (
          <ruby key={i}>
            {u.base}
            <rt
              aria-hidden="true"
              lang={ROMAN_LANG[language]}
              className={u.reading === null ? s['unknown'] : undefined}
            >
              {u.reading === null ? '?' : units[i]}
            </rt>
          </ruby>
        ))}
      </span>
    );
  }
  const annotated = t.kind === 'word' && t.lang === language && t.roman !== null;
  if (annotated) {
    const low = t.confidence === 'low' || t.confidence === 'medium';
    return (
      <ruby className={low ? s['uncertain'] : undefined}>
        {t.surface}
        <rt aria-hidden="true" lang={ROMAN_LANG[language]}>
          {tokenRoman(t, prefs)}
        </rt>
      </ruby>
    );
  }
  // A word with a reading typed by the user (e.g. Hanja in a Korean song) shows it like any annotated word.
  if (t.kind === 'word' && t.userRoman !== undefined)
    return (
      <ruby>
        {t.surface}
        <rt aria-hidden="true" lang={ROMAN_LANG[language]}>
          {t.userRoman}
        </rt>
      </ruby>
    );
  // A foreign or unreadable segment inside a song we can read (Japanese or Hanja in a Korean song): unknown reading.
  if (t.kind === 'word' && t.confidence === 'none' && t.lang !== language)
    return (
      <ruby>
        {t.surface}
        <rt aria-hidden="true" className={s['unknown']}>
          ?
        </rt>
      </ruby>
    );
  return t.surface;
}

/* ---------------- Learn ---------------- */

export interface LearnViewProps extends ViewProps {
  songId: string;
  learned: ReadonlySet<string>;
  emphasis: DisplaySettings['learnEmphasis'];
  /** Opens the Word sheet for a tapped token. */
  onWord: (target: WordTarget) => void;
}

const readingFirst = (emphasis: DisplaySettings['learnEmphasis'], language: LangCode): boolean =>
  emphasis === 'reading' && language !== 'ja';

/** Tokens with something to look up (not punctuation, English or unreadable segments). */
const isTappable = (t: Token, language: LangCode): boolean =>
  t.corrected === true ||
  ((t.kind === 'word' || t.kind === 'particle') && t.lang === language) ||
  isUnreadable(t, language);

/** A word the engine could not read (Hanja or Japanese in a Korean song): shown with "?", tappable to correct it. */
const isUnreadable = (t: Token, language: LangCode): boolean =>
  t.kind === 'word' && t.confidence === 'none' && t.lang !== language && t.lang !== 'en';

/** Screen-reader name for a word button (J4.3): the word, its reading and what a tap does. */
function wordLabel(t: Token, prefs: RomanPrefs, language: LangCode): string {
  if (isUnreadable(t, language)) return `${t.surface}, no reading found. Show details.`;
  const roman = romaniseLine([t], prefs);
  const readings = [t.lang === 'ja' ? t.reading : null, roman !== t.surface ? roman : null].filter(
    (x): x is string => !!x,
  );
  return `${t.surface}${readings.length ? `, reading ${readings.join(', ')}` : ''}. Show meaning.`;
}

const LONG_PRESS_MS = 500;

/** Copies text; falls back to a hidden textarea where the async clipboard API is unavailable (older WebKit). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

interface LineMenuState {
  key: string;
  ordinal: number;
  text: string;
  roman: string;
  learned: boolean;
}

export function LearnView({
  items,
  language,
  analyses,
  prefs,
  songId,
  learned,
  emphasis,
  onWord,
}: LearnViewProps) {
  const toast = useToast();
  // Line menu (J4.8): long-press, right-click, or the context-menu key on a line's check button.
  const [menu, setMenu] = useState<LineMenuState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef(0);
  const longPressed = useRef(false);
  // Optimistic state: shown immediately, dropped once the stored value agrees (J7.1).
  const [optimistic, setOptimistic] = useState<ReadonlyMap<string, boolean>>(new Map());
  // When the stored set changes, forget optimistic entries it now agrees with (adjusting state while rendering
  // is the supported pattern for derived state).
  const [seen, setSeen] = useState(learned);
  if (seen !== learned) {
    setSeen(learned);
    const settled = [...optimistic].filter(([k, v]) => learned.has(k) === v);
    if (settled.length > 0) {
      const next = new Map(optimistic);
      for (const [k] of settled) next.delete(k);
      setOptimistic(next);
    }
  }

  async function toggle(key: string, nowLearned: boolean) {
    setOptimistic((m) => new Map(m).set(key, nowLearned));
    try {
      await setLearned(songId, key, nowLearned);
    } catch {
      setOptimistic((m) => {
        const next = new Map(m);
        next.delete(key);
        return next;
      });
      toast.show({ message: 'Could not save your progress. Nothing was changed.' });
    }
  }

  return (
    <>
      <ol
        className={`${s['list']} ${s['learn']}`}
        aria-label="Lyrics"
        data-emphasis={emphasis}
        data-script={language}
      >
        {items.map(({ line, kind, ordinal }) => {
          if (kind === 'blank')
            return (
              <li
                key={line.id}
                className={s['gap']}
                aria-hidden="true"
                data-line-index={line.index}
              />
            );
          if (kind === 'section')
            return (
              <li key={line.id} className={s['section']} data-line-index={line.index}>
                {line.text}
              </li>
            );
          const isLearned = optimistic.get(line.key) ?? learned.has(line.key);
          const analysis = analyses.get(line.id);
          const openMenu = () => {
            longPressed.current = true;
            window.clearTimeout(pressTimer.current);
            setMenu({
              key: line.key,
              ordinal: ordinal ?? 0,
              text: line.text,
              roman:
                analysis && analysis.status !== 'failed'
                  ? romaniseLine(analysis.tokens, prefs) || line.text
                  : line.text,
              learned: isLearned,
            });
            setMenuOpen(true);
          };
          return (
            <li
              key={line.id}
              className={s['learnLine']}
              data-learned={isLearned}
              data-line-index={line.index}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu();
              }}
            >
              <button
                type="button"
                className={s['check']}
                aria-pressed={isLearned}
                aria-label={`Mark line ${ordinal} as learned`}
                onClick={() => void toggle(line.key, !isLearned)}
                onKeyDown={(e) => {
                  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                    e.preventDefault();
                    openMenu();
                  }
                }}
              >
                <span className={s['checkMark']} aria-hidden="true">
                  {isLearned ? <Check size={16} strokeWidth={2.5} /> : null}
                </span>
              </button>
              <p
                className={s['learnText']}
                lang={langAttr(language, line.text)}
                onPointerDown={() => {
                  longPressed.current = false;
                  window.clearTimeout(pressTimer.current);
                  pressTimer.current = window.setTimeout(openMenu, LONG_PRESS_MS);
                }}
                onPointerUp={() => window.clearTimeout(pressTimer.current)}
                onPointerLeave={() => window.clearTimeout(pressTimer.current)}
                onPointerCancel={() => window.clearTimeout(pressTimer.current)}
                onPointerMove={(e) => {
                  // A scroll or drag is not a long press.
                  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)
                    window.clearTimeout(pressTimer.current);
                }}
                onClickCapture={(e) => {
                  if (longPressed.current) {
                    longPressed.current = false;
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                {analysis && analysis.status !== 'failed'
                  ? (() => {
                      const units = tokenUnits(analysis.tokens, prefs);
                      const english = readingFirst(emphasis, language);
                      return analysis.tokens.map((t, i) => {
                        const before = analysis.tokens[i - 1];
                        const after = analysis.tokens[i + 1];
                        if (english && t.kind === 'punct' && before?.kind === 'latin') return null;
                        const node = (
                          <LearnToken
                            t={t}
                            units={units[i] ?? null}
                            prefs={prefs}
                            language={language}
                            readingFirst={emphasis === 'reading'}
                            trail={
                              english && t.kind === 'latin' && after?.kind === 'punct'
                                ? after.surface
                                : ''
                            }
                          />
                        );
                        return isTappable(t, language) ? (
                          <button
                            key={i}
                            type="button"
                            className={s['word']}
                            aria-haspopup="dialog"
                            aria-label={wordLabel(t, prefs, language)}
                            data-word={t.start}
                            data-line={line.index}
                            data-corrected={t.corrected === true ? 'true' : undefined}
                            onClick={() => {
                              const same = analysis.tokens.filter(
                                (x) => x.surface === t.surface && isTappable(x, language),
                              );
                              const following = analysis.tokens[i + 1];
                              onWord({
                                token: t,
                                lineKey: line.key,
                                lineIndex: line.index,
                                occurrence: same.indexOf(t),
                                repeats: same.length,
                                next:
                                  following &&
                                  following.start === t.end &&
                                  isTappable(following, language) &&
                                  following.kind === 'word'
                                    ? following
                                    : null,
                              });
                            }}
                          >
                            {node}
                          </button>
                        ) : (
                          <Fragment key={i}>{node}</Fragment>
                        );
                      });
                    })()
                  : line.text}
                {language === 'ja' &&
                prefs.ja.showRomajiLine &&
                analysis?.tokens.some((t) => t.lang === 'ja' && t.reading) ? (
                  <span className={s['romaji']} lang="ja-Latn">
                    {renderJapaneseRoman(analysis, prefs)}
                  </span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ol>
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={menu ? `Line ${menu.ordinal}` : 'Line'}
        detent="half"
      >
        {menu ? (
          <div className={s['lineMenu']}>
            <Button
              variant="secondary"
              onClick={() => {
                void toggle(menu.key, !menu.learned);
                setMenuOpen(false);
              }}
            >
              {menu.learned ? 'Mark as not learned' : 'Mark as learned'}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void copyText(menu.text).then((ok) => {
                  toast.show({ message: ok ? 'Original copied' : 'Could not copy' });
                  setMenuOpen(false);
                })
              }
            >
              Copy original
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void copyText(menu.roman).then((ok) => {
                  toast.show({ message: ok ? 'Romanised copied' : 'Could not copy' });
                  setMenuOpen(false);
                })
              }
            >
              Copy romanised
            </Button>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

/* ---------------- Karaoke ---------------- */

/** Keeps the screen awake while singing (MAY, J5.6); released when leaving. Silently does nothing if unsupported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}

/** The romanised text for a line, or the original when there is no analysis yet (never blank, J5.4). */
function renderJapaneseRoman(a: LineAnalysis, prefs: RomanPrefs): ReactNode {
  return japaneseRomanRuns(a.tokens, prefs).map((r, i) => (
    <span key={i} lang={r.lang}>
      {r.text}
    </span>
  ));
}

function romanisedOrOriginal(
  text: string,
  a: LineAnalysis | undefined,
  prefs: RomanPrefs,
  opts: RomanOptions = {},
): ReactNode {
  if (!a || a.status === 'failed') return text;
  if (a.lang === 'ja' && a.tokens.some((t) => t.lang === 'ja' && t.reading))
    return renderJapaneseRoman(a, prefs);
  return romaniseLine(a.tokens, prefs, opts) || text;
}

export interface KaraokeViewProps extends ViewProps {
  syllables: boolean;
}

export function KaraokeView({ items, language, analyses, prefs, syllables }: KaraokeViewProps) {
  // Only Korean has a syllable-separated form; Chinese is already per syllable and Japanese is not split (ADR 0012).
  const opts: RomanOptions = { syllables: syllables && language === 'ko' };
  useWakeLock(true);
  return (
    <div className={s['karaoke']} role="group" aria-label="Romanised lyrics">
      {items.map(({ line, kind }) => {
        if (kind === 'blank')
          return (
            <div
              key={line.id}
              className={s['kGap']}
              aria-hidden="true"
              data-line-index={line.index}
            />
          );
        if (kind === 'section')
          return (
            <p key={line.id} className={s['kSection']} data-line-index={line.index}>
              {line.text}
            </p>
          );
        const a = analyses.get(line.id);
        const romanised =
          a &&
          a.status !== 'failed' &&
          a.tokens.some((t) => t.roman !== null && t.lang === language);
        return (
          <p
            key={line.id}
            className={s['kLine']}
            data-line-index={line.index}
            lang={romanised ? ROMAN_LANG[language] : langAttr(language, line.text)}
          >
            {romanisedOrOriginal(line.text, a, prefs, opts)}
          </p>
        );
      })}
    </div>
  );
}

/* ---------------- Clean ---------------- */

export interface CleanViewProps extends ViewProps {
  variant: 'original' | 'romanised';
  onVariant: (v: 'original' | 'romanised') => void;
}

export function CleanView({
  items,
  language,
  analyses,
  prefs,
  variant,
  onVariant,
}: CleanViewProps) {
  const body = useMemo(() => items, [items]);
  return (
    <>
      <div className={s['cleanToggle']}>
        <SegmentedControl
          label="Text"
          value={variant}
          onChange={onVariant}
          options={[
            { value: 'original', label: 'Original' },
            { value: 'romanised', label: 'Romanised' },
          ]}
        />
      </div>
      <article className={s['clean']} aria-label="Lyrics">
        {body.map(({ line, kind }) => {
          if (kind === 'blank')
            return (
              <div
                key={line.id}
                className={s['cGap']}
                aria-hidden="true"
                data-line-index={line.index}
              />
            );
          const a = analyses.get(line.id);
          const roman =
            variant === 'romanised' &&
            kind === 'lyric' &&
            a &&
            a.status !== 'failed' &&
            a.tokens.some((t) => t.roman !== null && t.lang === language);
          return (
            <p
              key={line.id}
              className={kind === 'section' ? s['cSection'] : s['cLine']}
              data-line-index={line.index}
              lang={roman ? ROMAN_LANG[language] : langAttr(language, line.text)}
            >
              {variant === 'romanised' && kind === 'lyric'
                ? romanisedOrOriginal(line.text, a, prefs)
                : language === 'ja' && a && a.status !== 'failed'
                  ? a.tokens.map((t, i) => (
                      <span key={i} lang={t.lang === 'en' ? 'en' : undefined}>
                        {t.surface}
                      </span>
                    ))
                  : line.text}
            </p>
          );
        })}
      </article>
    </>
  );
}
