import { useState } from 'react';
import { StorageError, ValidationError } from '@/db/errors';
import { updateLyrics } from '@/db/repositories/songs';
import type { Song } from '@/db/types';
import { langAttr } from '@/engine/segment/detect';
import { hasAozora } from '@/lyrics/aozora';
import { normaliseLyrics, validateSongInput } from '@/lyrics/parse';
import { scrollFocusedIntoView } from '@/platform/keyboard';
import { Banner, Button, ConfirmDialog, Sheet, Switch, TextArea, useToast } from '@/ui';
import { summariseEdit } from './editSummary';
import { useSession } from './useSession';

export interface EditLyricsSheetProps {
  song: Song | null;
  onClose: () => void;
}

export function EditLyricsSheet({ song, onClose }: EditLyricsSheetProps) {
  const [last, setLast] = useState<Song | null>(song);
  if (song && song !== last) setLast(song);
  const shown = song ?? last;
  const session = useSession(song !== null);
  return shown ? (
    <LyricsEditor
      key={`${shown.id}-${session}`}
      song={shown}
      open={song !== null}
      onClose={onClose}
    />
  ) : null;
}

function LyricsEditor({ song, open, onClose }: { song: Song; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(song.rawLyrics);
  const [usePastedReadings, setUsePastedReadings] = useState(song.usePastedReadings ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const offersReadings =
    (song.language === 'ja' || song.usePastedReadings === true) && hasAozora(text);
  const changed =
    normaliseLyrics(text) !== song.rawLyrics ||
    (offersReadings && usePastedReadings !== (song.usePastedReadings ?? false));
  const errors = validateSongInput({ title: song.title, artist: null, lyrics: text });

  const requestClose = () => (changed ? setConfirm(true) : onClose());

  async function save() {
    if (errors.lyrics) return;
    setSaving(true);
    try {
      const r = await updateLyrics(song.id, text, {
        usePastedReadings: offersReadings ? usePastedReadings : undefined,
      });
      toast.show({ message: summariseEdit(r.diff) });
      onClose();
    } catch (e) {
      setError(
        e instanceof ValidationError || e instanceof StorageError
          ? e.message
          : 'Could not save the lyrics.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={requestClose}
        title="Edit lyrics"
        leading={
          <Button variant="plain" onClick={requestClose}>
            Cancel
          </Button>
        }
        trailing={
          <Button
            variant="plain"
            disabled={!changed || !!errors.lyrics || saving}
            onClick={() => void save()}
          >
            Save
          </Button>
        }
      >
        <div style={{ display: 'grid', gap: 'var(--space-12)', paddingBottom: 'var(--space-24)' }}>
          {error ? <Banner tone="error">{error}</Banner> : null}
          <TextArea
            label="Lyrics"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            error={
              errors.lyrics && /too (long|many)/.test(errors.lyrics) ? errors.lyrics : undefined
            }
            minRows={12}
            lang={langAttr(song.language, text)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            hint="Lines you don’t change keep their learned state and corrections."
          />
          {offersReadings ? (
            <Switch
              label="Use readings from pasted text"
              checked={usePastedReadings}
              onChange={setUsePastedReadings}
            />
          ) : null}
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        title="Discard your changes?"
        message="Your edits to these lyrics haven’t been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setConfirm(false);
          onClose();
        }}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
