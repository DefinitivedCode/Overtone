import { useState } from 'react';
import { useSession } from './useSession';
import { StorageError, ValidationError } from '@/db/errors';
import { updateDetails } from '@/db/repositories/songs';
import type { LangCode, Song } from '@/db/types';
import { LANGUAGES, LANG_NAME } from '@/features/language';
import { validateSongInput } from '@/lyrics/parse';
import { scrollFocusedIntoView } from '@/platform/keyboard';
import { Banner, Button, Select, Sheet, TextField } from '@/ui';

export interface EditDetailsSheetProps {
  song: Song | null;
  onClose: () => void;
}

export function EditDetailsSheet({ song, onClose }: EditDetailsSheetProps) {
  // Keep the last song so the form doesn't vanish during the sheet's exit animation.
  const [last, setLast] = useState<Song | null>(song);
  if (song && song !== last) setLast(song);
  const shown = song ?? last;
  const session = useSession(song !== null);
  return (
    <Sheet
      open={song !== null}
      onClose={onClose}
      title="Edit details"
      detent="full"
      leading={
        <Button variant="plain" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      {shown ? <DetailsForm key={`${shown.id}-${session}`} song={shown} onClose={onClose} /> : null}
    </Sheet>
  );
}

function DetailsForm({ song, onClose }: { song: Song; onClose: () => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? '');
  const [language, setLanguage] = useState<LangCode>(song.language);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = validateSongInput({ title, artist: artist || null, lyrics: 'x' });
  const valid = !errors.title && !errors.artist;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await updateDetails(song.id, { title, artist: artist || null, language });
      onClose();
    } catch (e) {
      setError(
        e instanceof ValidationError || e instanceof StorageError ? e.message : 'Could not save.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      style={{ display: 'grid', gap: 'var(--space-16)' }}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error ? <Banner tone="error">{error}</Banner> : null}
      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
        error={errors.title}
        required
        autoComplete="off"
      />
      <TextField
        label="Artist (optional)"
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
        error={errors.artist}
        autoComplete="off"
      />
      <Select
        label="Language"
        value={language}
        onChange={(e) => setLanguage(e.target.value as LangCode)}
        options={LANGUAGES.map((l) => ({ value: l, label: LANG_NAME[l] }))}
        hint={
          language !== song.language
            ? 'Changing the language re-processes the song. Your corrections are kept and come back if you switch back.'
            : undefined
        }
      />
      <Button type="submit" disabled={!valid || saving}>
        Save
      </Button>
    </form>
  );
}
