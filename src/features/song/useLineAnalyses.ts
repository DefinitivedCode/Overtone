import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnalysisRows } from '@/db/hooks';
import { useInstalledPacks } from '@/features/packs/packs';
import { pruneAnalyses, putAnalyses } from '@/db/repositories/analysis';
import { setRomanisedSearchText } from '@/db/repositories/songs';
import type { Line, Song } from '@/db/types';
import { analysisCacheKey } from '@/engine/cacheKey';
import { getEngineClient } from '@/engine/clientDefault';
import type { LineInput } from '@/engine/analyse';
import type { LineAnalysis } from '@/engine/model';
import { romaniseLine } from '@/engine/romanLine';

export interface AnalysisState {
  /** Analysis by line occurrence. Identical text and pasted readings share cached work. */
  byLine: ReadonlyMap<string, LineAnalysis>;
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
  const packs = useInstalledPacks();
  const needsPack = song.language !== 'ko';
  const pack = packs?.find((p) => p.lang === song.language);
  const packVersion = pack?.version ?? null;
  const packCacheKey =
    pack?.lang === 'ja' && pack.generation ? `${pack.version}:${pack.generation}` : packVersion;
  const [running, setRunning] = useState(false);
  const started = useRef(new Set<string>());

  const wanted = useMemo(() => {
    const m = new Map<string, LineInput & { cacheKey: string }>();
    for (const l of lyric) {
      const readings = song.language === 'ja' ? l.readings : undefined;
      m.set(l.id, {
        key: l.key,
        text: l.text,
        packVersion,
        readings,
        cacheKey: analysisCacheKey(song.language, l.key, l.text, packCacheKey, readings),
      });
    }
    return m;
  }, [lyric, song.language, packVersion, packCacheKey]);

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
    () =>
      cached === undefined || (needsPack && packs === undefined)
        ? []
        : [
            ...new Map(
              [...wanted].filter(([id]) => !fresh.has(id)).map(([, w]) => [w.cacheKey, w]),
            ).values(),
          ],
    [cached, needsPack, packs, wanted, fresh],
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
        const results = await getEngineClient().analyse(song.language, todo, {
          signal: ctl.signal,
        });
        if (ctl.signal.aborted) return;
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
  }, [missingId, packVersion, song.id, song.language]);

  // Once everything is analysed: drop obsolete cache rows, and make romanised text searchable (J10.1).
  const complete = cached !== undefined && wanted.size > 0 && missing.length === 0;
  useEffect(() => {
    if (!complete) return;
    void pruneAnalyses(song.id, new Set([...wanted.values()].map((w) => w.cacheKey))).catch(
      () => undefined,
    );
    if (song.language === 'ko' && !song.searchText.includes('\u0001')) {
      const text = lyric
        .map((l) => romaniseLine(fresh.get(l.id)?.tokens ?? []))
        .filter(Boolean)
        .join('\n');
      if (text) void setRomanisedSearchText(song.id, text).catch(() => undefined);
    }
  }, [complete, song.id, song.language, song.searchText, wanted, lyric, fresh]);

  return { byLine: fresh, processing: running && missing.length > 0 };
}
