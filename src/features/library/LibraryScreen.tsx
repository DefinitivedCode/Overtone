import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpDown, Plus, Settings as SettingsIcon } from 'lucide-react';
import { TopBar } from '@/app/TopBar';
import { InstallTip } from '@/app/InstallTip';
import { useDebounced } from '@/app/useDebounced';
import { useSettings, useSongs } from '@/db/hooks';
import { updateSettings } from '@/db/repositories/settings';
import type { LibraryFilter, LibrarySort, Song } from '@/db/types';
import { AddSongSheet } from '@/features/add-song/AddSongSheet';
import { LANGUAGES, LANG_CODE, LANG_NAME } from '@/features/language';
import { EditDetailsSheet } from '@/features/song/EditDetailsSheet';
import { useDeleteSong } from '@/features/song/useDeleteSong';
import { exportBackupFile } from '@/features/settings/backupActions';
import {
  Banner,
  Button,
  ChipButton,
  EmptyState,
  IconButton,
  Menu,
  SearchField,
  Skeleton,
} from '@/ui';
import s from './LibraryScreen.module.css';
import {
  SORT_LABEL,
  filterSongs,
  languageCounts,
  shouldRemindBackup,
  sortSongs,
} from './libraryModel';
import { SongRow } from './SongRow';

const SORTS = Object.keys(SORT_LABEL) as LibrarySort[];

export function LibraryScreen() {
  const navigate = useNavigate();
  const songs = useSongs();
  const settings = useSettings();
  const [queryOverride, setQuery] = useState<string | null>(null);
  const query = queryOverride ?? settings?.library.query ?? '';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Song | null>(null);
  const { requestDelete, dialog } = useDeleteSong();

  // A user edit takes precedence if settings are still loading (J10.4).
  const filterQuery = useDebounced(query, 150);
  useEffect(() => {
    if (queryOverride === null) return;
    const t = window.setTimeout(
      () => void updateSettings((x) => ({ ...x, library: { ...x.library, query: queryOverride } })),
      300,
    );
    return () => window.clearTimeout(t);
  }, [queryOverride]);

  const filter: LibraryFilter = settings?.library.filter ?? 'all';
  const sort: LibrarySort = settings?.library.sort ?? 'opened';
  const counts = useMemo(() => languageCounts(songs ?? []), [songs]);
  const visible = useMemo(
    () => sortSongs(filterSongs(songs ?? [], filterQuery, filter), sort),
    [songs, filterQuery, filter, sort],
  );
  const remind = settings && songs ? shouldRemindBackup(settings.backup, songs) : false;

  const setLibrary = (patch: Partial<{ filter: LibraryFilter; sort: LibrarySort }>) =>
    void updateSettings((x) => ({ ...x, library: { ...x.library, ...patch } }));

  const header = (
    <TopBar
      trailing={
        <>
          <IconButton label="Add song" onClick={() => setAdding(true)}>
            <Plus size={24} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <Link to="/settings" aria-label="Settings" className={s['iconLink']}>
            <SettingsIcon size={22} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </>
      }
    />
  );

  return (
    <>
      {header}
      <main className="screen">
        <h1 className="large-title">Library</h1>

        {songs === undefined ? (
          <div className={s['skeletons']} aria-hidden="true">
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : songs.length === 0 ? (
          <EmptyState
            title="Your songbook is empty"
            action={<Button onClick={() => setAdding(true)}>Add a song</Button>}
          >
            Paste the lyrics of a song you love and Overtone will help you read, understand and sing
            it.
          </EmptyState>
        ) : (
          <>
            {remind ? (
              <div className={s['reminder']}>
                <Banner
                  tone="warning"
                  onDismiss={() =>
                    void updateSettings((x) => ({
                      ...x,
                      backup: { ...x.backup, reminderDismissedAt: Date.now() },
                    }))
                  }
                  action={
                    <Button
                      variant="plain"
                      onClick={() => void exportBackupFile().catch(() => undefined)}
                    >
                      Back up now
                    </Button>
                  }
                >
                  You have changes that aren&rsquo;t in a backup yet. Your songs live only on this
                  device.
                </Banner>
              </div>
            ) : null}

            <InstallTip />

            <SearchField label="Search songs, artists, lyrics" value={query} onChange={setQuery} />

            <div className={s['controls']}>
              <div className={s['chips']} role="group" aria-label="Filter by language">
                <ChipButton
                  pressed={filter === 'all'}
                  onClick={() => setLibrary({ filter: 'all' })}
                >
                  All {counts.all}
                </ChipButton>
                {LANGUAGES.map((l) => (
                  <ChipButton
                    key={l}
                    pressed={filter === l}
                    disabled={counts[l] === 0}
                    aria-label={`${LANG_NAME[l]}, ${counts[l]} songs`}
                    onClick={() => setLibrary({ filter: l })}
                  >
                    {LANG_CODE[l]} {counts[l]}
                  </ChipButton>
                ))}
              </div>
              <Menu
                renderTrigger={(p) => (
                  <Button variant="plain" {...p} aria-label={`Sort: ${SORT_LABEL[sort]}`}>
                    <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden="true" />
                    {SORT_LABEL[sort]}
                  </Button>
                )}
                items={SORTS.map((k) => ({
                  key: k,
                  label: SORT_LABEL[k],
                  checked: k === sort,
                  onSelect: () => setLibrary({ sort: k }),
                }))}
              />
            </div>

            {visible.length === 0 ? (
              <EmptyState title="No songs match">
                Try different words, or clear the search and language filter.
              </EmptyState>
            ) : null}
            {visible.length === 0 ? (
              <div className={s['clear']}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setLibrary({ filter: 'all' });
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <ul className={s['list']} aria-label="Songs">
                {visible.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    onOpen={(song) => navigate(`/song/${song.id}`)}
                    onEditDetails={setEditing}
                    onDelete={requestDelete}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <AddSongSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(id) => {
          setAdding(false);
          navigate(`/song/${id}`, { replace: true });
        }}
      />
      <EditDetailsSheet song={editing} onClose={() => setEditing(null)} />
      {dialog}
    </>
  );
}
