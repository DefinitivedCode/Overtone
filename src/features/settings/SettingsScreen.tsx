import { TopBar } from '@/app/TopBar';
import { TEXT_SIZE_LABELS, setTextSize, setTheme, useTextSize, useTheme } from '@/app/preferences';
import type { TextSize, ThemePref } from '@/app/preferences';
import { SegmentedControl } from '@/ui';
import s from './SettingsScreen.module.css';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsScreen() {
  const theme = useTheme();
  const size = useTextSize();
  return (
    <>
      <TopBar back={{ to: '/', label: 'Library' }} />
      <main className="screen">
        <h1 className="large-title">Settings</h1>

        <section className={s['group']} aria-labelledby="appearance-h">
          <h2 id="appearance-h" className={s['groupTitle']}>
            Appearance
          </h2>
          <div className={s['card']}>
            <SegmentedControl
              label="Theme"
              value={theme}
              options={THEME_OPTIONS}
              onChange={setTheme}
            />
          </div>
        </section>

        <section className={s['group']} aria-labelledby="size-h">
          <h2 id="size-h" className={s['groupTitle']}>
            Lyric text size
          </h2>
          <div className={s['card']}>
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
          </div>
          <p className={s['note']}>Applies to lyrics in every mode. Browser zoom still works.</p>
        </section>
      </main>
    </>
  );
}
