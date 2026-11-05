import { useEffect, useRef, useState } from 'react';
import { LrclibError, describeLrclibError, searchLrclib } from '@/online/lrclib';
import type { LrclibResult } from '@/online/lrclib';
import { Banner, Button, TextField } from '@/ui';
import s from './OnlineSearch.module.css';

const duration = (secs: number | null): string | null =>
  secs === null ? null : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'results'; results: LrclibResult[] }
  | { phase: 'error'; error: unknown };

export interface OnlineSearchProps {
  initialTitle: string;
  initialArtist: string;
  onPick: (result: LrclibResult) => void;
}

/** "Search online" tab (PRODUCT_SPEC J3). Entirely optional: pasting lyrics never depends on it. */
export function OnlineSearch({ initialTitle, initialArtist, onPick }: OnlineSearchProps) {
  const online = useOnline();
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState(initialArtist);
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [cooldown, setCooldown] = useState(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  // Count down a rate-limit wait so Retry re-enables by itself.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const canSearch = (title.trim() !== '' || artist.trim() !== '') && online && cooldown === 0;

  async function search() {
    if (!canSearch) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setState({ phase: 'loading' });
    try {
      const results = await searchLrclib({ title, artist }, { signal: ctl.signal });
      if (!ctl.signal.aborted) setState({ phase: 'results', results });
    } catch (error) {
      if (ctl.signal.aborted) return;
      if (error instanceof LrclibError && error.kind === 'rate-limited' && error.retryAfterMs)
        setCooldown(Math.ceil(error.retryAfterMs / 1000));
      setState({ phase: 'error', error });
    }
  }

  return (
    <form
      className={s['search']}
      onSubmit={(e) => {
        e.preventDefault();
        void search();
      }}
    >
      {!online ? (
        <Banner tone="warning">
          You are offline. Searching needs a connection. You can still paste lyrics on the other
          tab.
        </Banner>
      ) : null}
      <TextField
        label="Song title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
      <TextField
        label="Artist"
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
      <Button type="submit" disabled={!canSearch || state.phase === 'loading'}>
        {state.phase === 'loading' ? 'Searching…' : 'Search'}
      </Button>

      {state.phase === 'error' ? (
        <Banner
          tone="error"
          action={
            <Button variant="plain" disabled={!canSearch} onClick={() => void search()}>
              {cooldown > 0 ? `Retry in ${cooldown} s` : 'Retry'}
            </Button>
          }
        >
          {describeLrclibError(state.error)}
        </Banner>
      ) : null}

      {state.phase === 'results' ? (
        state.results.length === 0 ? (
          <p className={s['empty']}>No songs found. Check the spelling, or paste the lyrics.</p>
        ) : (
          <ul className={s['results']} aria-label="Search results">
            {state.results.map((r) => {
              const blocked = r.instrumental
                ? 'Instrumental'
                : r.plainLyrics
                  ? null
                  : 'No plain lyrics';
              const meta = [r.artist, r.album, duration(r.duration)].filter(Boolean).join(' · ');
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={s['result']}
                    disabled={blocked !== null}
                    onClick={() => onPick(r)}
                  >
                    <span className={s['name']}>{r.title}</span>
                    <span className={s['meta']}>{meta}</span>
                    {blocked ? <span className={s['blocked']}>{blocked}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      <p className={s['notice']}>
        Lyrics come from LRCLIB, a community-contributed database, and are provided for personal
        study. Pick a result to review and edit it before saving. Nothing is saved until you tap
        Save.
      </p>
    </form>
  );
}
