import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnalysisRows } from '@/db/hooks';
import { pruneAnalyses, putAnalyses } from '@/db/repositories/analysis';
import { setRomanisedSearchText } from '@/db/repositories/songs';
import type { Line, Song } from '@/db/types';
import { analysisCacheKey } from '@/engine/cacheKey';
import { getEngineClient } from '@/engine/clientDefault';
import type { LineAnalysis } from '@/engine/model';
import { romaniseLine } from '@/engine/romanLine';

export interface AnalysisState {
  /** Analysis by line content key (identical lines share one). Missing while pending. */
  byKey: ReadonlyMap<string, LineAnalysis>;
  /** True while lines are still being analysed (drives the thin progress bar). */
  processing: boolean;
}

/**
 * Progressive analysis of a song (ARCHITECTURE §4.1): reads cached results, asks the engine for the
 * missing lines, writes them back, and re-renders as they arrive. Rendering never waits on this.
 */
export function useLineAnalyses(song: Song, lines: readonly Line[]): AnalysisState {
  const lyric = useMemo(() => lines.filter((l) => (l.kindOverride ?? l.kind) === 'lyric'), [lines]);
  const cached = useAnalysisRows(song.id);
  const [running, setRunning] = useState(false);
  const started = useRef(new Set<string>());

  const wanted = useMemo(() => {
    const m = new Map<string, { key: string; text: string; cacheKey: string }>();
    for (const l of lyric)
      if (!m.has(l.key))
        m.set(l.key, {
          key: l.key,
          text: l.text,
          cacheKey: analysisCacheKey(song.language, l.key, l.text),
        });
    return m;
  }, [lyric, song.language]);

  const fresh = useMemo(() => {
    const byCache = new Map((cached ?? []).map((r) => [r.cacheKey, r.analysis as LineAnalysis]));
    const byKey = new Map<string, LineAnalysis>();
    for (const [key, w] of wanted) {
      const a = byCache.get(w.cacheKey);
      if (a) byKey.set(key, a);
    }
    return byKey;
  }, [cached, wanted]);

  const missing = useMemo(
    () => (cached === undefined ? [] : [...wanted.values()].filter((w) => !fresh.has(w.key))),
    [cached, wanted, fresh],
  );
  const missingId = missing.map((m) => m.cacheKey).join(',');
  // The effect below depends only on the stable id, so a re-emitted live query cannot abort a run.
  const missingRef = useRef(missing);
  useEffect(() => {
    missingRef.current = missing;
  });

  useEffect(() => {
    const todo = missingRef.current;
    const startedIds = started.current;
    if (todo.length === 0 || startedIds.has(missingId)) return;
    startedIds.add(missingId);
    const ctl = new AbortController();
    setRunning(true);
    void (async () => {
      try {
        const results = await getEngineClient().analyse(
          song.language,
          todo.map((m) => ({ key: m.key, text: m.text })),
          { signal: ctl.signal },
        );
        await putAnalyses(
          results.map((analysis, i) => ({
            cacheKey: todo[i]!.cacheKey,
            songId: song.id,
            analysis,
            createdAt: Date.now(),
          })),
        );
      } catch {
        // Aborted, or the cache write failed: the lines simply stay unannotated (original text shows).
      } finally {
        if (!ctl.signal.aborted) setRunning(false);
      }
    })();
    return () => {
      ctl.abort(); // leaving the song (or the line set changing) cancels pending batches
      startedIds.delete(missingId);
    };
  }, [missingId, song.id, song.language]);

  // Once everything is analysed: drop obsolete cache rows, and make romanised text searchable (J10.1).
  const complete = cached !== undefined && wanted.size > 0 && missing.length === 0;
  useEffect(() => {
    if (!complete) return;
    void pruneAnalyses(song.id, new Set([...wanted.values()].map((w) => w.cacheKey))).catch(
      () => undefined,
    );
    if (song.language === 'ko' && !song.searchText.includes('\u0001')) {
      const text = lyric
        .map((l) => romaniseLine(fresh.get(l.key)?.tokens ?? []))
        .filter(Boolean)
        .join('\n');
      if (text) void setRomanisedSearchText(song.id, text).catch(() => undefined);
    }
  }, [complete, song.id, song.language, song.searchText, wanted, lyric, fresh]);

  return { byKey: fresh, processing: running && missing.length > 0 };
}
