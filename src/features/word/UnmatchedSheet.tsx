import { useState } from 'react';
import { deleteCorrection } from '@/db/repositories/corrections';
import type { Correction } from '@/db/types';
import { Button, Sheet, useToast } from '@/ui';
import s from './UnmatchedSheet.module.css';

const describe = (c: Correction): string => {
  const p = c.patch;
  const what = [
    p.reading !== undefined ? `reading “${p.reading}”` : null,
    p.romanisation !== undefined ? `romanisation “${p.romanisation}”` : null,
    p.gloss !== undefined ? 'meaning' : null,
    p.segLang ? (p.segLang === 'en' ? 'marked as English' : 'not annotated') : null,
    p.split?.length ? 'split' : null,
    p.mergeWithNext ? 'merge' : null,
  ].filter(Boolean);
  return what.join(', ') || 'edit';
};

export interface UnmatchedSheetProps {
  corrections: readonly Correction[];
  open: boolean;
  onClose: () => void;
}

/** Corrections that found no word (the lyrics or the engine changed): kept until the user removes them (LANGUAGE_ENGINE §12). */
export function UnmatchedSheet({ corrections, open, onClose }: UnmatchedSheetProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function remove(list: readonly Correction[]) {
    setBusy(true);
    try {
      for (const c of list) await deleteCorrection(c.id);
      toast.show({
        message: list.length === 1 ? 'Correction removed' : 'Unused corrections removed',
      });
      if (list.length === corrections.length) onClose();
    } catch {
      toast.show({ message: 'Could not remove. Nothing was changed.' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Unused corrections" detent="full">
      <p className={s['lead']}>
        These corrections no longer match a word, usually because the lyrics were edited. They are
        kept until you remove them.
      </p>
      <ul className={s['list']}>
        {corrections.map((c) => (
          <li key={c.id}>
            <div>
              <p className={s['surface']}>{c.surface}</p>
              <p className={s['what']}>
                {describe(c)} · {c.lineKey === null ? 'every line' : 'one line'}
              </p>
            </div>
            <Button variant="plain" disabled={busy} onClick={() => void remove([c])}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
      {corrections.length > 1 ? (
        <Button variant="destructive" disabled={busy} onClick={() => void remove(corrections)}>
          Clean up unused corrections
        </Button>
      ) : null}
    </Sheet>
  );
}
