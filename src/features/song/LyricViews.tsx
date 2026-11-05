import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { setLearned } from '@/db/repositories/progress';
import type { LangCode } from '@/db/types';
import type { LineAnalysis, Token } from '@/engine/model';
import { japaneseRomanRuns, romaniseLine, tokenRoman, tokenUnits } from '@/engine/romanLine';
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
  units,
  prefs,
  language,
}: {
  t: Token;
  /** Per-character display syllables (Mandarin/Cantonese), or null. */
  units: string[] | null;
  prefs: RomanPrefs;
  language: LangCode;
}): ReactNode {
  if (t.kind === 'space') return t.surface;
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
        const analysis = analyses.get(line.id);
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
                ? (() => {
                    const units = tokenUnits(analysis.tokens, prefs);
                    return analysis.tokens.map((t, i) => (
                      <LearnToken
                        key={i}
                        t={t}
                        units={units[i] ?? null}
                        prefs={prefs}
                        language={language}
                      />
                    ));
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
): ReactNode {
  if (!a || a.status === 'failed') return text;
  if (a.lang === 'ja' && a.tokens.some((t) => t.lang === 'ja' && t.reading))
    return renderJapaneseRoman(a, prefs);
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
