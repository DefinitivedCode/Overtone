import { useState } from 'react';
import type { ReactNode } from 'react';
import { TopBar } from '@/app/TopBar';
import { TEXT_SIZE_LABELS, setTextSize, setTheme, useTextSize, useTheme } from '@/app/preferences';
import type { TextSize, ThemePref } from '@/app/preferences';
import { APP_NAME, APP_VERSION } from '@/app/version';
import { useSettings } from '@/db/hooks';
import { updateSettings } from '@/db/repositories/settings';
import { SegmentedControl, Switch, useToast } from '@/ui';
import { DEFAULT_ROMAN_PREFS } from '@/engine/romanLine';
import type { RomanPrefs } from '@/engine/romanLine';
import { LANG_NAME } from '@/features/language';
import { PackSettingsRows } from '@/features/packs/PackUi';
import { BackupSection } from './BackupSection';
import s from './SettingsScreen.module.css';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** A row inside a grouped card: optional title, the control, optional explanation. */
function Row({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <div className={s['item']}>
      {title ? <p className={s['itemTitle']}>{title}</p> : null}
      {children}
      {hint ? <p className={s['itemHint']}>{hint}</p> : null}
    </div>
  );
}

/** Native disclosure: keyboard and screen-reader support come for free. */
function Disclosure({
  title,
  value,
  children,
}: {
  title: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <details className={s['disclosure']}>
      <summary className={s['summary']}>
        <span>{title}</span>
        {value ? <span className={s['summaryValue']}>{value}</span> : null}
      </summary>
      <div className={s['disclosureBody']}>{children}</div>
    </details>
  );
}

export function SettingsScreen() {
  const theme = useTheme();
  const size = useTextSize();
  const settings = useSettings();
  const toast = useToast();
  const jaStored = settings?.romanisation.ja;
  const [optJa, setOptJa] = useState<Partial<RomanPrefs['ja']>>({});
  const ja = { ...(jaStored ?? DEFAULT_ROMAN_PREFS.ja), ...optJa };
  const pendingJa = Object.entries(optJa);
  if (
    pendingJa.length &&
    jaStored &&
    pendingJa.every(([key, value]) => jaStored[key as keyof RomanPrefs['ja']] === value)
  )
    setOptJa({});
  const setJa = (patch: Partial<RomanPrefs['ja']>) => {
    setOptJa((current) => ({ ...current, ...patch }));
    void updateSettings((x) => ({
      ...x,
      romanisation: { ...x.romanisation, ja: { ...x.romanisation.ja, ...patch } },
    })).catch(() => {
      setOptJa((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key, value]) => patch[key as keyof RomanPrefs['ja']] !== value,
          ),
        ),
      );
      toast.show({ message: 'Could not save Japanese romanisation preferences.' });
    });
  };
  const [optKo, setOptKo] = useState<'pronunciation' | 'letters' | null>(null);
  // Optimistic Mandarin options (reflect the click at once; the stored value catches up).
  const [optZh, setOptZh] = useState<Partial<{ tones: 'marks' | 'numbers'; sandhi: boolean }>>({});
  const zhStored = settings?.romanisation.zh;
  const zh = { tones: zhStored?.tones ?? 'marks', sandhi: zhStored?.sandhi ?? false, ...optZh };
  if (
    Object.keys(optZh).length > 0 &&
    zhStored &&
    Object.entries(optZh).every(([k, v]) => zhStored[k as 'tones' | 'sandhi'] === v)
  )
    setOptZh({});
  const setZh = (patch: Partial<{ tones: 'marks' | 'numbers'; sandhi: boolean }>) => {
    setOptZh((o) => ({ ...o, ...patch }));
    void updateSettings((x) => ({
      ...x,
      romanisation: { ...x.romanisation, zh: { ...x.romanisation.zh, ...patch } },
    }));
  };
  const [optEmphasis, setOptEmphasis] = useState<'reading' | 'original' | null>(null);
  const emphasis = optEmphasis ?? settings?.display.learnEmphasis ?? 'reading';
  if (optEmphasis !== null && settings?.display.learnEmphasis === optEmphasis) setOptEmphasis(null);
  const koMode = optKo ?? settings?.romanisation.ko.mode ?? 'pronunciation';
  if (optKo !== null && settings?.romanisation.ko.mode === optKo) setOptKo(null);
  return (
    <>
      <TopBar back={{ to: '/', label: 'Library' }} />
      <main className="screen">
        <h1 className="large-title">Settings</h1>

        <section className={s['group']} aria-labelledby="lyrics-h">
          <h2 id="lyrics-h" className={s['groupTitle']}>
            Lyrics &amp; appearance
          </h2>
          <div className={s['card']}>
            <Row title="Theme">
              <SegmentedControl
                label="Theme"
                value={theme}
                options={THEME_OPTIONS}
                onChange={setTheme}
              />
            </Row>
            <Row
              title="Learn layout"
              hint="Reading first puts the romanisation on top, with English words in the same row. Japanese keeps furigana above the kanji."
            >
              <SegmentedControl
                label="Learn layout"
                value={emphasis}
                options={[
                  { value: 'reading', label: 'Reading first' },
                  { value: 'original', label: 'Original first' },
                ]}
                onChange={(learnEmphasis) => {
                  setOptEmphasis(learnEmphasis);
                  void updateSettings((x) => ({
                    ...x,
                    display: { ...x.display, learnEmphasis },
                  })).catch(() => {
                    setOptEmphasis(null);
                    toast.show({ message: 'Could not save the Learn layout.' });
                  });
                }}
              />
            </Row>
            <Row
              title="Lyric text size"
              hint="Applies to lyrics in every mode. Browser zoom still works."
            >
              <label className={s['sizeRow']}>
                <span className={s['sizeLabel']}>{TEXT_SIZE_LABELS[size]}</span>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={size}
                  aria-label="Lyric text size"
                  aria-valuetext={TEXT_SIZE_LABELS[size]}
                  onChange={(e) => setTextSize(Number(e.target.value) as TextSize)}
                />
              </label>
              <div className={s['preview']} aria-label="Preview">
                <p lang="ko">사랑해</p>
                <p lang="ja">愛してる</p>
                <p lang="zh-Hans">我爱你</p>
                <p lang="zh-HK">我愛你</p>
                <p lang="en" className="latin">
                  I love you
                </p>
              </div>
            </Row>
          </div>
        </section>

        <section className={s['group']} aria-labelledby="roman-h">
          <h2 id="roman-h" className={s['groupTitle']}>
            Pronunciation
          </h2>
          <div className={s['card']}>
            <Disclosure
              title={LANG_NAME.ko}
              value={koMode === 'pronunciation' ? 'As pronounced' : 'Letter by letter'}
            >
              <SegmentedControl
                label="Korean romanisation"
                value={koMode}
                options={[
                  { value: 'pronunciation', label: 'Pronunciation' },
                  { value: 'letters', label: 'Letter by letter' },
                ]}
                onChange={(mode) => {
                  setOptKo(mode);
                  void updateSettings((x) => ({
                    ...x,
                    romanisation: { ...x.romanisation, ko: { mode } },
                  }));
                }}
              />
              <p className={s['itemHint']}>
                <strong>Pronunciation</strong> shows how words sound (<span lang="ko">좋다</span> →
                jota); <strong>Letter by letter</strong> spells each syllable (johda). Splitting
                romanisation into syllables is a Karaoke option, set on the song.
              </p>
            </Disclosure>
            <Disclosure
              title={LANG_NAME.ja}
              value={ja.longVowels === 'macron' ? 'Macrons' : 'Doubled vowels'}
            >
              <SegmentedControl
                label="Japanese long vowels"
                value={ja.longVowels}
                options={[
                  { value: 'macron', label: 'Macrons (tōkyō)' },
                  { value: 'doubled', label: 'Doubled (toukyou)' },
                ]}
                onChange={(longVowels) => setJa({ longVowels })}
              />
              <Switch
                label="Show romaji in Learn mode"
                checked={ja.showRomajiLine}
                onChange={(showRomajiLine) => setJa({ showRomajiLine })}
              />
              <Switch
                label="Show furigana for kana-only words"
                checked={ja.furiganaForKanaWords}
                onChange={(furiganaForKanaWords) => setJa({ furiganaForKanaWords })}
              />
            </Disclosure>
            <Disclosure
              title={LANG_NAME.zh}
              value={zh.tones === 'marks' ? 'Tone marks' : 'Tone numbers'}
            >
              <SegmentedControl
                label="Mandarin tones"
                value={zh.tones}
                options={[
                  { value: 'marks', label: 'Tone marks (nǐ)' },
                  { value: 'numbers', label: 'Numbers (ni3)' },
                ]}
                onChange={(tones) => setZh({ tones })}
              />
              <Switch
                label="Apply 一 / 不 tone changes"
                hint="Off shows dictionary tones (yī ge); on shows yí ge and bú shì."
                checked={zh.sandhi}
                onChange={(sandhi) => setZh({ sandhi })}
              />
            </Disclosure>
            <Disclosure title={LANG_NAME.yue} value="Jyutping">
              <p className={s['itemHint']}>
                Cantonese is shown in Jyutping with tone numbers (<span lang="yue">我</span> →
                ngo5). There are no options to choose.
              </p>
            </Disclosure>
          </div>
        </section>

        <section className={s['group']} aria-labelledby="packs-h">
          <h2 id="packs-h" className={s['groupTitle']}>
            Offline language downloads
          </h2>
          <div className={s['card']}>
            <PackSettingsRows />
          </div>
          <p className={s['note']}>
            Downloaded once, then works offline. Korean needs no download.
          </p>
        </section>

        <BackupSection />

        <section className={s['group']} aria-labelledby="about-h">
          <h2 id="about-h" className={s['groupTitle']}>
            About &amp; licences
          </h2>
          <div className={s['card']}>
            <Row>
              <p className={s['aboutLine']}>
                <span>{APP_NAME}</span>
                <span className={s['summaryValue']}>Version {APP_VERSION}</span>
              </p>
            </Row>
            <Disclosure title="Dictionary sources and licences">
              <p className={s['itemHint']}>
                CC-CEDICT (CC BY-SA 4.0); CC-Canto and the CC-CEDICT Cantonese readings (CC BY-SA
                3.0, © Pleco). Japanese uses JMdict from the{' '}
                <a
                  href="https://www.edrdg.org/edrdg/newlic.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Electronic Dictionary Research and Development Group
                </a>{' '}
                (CC BY-SA 4.0) and Lindera/IPADIC (
                <a
                  href={`${import.meta.env.BASE_URL}licenses/IPADIC-COPYING.txt`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  IPADIC notice
                </a>
                ).
              </p>
            </Disclosure>
          </div>
        </section>
      </main>
    </>
  );
}
