import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { deleteCorrection } from '@/db/repositories/corrections';
import type { Correction, LangCode } from '@/db/types';
import type { Token } from '@/engine/model';
import { romaniseLine } from '@/engine/romanLine';
import type { RomanPrefs } from '@/engine/romanLine';
import { langAttr } from '@/engine/segment/detect';
import { PackPrompt } from '@/features/packs/PackUi';
import { useInstalledPacks } from '@/features/packs/packs';
import { Button, IconButton, Sheet, useToast } from '@/ui';
import { CorrectionForm } from './CorrectionForm';
import type { WordTarget } from './target';
import { lookupWord, packForLookup } from './lookup';
import type { WordLookup } from './lookup';
import s from './WordSheet.module.css';

const SENSE_LIMIT = 5;

const POS_LABEL: Record<string, string> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  intj: 'interjection',
  pron: 'pronoun',
  num: 'numeral',
  det: 'determiner',
  particle: 'particle',
  name: 'proper noun',
  suffix: 'suffix',
  prefix: 'prefix',
  counter: 'counter',
  conj: 'conjunction',
  phrase: 'phrase',
  proverb: 'proverb',
  contraction: 'contraction',
  exp: 'expression',
  prt: 'particle',
};
/** JMdict part-of-speech codes are terse ("v1", "adj-i"); group them into plain words. */
function posLabel(pos: string): string {
  const known = POS_LABEL[pos];
  if (known) return known;
  if (pos.startsWith('v')) return 'verb';
  if (pos.startsWith('adj')) return 'adjective';
  if (pos.startsWith('adv')) return 'adverb';
  if (pos.startsWith('n')) return 'noun';
  return pos;
}

export interface WordSheetProps {
  target: WordTarget | null;
  language: LangCode;
  prefs: RomanPrefs;
  songId: string;
  corrections: readonly Correction[];
  open: boolean;
  onClose: () => void;
}

export function WordSheet({
  target,
  language,
  prefs,
  songId,
  corrections,
  open,
  onClose,
}: WordSheetProps) {
  const token = target?.token ?? null;
  // Hanja or foreign text in this song that the engine could not read: nothing to look up, but it can be corrected.
  const unreadable =
    !!token &&
    token.kind === 'word' &&
    token.confidence === 'none' &&
    token.lang !== language &&
    token.lang !== 'en' &&
    token.corrected !== true;
  const lineIndex = target?.lineIndex ?? 0;
  const toast = useToast();
  const [editingFor, setEditingFor] = useState<WordTarget | null>(null);
  const editing = editingFor !== null && editingFor === target;
  const [result, setResult] = useState<{ token: Token; lookup: WordLookup } | null>(null);
  const [expandedFor, setExpandedFor] = useState<Token | null>(null);
  const expanded = expandedFor !== null && expandedFor === token;
  // A pack that finishes installing while the sheet is open refreshes the result.
  const installed = useInstalledPacks();
  const installedKey = installed?.map((p) => `${p.id}@${p.version}`).join(',') ?? '';
  useEffect(() => {
    if (!token || !open || token.kind === 'latin' || token.kind === 'symbol' || unreadable) return;
    let active = true;
    void lookupWord(token, language).then((lookup) => {
      if (active) setResult({ token, lookup });
    });
    return () => {
      active = false;
    };
  }, [token, language, open, installedKey, unreadable]);

  const shown = token && result?.token === token ? result.lookup : null;
  const isParticle = token?.kind === 'particle' || (!!token?.particleGloss && !token.dict);
  const roman = token ? romaniseLine([token], prefs) : '';
  const reading =
    token?.lang === 'ja' && token.reading
      ? [token.reading, roman].filter((x) => x && x !== token.surface).join(' · ')
      : roman && roman !== token?.surface
        ? roman
        : '';
  const uncertain = token ? token.confidence === 'low' || token.confidence === 'medium' : false;

  const user = token?.userGloss;
  const plainMarked =
    token?.corrected === true && (token.kind === 'latin' || token.kind === 'symbol');
  const entries = shown?.status === 'ok' && user?.mode !== 'replace' ? shown.entries : [];
  const total = entries.reduce((n, e) => n + e.senses.length, 0);
  // How many senses of each entry fit the limit (the first entries fill it first).
  const visible = entries.map((entry, i) => {
    const before = entries.slice(0, i).reduce((n, e) => n + e.senses.length, 0);
    return expanded
      ? entry.senses.length
      : Math.max(0, Math.min(entry.senses.length, SENSE_LIMIT - before));
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? `Correct ${token?.surface ?? ''}` : (token?.surface ?? 'Word')}
      detent={editing ? 'full' : 'half'}
      restoreFocus={() =>
        token
          ? document.querySelector<HTMLElement>(
              `[data-word="${token.start}"][data-line="${lineIndex}"]`,
            )
          : null
      }
      trailing={
        <IconButton label="Close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </IconButton>
      }
    >
      {token && target && editing ? (
        <CorrectionForm
          key={`${target.lineKey}:${target.token.start}`}
          target={target}
          language={language}
          songId={songId}
          corrections={corrections}
          onDone={() => {
            setEditingFor(null);
            onClose();
          }}
          onCancel={() => setEditingFor(null)}
        />
      ) : token && target ? (
        <div className={s['body']}>
          {reading ? (
            <p className={s['reading']} lang={langAttr(language, reading)}>
              {reading}
            </p>
          ) : null}

          {isParticle && token.particleGloss ? (
            <p className={s['gloss']}>
              <span className={s['label']}>Particle</span> {token.particleGloss}
            </p>
          ) : null}

          {shown === null && !isParticle && !plainMarked && !unreadable ? (
            <p className={s['quiet']}>Looking up…</p>
          ) : null}

          {shown?.status === 'ok' ? (
            <>
              {shown.dictionaryForm || token.lemma ? (
                <p className={s['form']}>
                  Dictionary form{' '}
                  <span lang={langAttr(language, shown.dictionaryForm ?? token.lemma ?? '')}>
                    {shown.dictionaryForm ?? token.lemma}
                  </span>
                </p>
              ) : null}
              {entries.map((entry, i) => {
                const rows = entry.senses.slice(0, visible[i]);
                if (rows.length === 0) return null;
                return (
                  <section key={i} className={s['entry']}>
                    {entries.length > 1 ? (
                      <h3 className={s['entryHead']}>
                        <span lang={langAttr(language, entry.form)}>{entry.form}</span>
                        {entry.reading ? (
                          <span className={s['quiet']}> · {entry.reading}</span>
                        ) : null}
                      </h3>
                    ) : null}
                    <ol className={s['senses']}>
                      {rows.map((sense, j) => (
                        <li key={j}>
                          {sense.pos ? (
                            <span className={s['pos']}>{posLabel(sense.pos)}</span>
                          ) : null}{' '}
                          {sense.gloss.join('; ')}
                        </li>
                      ))}
                    </ol>
                    <p className={s['source']}>Source: {entry.source}</p>
                  </section>
                );
              })}
              {!expanded && total > SENSE_LIMIT ? (
                <Button variant="plain" onClick={() => setExpandedFor(token)}>
                  Show more
                </Button>
              ) : null}
            </>
          ) : null}

          {unreadable ? (
            <p className={s['quiet']}>
              No reading found for this word. If you know it, add one with Correct….
            </p>
          ) : null}

          {shown?.status === 'no-entry' && !isParticle ? (
            <p className={s['quiet']}>
              {`No dictionary entry was found for “${token.surface}”. Names, slang and conjugated forms are sometimes missing.`}
            </p>
          ) : null}

          {shown?.status === 'no-pack' ? (
            <div className={s['prompt']}>
              <p className={s['quiet']}>
                Meanings need the {packForLookup(language).name} data, a one-time download that then
                works offline.
              </p>
              <PackPrompt packId={shown.packId} name={shown.packName} />
            </div>
          ) : null}

          {user ? (
            <p className={s['gloss']}>
              <span className={s['label']}>Your meaning</span> {user.text}
            </p>
          ) : null}

          {plainMarked ? (
            <p className={s['quiet']}>
              {token.kind === 'latin'
                ? 'You marked this as English, so it is not annotated.'
                : 'You marked this word as not annotated.'}
            </p>
          ) : null}

          {uncertain ? (
            <p className={s['note']}>
              {token.notes.includes('lemma-guess')
                ? 'The dictionary form was guessed from the ending. Check it.'
                : /^[㄰-㆏]+$/u.test(token.surface)
                  ? 'Typed as separate letters, so it is read letter by letter. Check it.'
                  : 'This reading depends on context. Check it.'}
            </p>
          ) : null}
          {token.corrected ? (
            <p className={s['edited']}>
              <span>Edited by you</span>
              <Button
                variant="plain"
                onClick={() =>
                  void Promise.all(
                    corrections
                      .filter((c) => token.correctionIds?.includes(c.id))
                      .map((c) => deleteCorrection(c.id)),
                  )
                    .then(() => {
                      toast.show({ message: 'Reverted to the generated reading' });
                      onClose();
                    })
                    .catch(() => toast.show({ message: 'Could not revert. Nothing was changed.' }))
                }
              >
                Revert
              </Button>
            </p>
          ) : null}
          {!plainMarked ? (
            <Button variant="secondary" onClick={() => setEditingFor(target)}>
              Correct…
            </Button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
