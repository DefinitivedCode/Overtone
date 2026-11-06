import { useEffect, useMemo, useState } from 'react';
import { LANG_NAME } from '@/features/language';
import {
  assemble,
  choiceKey,
  convertLyrics,
  convertibleCount,
  lineText,
  reviewCount,
  type Choices,
  type ReverseLang,
} from '@/lyrics/reverse/convert';
import { installedKanjiIndex, installedKoreanLexicon } from '@/lyrics/reverse/lexicon';
import type { KanjiIndex } from '@/lyrics/reverse/kanji';
import type { Lexicon } from '@/lyrics/reverse/rank';
import { Banner, Button, SegmentedControl, Switch, TextField } from '@/ui';
import s from './RomanisedReview.module.css';

export interface RomanisedReviewProps {
  /** The romanised text exactly as pasted. It is never modified. */
  source: string;
  initialLanguage: ReverseLang | null;
  onApply: (lyrics: string, language: ReverseLang) => void;
  onBack: () => void;
}

const LIMITATION: Record<ReverseLang, string> = {
  ko: 'Romanisation records sound, not spelling, so several spellings can fit one word (for example 먹어 and 머거). Hangul is proposed from the sound; a silent ㅎ or a doubled final may be missing. Tap an underlined word to try another spelling.',
  ja: 'Romaji has no kanji, so lyrics start out as kana. Particles (は/わ, を/お, へ/え) and long vowels can differ from the original. Tap an underlined word to try another reading, or katakana.',
};

/** Review step: propose original-script lyrics from pasted romanisation; nothing is applied until the user accepts. */
export function RomanisedReview({
  source,
  initialLanguage,
  onApply,
  onBack,
}: RomanisedReviewProps) {
  const [language, setLanguage] = useState<ReverseLang | null>(initialLanguage);
  const [choices, setChoices] = useState<Choices>({});
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);

  // Dictionary evidence (Korean: real words first; Japanese: kanji options) comes from the installed packs. The list is
  // shown only once that lookup has finished, so a late result can never reshuffle the options under the user's finger.
  const [evidence, setEvidence] = useState<{
    key: string;
    lexicon: Lexicon | null;
    kanji: KanjiIndex | null;
  } | null>(null);
  const evidenceKey = `${language ?? ''}
${source}`;
  useEffect(() => {
    if (language === null) return;
    let live = true;
    const done = (lexicon: Lexicon | null, kanji: KanjiIndex | null) => {
      if (live) setEvidence({ key: evidenceKey, lexicon, kanji });
    };
    if (language === 'ko') void installedKoreanLexicon(source).then((l) => done(l, null));
    else void installedKanjiIndex().then((k) => done(null, k));
    return () => {
      live = false;
    };
  }, [source, language, evidenceKey]);
  const checking = language !== null && evidence?.key !== evidenceKey;
  const lexiconNow = !checking ? (evidence?.lexicon ?? null) : null;
  const kanjiNow = !checking ? (evidence?.kanji ?? null) : null;

  const lines = useMemo(
    () =>
      language && !checking
        ? convertLyrics(source, language, { lexicon: lexiconNow, kanji: kanjiNow })
        : [],
    [source, language, checking, lexiconNow, kanjiNow],
  );
  const lyricLines = lines.filter(
    (l) => l.kind === 'lyric' && l.segments.some((x) => x.type === 'word'),
  );
  const toReview = lyricLines.reduce((n, l) => n + reviewCount(l), 0);
  const converted = convertibleCount(lines);
  const shown = onlyReview
    ? lyricLines.filter((l) => reviewCount(l) > 0 || edits[l.index] !== undefined)
    : lyricLines;

  const pickLanguage = (next: ReverseLang) => {
    setLanguage(next);
    setChoices({});
    setEdits({});
    setEditing(null);
  };

  const cycle = (line: number, seg: number, count: number) =>
    setChoices((c) => ({
      ...c,
      [choiceKey(line, seg)]: ((c[choiceKey(line, seg)] ?? 0) + 1) % count,
    }));

  return (
    <div className={s['review']}>
      <SegmentedControl
        label="Romanised language"
        value={language ?? ('' as ReverseLang)}
        onChange={pickLanguage}
        options={[
          { value: 'ko', label: LANG_NAME.ko },
          { value: 'ja', label: LANG_NAME.ja },
        ]}
      />
      {language === null ? (
        <Banner>
          Choose the language these lyrics are romanised from. Mandarin and Cantonese are not
          supported yet: pinyin and jyutping map to too many different characters.
        </Banner>
      ) : (
        <>
          <Banner tone="warning">{LIMITATION[language]}</Banner>
          <p className={s['summary']} aria-live="polite">
            {checking
              ? 'Checking the dictionary…'
              : converted === 0
                ? 'Nothing here could be read as romanisation, so there is nothing to convert.'
                : `${converted} words converted, ${toReview} with other options. Your pasted text stays available until you use the result.`}
          </p>
          {!checking ? (
            <p className={s['summary']}>
              {language === 'ko'
                ? lexiconNow
                  ? 'Options are ordered using your Korean dictionary, so real words come first.'
                  : 'Download the Korean dictionary in Settings to put real words first.'
                : kanjiNow
                  ? 'Common kanji are offered as extra options (tap a word), using your Japanese dictionary. Conjugated verbs stay in kana.'
                  : 'Download the Japanese dictionary in Settings to get kanji options.'}
            </p>
          ) : null}
          <Switch label="Only show lines to check" checked={onlyReview} onChange={setOnlyReview} />
          <ol className={s['lines']} lang={language}>
            {shown.map((line) => {
              const edited = edits[line.index];
              return (
                <li key={line.index} className={s['line']}>
                  <p className={s['source']} lang="en">
                    {line.source}
                  </p>
                  {editing === line.index ? (
                    <TextField
                      label={`Edit line ${line.index + 1}`}
                      value={edited ?? lineText(line, choices)}
                      onChange={(e) => setEdits((x) => ({ ...x, [line.index]: e.target.value }))}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  ) : (
                    <p className={s['proposal']}>
                      {edited !== undefined
                        ? edited
                        : line.segments.map((seg, i) => {
                            if (seg.type === 'text') return <span key={i}>{seg.text}</span>;
                            const idx = choices[choiceKey(line.index, i)] ?? 0;
                            const current = seg.candidates[idx] ?? seg.candidates[0]!;
                            if (seg.candidates.length < 2) return <span key={i}>{current}</span>;
                            return (
                              <button
                                key={i}
                                type="button"
                                className={s['word']}
                                data-english={!seg.converted && idx === 0}
                                aria-label={`${seg.source}: ${current}. Option ${idx + 1} of ${seg.candidates.length}. Activate for the next option.`}
                                onClick={() => cycle(line.index, i, seg.candidates.length)}
                              >
                                {current}
                              </button>
                            );
                          })}
                    </p>
                  )}
                  <div className={s['actions']}>
                    <Button
                      variant="plain"
                      onClick={() => setEditing(editing === line.index ? null : line.index)}
                    >
                      {editing === line.index ? 'Done' : 'Edit line'}
                    </Button>
                    {edited !== undefined ? (
                      <>
                        <span className={s['edited']}>Edited by hand</span>
                        <Button
                          variant="plain"
                          onClick={() => {
                            setEdits((x) => {
                              const rest = { ...x };
                              delete rest[line.index];
                              return rest;
                            });
                            setEditing(null);
                          }}
                        >
                          Reset line
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <div className={s['actions']}>
        <Button variant="plain" onClick={onBack}>
          Keep pasted text
        </Button>
        <Button
          disabled={language === null || converted === 0}
          onClick={() => language && onApply(assemble(lines, choices, edits), language)}
        >
          Use these lyrics
        </Button>
      </div>
    </div>
  );
}
