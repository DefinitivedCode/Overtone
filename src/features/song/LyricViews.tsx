import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { setLearned } from '@/db/repositories/progress';
import type { LangCode } from '@/db/types';
import type { LineAnalysis, Token } from '@/engine/model';
import { romaniseLine, tokenRoman } from '@/engine/romanLine';
import type { RomanPrefs } from '@/engine/romanLine';
import { langAttr } from '@/engine/segment/detect';
import { SegmentedControl, useToast } from '@/ui';
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
  prefs,
  language,
}: {
  t: Token;
  prefs: RomanPrefs;
  language: LangCode;
}): ReactNode {
  if (t.kind === 'space') return t.surface;
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
}

export function LearnView({ items, language, analyses, prefs, songId, learned }: LearnViewProps) {
  const toast = useToast();
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
    <ol className={`${s['list']} ${s['learn']}`} aria-label="Lyrics">
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
        const analysis = analyses.get(line.key);
        return (
          <li
            key={line.id}
            className={s['learnLine']}
            data-learned={isLearned}
            data-line-index={line.index}
          >
            <button
              type="button"
              className={s['check']}
              aria-pressed={isLearned}
              aria-label={`Mark line ${ordinal} as learned`}
              onClick={() => void toggle(line.key, !isLearned)}
            >
              <span className={s['checkMark']} aria-hidden="true">
                {isLearned ? <Check size={16} strokeWidth={2.5} /> : null}
              </span>
            </button>
            <p className={s['learnText']} lang={langAttr(language, line.text)}>
              {analysis && analysis.status !== 'failed'
                ? analysis.tokens.map((t, i) => (
                    <LearnToken key={i} t={t} prefs={prefs} language={language} />
                  ))
                : line.text}
            </p>
          </li>
        );
      })}
    </ol>
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
function romanisedOrOriginal(text: string, a: LineAnalysis | undefined, prefs: RomanPrefs): string {
  if (!a || a.status === 'failed') return text;
  return romaniseLine(a.tokens, prefs) || text;
}

export function KaraokeView({ items, language, analyses, prefs }: ViewProps) {
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
        const a = analyses.get(line.key);
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
            {romanisedOrOriginal(line.text, a, prefs)}
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
          const a = analyses.get(line.key);
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
                : line.text}
            </p>
          );
        })}
      </article>
    </>
  );
}
