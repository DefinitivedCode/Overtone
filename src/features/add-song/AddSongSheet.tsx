import { useEffect, useMemo, useState } from 'react';
import { useDebounced } from '@/app/useDebounced';
import { StorageError, ValidationError } from '@/db/errors';
import { clearDraft, getDraft, saveDraft } from '@/db/repositories/drafts';
import { updateSettings } from '@/db/repositories/settings';
import { createSong } from '@/db/repositories/songs';
import type { LangCode } from '@/db/types';
import { detectLanguage, langAttr } from '@/engine/segment/detect';
import { LANGUAGES, LANG_NAME } from '@/features/language';
import { exportBackupFile } from '@/features/settings/backupActions';
import { validateSongInput } from '@/lyrics/parse';
import { scrollFocusedIntoView } from '@/platform/keyboard';
import { requestPersistence } from '@/platform/storage';
import {
  Banner,
  Button,
  ConfirmDialog,
  SegmentedControl,
  Select,
  Sheet,
  TextArea,
  TextField,
} from '@/ui';
import s from './AddSongSheet.module.css';

type LangChoice = 'auto' | LangCode;

export interface AddSongSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: (songId: string) => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  ...LANGUAGES.map((l) => ({ value: l, label: LANG_NAME[l] })),
];

/** Add Song sheet, "Paste lyrics" path (PRODUCT_SPEC J2). The Search tab arrives with M12. */
export function AddSongSheet({ open, onClose, onSaved }: AddSongSheetProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [language, setLanguage] = useState<LangChoice>('auto');
  const [lyrics, setLyrics] = useState('');
  const [han, setHan] = useState<'zh' | 'yue' | null>(null);
  const [hanUserChose, setHanUserChose] = useState(false);
  const [touched, setTouched] = useState({ title: false, lyrics: false });
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [storageFull, setStorageFull] = useState(false);

  const reset = () => {
    setTitle('');
    setArtist('');
    setLanguage('auto');
    setLyrics('');
    setHan(null);
    setHanUserChose(false);
    setTouched({ title: false, lyrics: false });
    setSaveError(null);
    setStorageFull(false);
  };

  // Restore an autosaved draft each time the sheet opens (J2.6).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getDraft()
      .then((d) => {
        if (cancelled) return;
        if (d) {
          setTitle(d.title);
          setArtist(d.artist);
          setLanguage(d.language);
          setLyrics(d.lyrics);
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setDraftLoaded(true));
    return () => {
      cancelled = true;
      setDraftLoaded(false);
    };
  }, [open]);

  const hasContent = title !== '' || artist !== '' || lyrics !== '';
  const draftKey = JSON.stringify([title, artist, language, lyrics]);
  const debouncedDraftKey = useDebounced(draftKey, 400);
  useEffect(() => {
    if (!open || !draftLoaded) return;
    const [t, a, l, ly] = JSON.parse(debouncedDraftKey) as [string, string, LangChoice, string];
    const op =
      t || a || ly ? saveDraft({ title: t, artist: a, language: l, lyrics: ly }) : clearDraft();
    void op.catch(() => undefined);
  }, [debouncedDraftKey, open, draftLoaded]);

  // Computed synchronously: saving must never use a stale detection from an earlier edit.
  const detection = useMemo(() => detectLanguage(lyrics), [lyrics]);

  // Han-only text: the detector's guess is pre-selected until the user chooses, and labelled as a guess.
  const needsHanChoice = language === 'auto' && detection.needsChoice;
  const hanValue: 'zh' | 'yue' | null = hanUserChose
    ? han
    : needsHanChoice
      ? (detection.suggestion ?? null)
      : null;

  const resolved: LangCode | null =
    language !== 'auto' ? language : (detection.language ?? (needsHanChoice ? hanValue : null));

  const errors = validateSongInput({ title, artist: artist || null, lyrics });
  const tooLong = (e: string | undefined) => !!e && /too (long|many)/.test(e);
  const titleError = touched.title || tooLong(errors.title) ? errors.title : undefined;
  const lyricsError = touched.lyrics || tooLong(errors.lyrics) ? errors.lyrics : undefined;
  const canSave = Object.keys(errors).length === 0 && resolved !== null && !saving;

  let languageHint: string | undefined;
  if (language === 'auto' && lyrics.trim() !== '') {
    if (detection.language)
      languageHint = `Looks like ${LANG_NAME[detection.language]}${detection.confidence === 'high' ? '' : ' (not certain)'}`;
    else if (needsHanChoice) languageHint = 'Chinese — choose Mandarin or Cantonese below';
    else languageHint = 'Couldn’t detect a language — choose one.';
  }

  const requestClose = () => (hasContent ? setConfirmDiscard(true) : onClose());
  const discard = () => {
    setConfirmDiscard(false);
    void clearDraft().catch(() => undefined);
    reset();
    onClose();
  };

  async function save() {
    if (!canSave || !resolved) return;
    setSaving(true);
    setSaveError(null);
    try {
      const song = await createSong({
        title,
        artist: artist || null,
        language: resolved,
        languageDetected: language === 'auto',
        rawLyrics: lyrics,
      });
      await clearDraft().catch(() => undefined);
      reset();
      // Ask the browser to protect storage after the first successful save (J12.4); non-blocking.
      void requestPersistence()
        .then((persisted) =>
          updateSettings((x) => ({ ...x, storage: { persistRequested: true, persisted } })),
        )
        .catch(() => undefined);
      onSaved(song.id);
    } catch (e) {
      if (e instanceof ValidationError) {
        setTouched({ title: true, lyrics: true });
        setSaveError(e.message);
      } else if (e instanceof StorageError) {
        setSaveError(e.message);
        setStorageFull(true);
      } else setSaveError('Something went wrong. Nothing was saved.');
    } finally {
      setSaving(false);
    }
  }

  const lyricsLang = resolved ? langAttr(resolved, lyrics) : undefined;

  return (
    <>
      <Sheet
        open={open}
        onClose={requestClose}
        title="New Song"
        leading={
          <Button variant="plain" onClick={requestClose}>
            Cancel
          </Button>
        }
        trailing={
          <Button variant="plain" disabled={!canSave} onClick={() => void save()}>
            Save
          </Button>
        }
      >
        <form
          className={s['form']}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {saveError ? (
            <Banner
              tone="error"
              action={
                storageFull ? (
                  <Button
                    variant="plain"
                    onClick={() => void exportBackupFile().catch(() => undefined)}
                  >
                    Export backup
                  </Button>
                ) : undefined
              }
            >
              {saveError}
            </Banner>
          ) : null}
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, title: true }))}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            error={titleError}
            required
            enterKeyHint="next"
            autoComplete="off"
          />
          <TextField
            label="Artist (optional)"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            error={errors.artist}
            enterKeyHint="next"
            autoComplete="off"
          />
          <Select
            label="Language"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as LangChoice);
              setHanUserChose(false);
            }}
            options={LANGUAGE_OPTIONS}
            hint={languageHint}
          />
          {needsHanChoice ? (
            <div className={s['han']}>
              <SegmentedControl
                label="Chinese language"
                value={hanValue ?? 'zh'}
                options={[
                  { value: 'zh', label: 'Mandarin' },
                  { value: 'yue', label: 'Cantonese' },
                ]}
                onChange={(v) => {
                  setHan(v);
                  setHanUserChose(true);
                }}
              />
              <p className={s['hanHint']}>
                {hanUserChose
                  ? `Using ${hanValue === 'yue' ? 'Cantonese' : 'Mandarin'}.`
                  : `Suggested: ${detection.suggestion === 'yue' ? 'Cantonese' : 'Mandarin'} — this is only a guess, please confirm.`}
              </p>
            </div>
          ) : null}
          <TextArea
            label="Lyrics"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, lyrics: true }))}
            onFocus={(e) => scrollFocusedIntoView(e.currentTarget)}
            error={lyricsError}
            minRows={8}
            lang={lyricsLang}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="enter"
          />
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this song?"
        message="What you typed or pasted will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
