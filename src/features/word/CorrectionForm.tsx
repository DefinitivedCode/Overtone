import { useState } from 'react';
import {
  createCorrection,
  deleteCorrection,
  updateCorrection,
} from '@/db/repositories/corrections';
import type { Correction, CorrectionPatch, LangCode } from '@/db/types';
import { parseJyutping, parsePinyin, romajiToKana } from '@/engine/input';
import { tokenRoman } from '@/engine/romanLine';
import { langAttr } from '@/engine/segment/detect';
import { Banner, Button, Select, SegmentedControl, TextArea, TextField, useToast } from '@/ui';
import type { WordTarget } from './target';
import s from './CorrectionForm.module.css';

const READING_LABEL: Record<LangCode, string> = {
  ko: 'Romanisation',
  ja: 'Reading (kana or romaji)',
  zh: 'Pinyin',
  yue: 'Jyutping',
};
const READING_HINT: Record<LangCode, string> = {
  ko: 'How you want this word romanised, for example saranghae.',
  ja: 'Type kana, or romaji such as tōkyō or toukyou: it is converted to kana.',
  zh: 'One syllable per character, with tone marks or numbers: nǐ hǎo or ni3 hao3.',
  yue: 'One syllable per character with a tone number 1–6: ngo5 dei6.',
};

/** What the reading field starts with: the reading the app currently shows for this word. */
function currentReading(t: WordTarget['token'], language: LangCode): string {
  if (language === 'ja') return t.reading ?? '';
  if (language === 'ko') return tokenRoman(t);
  if (language === 'zh') return t.roman ?? '';
  return t.reading ?? '';
}

interface Check {
  error: string | null;
  warning: string | null;
  preview: string | null;
}

function check(language: LangCode, surface: string, typed: string, changed: boolean): Check {
  const none: Check = { error: null, warning: null, preview: null };
  if (!changed || !typed.trim()) return none;
  const chars = [...surface].length;
  if (language === 'ja') {
    const kana = romajiToKana(typed);
    return kana
      ? { ...none, preview: kana }
      : { ...none, error: 'Use kana, or romaji such as tōkyō.' };
  }
  if (language === 'zh') {
    const syllables = parsePinyin(typed);
    if (!syllables) return { ...none, error: 'That does not look like pinyin.' };
    if (syllables.length !== chars)
      return {
        ...none,
        error: `Give ${chars} syllable${chars === 1 ? '' : 's'}, one per character.`,
      };
    const odd = syllables.filter((x) => !x.known).map((x) => x.syllable);
    return odd.length
      ? {
          ...none,
          warning: `${odd.join(', ')} is not a standard pinyin syllable. Check the spelling.`,
        }
      : none;
  }
  if (language === 'yue') {
    const syllables = parseJyutping(typed);
    if (!syllables)
      return { ...none, error: 'Use letters followed by a tone number 1–6, like ngo5.' };
    if (syllables.length !== chars)
      return {
        ...none,
        error: `Give ${chars} syllable${chars === 1 ? '' : 's'}, one per character.`,
      };
  }
  return none;
}

export interface CorrectionFormProps {
  target: WordTarget;
  language: LangCode;
  songId: string;
  corrections: readonly Correction[];
  onDone: () => void;
  onCancel: () => void;
}

/** The correction editor (J8): reading, meaning, segment type, split/merge, scope, revert. */
export function CorrectionForm({
  target,
  language,
  songId,
  corrections,
  onDone,
  onCancel,
}: CorrectionFormProps) {
  const toast = useToast();
  const t = target.token;
  const mine = corrections.filter((c) => t.correctionIds?.includes(c.id));
  const valueRec = mine.find(
    (c) =>
      c.patch.reading !== undefined ||
      c.patch.romanisation !== undefined ||
      c.patch.gloss !== undefined,
  );
  const initialReading = currentReading(t, language);
  const [reading, setReading] = useState(initialReading);
  const [roman, setRoman] = useState(t.userRoman ?? '');
  const [gloss, setGloss] = useState(t.userGloss?.text ?? '');
  const [mode, setMode] = useState<'replace' | 'prepend'>(t.userGloss?.mode ?? 'replace');
  const [segment, setSegment] = useState<'normal' | 'en' | 'none'>('normal');
  const [splits, setSplits] = useState<ReadonlySet<number>>(new Set());
  const [scope, setScope] = useState<'line' | 'song'>(valueRec?.lineKey === null ? 'song' : 'line');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changedReading = reading.trim() !== initialReading.trim();
  const verdict = check(language, t.surface, reading, changedReading);
  const chars = [...t.surface];
  const canSplit = chars.length > 1;

  const place = (): Pick<Correction, 'lineKey' | 'occurrence'> =>
    scope === 'song'
      ? { lineKey: null, occurrence: null }
      : { lineKey: target.lineKey, occurrence: target.repeats > 1 ? target.occurrence : null };

  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      toast.show({ message: done });
      onDone();
    } catch {
      setError('Could not save. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  const create = (patch: CorrectionPatch) =>
    createCorrection({ songId, ...place(), surface: t.surface, language, patch });

  async function save() {
    if (verdict.error) return;
    if (segment !== 'normal')
      return run(async () => void (await create({ segLang: segment })), 'Saved');
    if (splits.size > 0)
      return run(async () => {
        // Offsets are in UTF-16 units within the surface.
        let at = 0;
        const cuts: number[] = [];
        chars.forEach((c, i) => {
          at += c.length;
          if (splits.has(i + 1)) cuts.push(at);
        });
        await create({ split: cuts });
      }, 'Word split');
    const patch: CorrectionPatch = { ...(valueRec?.patch ?? {}) };
    if (changedReading && reading.trim()) patch.reading = reading.trim();
    if (language === 'ja' && roman.trim() !== (t.userRoman ?? '')) {
      if (roman.trim()) patch.romanisation = roman.trim();
      else delete patch.romanisation;
    }
    if (gloss.trim()) {
      patch.gloss = gloss.trim();
      patch.glossMode = mode;
    } else {
      delete patch.gloss;
      delete patch.glossMode;
    }
    const empty = Object.keys(patch).length === 0;
    if (empty && !valueRec) return onCancel();
    return run(async () => {
      if (valueRec && empty) await deleteCorrection(valueRec.id);
      else if (valueRec) await updateCorrection(valueRec.id, { patch, ...place() });
      else await create(patch);
    }, 'Saved');
  }

  const revert = () =>
    run(async () => {
      for (const c of mine) await deleteCorrection(c.id);
    }, 'Reverted to the generated reading');

  const merge = () => run(async () => void (await create({ mergeWithNext: 1 })), 'Words merged');

  return (
    <form
      className={s['form']}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error ? <Banner tone="error">{error}</Banner> : null}

      <TextField
        label={READING_LABEL[language]}
        hint={verdict.preview ? `Will be stored as ${verdict.preview}` : READING_HINT[language]}
        error={verdict.error ?? undefined}
        value={reading}
        lang={language === 'ja' || language === 'ko' ? undefined : langAttr(language, '')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setReading(e.target.value)}
      />
      {verdict.warning ? <Banner tone="warning">{verdict.warning}</Banner> : null}

      {language === 'ja' ? (
        <TextField
          label="Romanisation (optional)"
          hint="Leave empty to derive it from the reading."
          value={roman}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setRoman(e.target.value)}
        />
      ) : null}

      <TextArea
        label="Meaning (optional)"
        minRows={2}
        value={gloss}
        maxLength={300}
        onChange={(e) => setGloss(e.target.value)}
      />
      {gloss.trim() ? (
        <SegmentedControl
          label="Meaning placement"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'replace', label: 'Replace dictionary' },
            { value: 'prepend', label: 'Show first' },
          ]}
        />
      ) : null}

      <Select
        label="Treat this word as"
        value={segment}
        onChange={(e) => setSegment(e.target.value as 'normal' | 'en' | 'none')}
        options={[
          { value: 'normal', label: 'A word to annotate' },
          { value: 'en', label: 'English' },
          { value: 'none', label: 'Do not annotate' },
        ]}
      />

      {canSplit || target.next ? (
        <fieldset className={s['group']}>
          <legend className={s['legend']}>Word boundaries</legend>
          {canSplit ? (
            <>
              <p className={s['hint']}>Tap between characters to split this word there.</p>
              <div className={s['chars']} lang={langAttr(language, t.surface)}>
                {chars.map((c, i) => (
                  <span key={i} className={s['charWrap']}>
                    <span className={s['char']}>{c}</span>
                    {i < chars.length - 1 ? (
                      <button
                        type="button"
                        className={s['cut']}
                        aria-pressed={splits.has(i + 1)}
                        aria-label={`Split after ${c}`}
                        onClick={() =>
                          setSplits((prev) => {
                            const next = new Set(prev);
                            if (!next.delete(i + 1)) next.add(i + 1);
                            return next;
                          })
                        }
                      />
                    ) : null}
                  </span>
                ))}
              </div>
            </>
          ) : null}
          {target.next ? (
            <Button variant="secondary" disabled={busy} onClick={() => void merge()}>
              Merge with next word ({target.next.surface})
            </Button>
          ) : null}
        </fieldset>
      ) : null}

      <SegmentedControl
        label="Apply to"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'line', label: 'This line' },
          { value: 'song', label: 'Every line in this song' },
        ]}
      />

      <div className={s['actions']}>
        <Button type="submit" disabled={busy || !!verdict.error}>
          Save
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {mine.length > 0 ? (
          <Button variant="destructive" disabled={busy} onClick={() => void revert()}>
            Revert to generated
          </Button>
        ) : null}
      </div>
    </form>
  );
}
