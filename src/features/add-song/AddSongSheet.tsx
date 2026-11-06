import { useEffect, useMemo, useState } from 'react';
import { useDebounced } from '@/app/useDebounced';
import { hasAozora } from '@/lyrics/aozora';
import { StorageError, ValidationError } from '@/db/errors';
import { clearDraft, getDraft, saveDraft } from '@/db/repositories/drafts';
import { updateSettings } from '@/db/repositories/settings';
import { createSong } from '@/db/repositories/songs';
import type { LangCode, SongSource } from '@/db/types';
import type { LrclibResult } from '@/online/lrclib';
import { detectLanguage, langAttr } from '@/engine/segment/detect';
import { LANGUAGES, LANG_NAME } from '@/features/language';
import { exportBackupFile } from '@/features/settings/backupActions';
import { validateSongInput } from '@/lyrics/parse';
import { detectRomanised } from '@/lyrics/reverse/detect';
import type { ReverseLang } from '@/lyrics/reverse/convert';
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
import { Switch } from '@/ui';
import { OnlineSearch } from './OnlineSearch';
import { RomanisedReview } from './RomanisedReview';
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

/** Add Song sheet: paste lyrics (default, dependable) or search LRCLIB (optional, PRODUCT_SPEC J2/J3). */
export function AddSongSheet({ open, onClose, onSaved }: AddSongSheetProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [language, setLanguage] = useState<LangChoice>('auto');
  const [lyrics, setLyrics] = useState('');
  const [han, setHan] = useState<'zh' | 'yue' | null>(null);
  const [hanUserChose, setHanUserChose] = useState(false);
  const [touched, setTouched] = useState({ title: false, lyrics: false });
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [usePastedReadings, setUsePastedReadings] = useState(true);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const [tab, setTab] = useState<'paste' | 'search'>('paste');
  const [source, setSource] = useState<SongSource | null>(null);
  // Romanised lyrics the user pasted before converting them; kept so the conversion can be undone.
  const [pasted, setPasted] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [romanBannerHidden, setRomanBannerHidden] = useState(false);

  const reset = () => {
    setTitle('');
    setArtist('');
    setLanguage('auto');
    setLyrics('');
    setUsePastedReadings(true);
    setHan(null);
    setHanUserChose(false);
    setTouched({ title: false, lyrics: false });
    setSaveError(null);
    setStorageFull(false);
    setTab('paste');
    setSource(null);
    setPasted(null);
    setReviewing(false);
    setRomanBannerHidden(false);
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
          setUsePastedReadings(d.usePastedReadings ?? true);
          setPasted(d.pastedRomanisation ?? null);
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
  const draftKey = JSON.stringify([title, artist, language, lyrics, usePastedReadings, pasted]);
  const debouncedDraftKey = useDebounced(draftKey, 400);
  useEffect(() => {
    if (!open || !draftLoaded) return;
    const [t, a, l, ly, useRuby, past] = JSON.parse(debouncedDraftKey) as [
      string,
      string,
      LangChoice,
      string,
      boolean,
      string | null,
    ];
    const op =
      t || a || ly
        ? saveDraft({
            title: t,
            artist: a,
            language: l,
            lyrics: ly,
            usePastedReadings: useRuby,
            ...(past === null ? {} : { pastedRomanisation: past }),
          })
        : clearDraft();
    void op.catch(() => undefined);
  }, [debouncedDraftKey, open, draftLoaded]);

  // Romanised Korean/Japanese is only looked for once typing pauses: detection parses a sample of words.
  const settledLyrics = useDebounced(lyrics, 400);
  const romanised = useMemo(() => detectRomanised(settledLyrics), [settledLyrics]);
  const offerConversion = romanised.romanised && pasted === null && !romanBannerHidden;

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
  const offersReadings = resolved === 'ja' && hasAozora(lyrics);

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
        usePastedReadings: offersReadings ? usePastedReadings : undefined,
        ...(source ? { source } : {}),
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

  function applyConversion(converted: string, lang: ReverseLang) {
    setPasted(lyrics);
    setLyrics(converted);
    setLanguage(lang);
    setHanUserChose(false);
    setReviewing(false);
  }

  function pick(r: LrclibResult) {
    if (!r.plainLyrics) return;
    setTitle(r.title);
    setArtist(r.artist ?? '');
    setLyrics(r.plainLyrics);
    setLanguage('auto');
    setHanUserChose(false);
    setTouched({ title: false, lyrics: false });
    setSource({
      kind: 'lrclib',
      trackId: r.id,
      fetchedAt: Date.now(),
      syncedLyrics: r.syncedLyrics,
      duration: r.duration,
      album: r.album,
    });
    setTab('paste');
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={requestClose}
        title={reviewing ? 'Convert Lyrics' : 'New Song'}
        leading={
          reviewing ? (
            <Button variant="plain" onClick={() => setReviewing(false)}>
              Back
            </Button>
          ) : (
            <Button variant="plain" onClick={requestClose}>
              Cancel
            </Button>
          )
        }
        trailing={
          reviewing ? undefined : (
            <Button variant="plain" disabled={!canSave} onClick={() => void save()}>
              Save
            </Button>
          )
        }
      >
        {reviewing ? (
          <RomanisedReview
            source={lyrics}
            initialLanguage={language === 'ko' || language === 'ja' ? language : romanised.language}
            onApply={applyConversion}
            onBack={() => setReviewing(false)}
          />
        ) : null}
        <div className={s['tabs']} hidden={reviewing}>
          <SegmentedControl
            label="Add song by"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'paste', label: 'Paste text' },
              { value: 'search', label: 'Search online' },
            ]}
          />
        </div>
        {reviewing ? null : tab === 'search' ? (
          <OnlineSearch initialTitle={title} initialArtist={artist} onPick={pick} />
        ) : (
          <form
            className={s['form']}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {source ? (
              <Banner
                action={
                  <Button variant="plain" onClick={() => setSource(null)}>
                    Detach
                  </Button>
                }
              >
                Lyrics from LRCLIB. Review and edit them before saving; the source is kept with the
                song.
              </Banner>
            ) : null}
            {pasted !== null ? (
              <Banner
                tone="success"
                action={
                  <Button
                    variant="plain"
                    onClick={() => {
                      setLyrics(pasted);
                      setPasted(null);
                    }}
                  >
                    Restore pasted text
                  </Button>
                }
              >
                Converted from the romanisation you pasted. Review the lyrics before saving; your
                pasted text can be restored until you save.
              </Banner>
            ) : null}
            {offerConversion ? (
              <Banner
                action={
                  <Button variant="plain" onClick={() => setReviewing(true)}>
                    Review
                  </Button>
                }
                onDismiss={() => setRomanBannerHidden(true)}
              >
                These lyrics look romanised
                {romanised.language ? ` (${LANG_NAME[romanised.language]})` : ''}. Overtone can
                suggest the original script for you to check; nothing changes until you accept.
              </Banner>
            ) : null}
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
            {offersReadings ? (
              <Switch
                label="Use readings from pasted text"
                checked={usePastedReadings}
                onChange={setUsePastedReadings}
              />
            ) : null}
          </form>
        )}
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
