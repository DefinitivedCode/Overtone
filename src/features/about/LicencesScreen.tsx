import { TopBar } from '@/app/TopBar';
import { APP_NAME, APP_VERSION } from '@/app/version';
import { DICTIONARY_SOURCES, PACKAGE_LICENCES } from './licences.generated';
import s from './LicencesScreen.module.css';

/** About & licences: every dictionary and library the app ships or downloads, with its licence (M9). */
export function LicencesScreen() {
  const base = import.meta.env.BASE_URL;
  return (
    <>
      <TopBar back={{ to: '/settings', label: 'Settings' }} />
      <main className="screen">
        <h1 className="large-title">About &amp; licences</h1>
        <p className={s['lead']}>
          {APP_NAME} {APP_VERSION} keeps your songs, progress and settings on this device only. It
          has no account and no server. Language data is downloaded once from this site and then
          works offline.
        </p>

        <section className={s['group']} aria-labelledby="dict-h">
          <h2 id="dict-h" className={s['groupTitle']}>
            Dictionaries and language data
          </h2>
          <ul className={s['list']}>
            {DICTIONARY_SOURCES.map((d) => (
              <li key={d.name}>
                <p className={s['name']}>{d.name}</p>
                <p className={s['licence']}>{d.licence}</p>
                <p className={s['text']}>{d.attribution}</p>
              </li>
            ))}
            <li>
              <p className={s['name']}>Lindera and IPADIC</p>
              <p className={s['licence']}>MIT (Lindera) and IPADIC terms</p>
              <p className={s['text']}>
                Japanese tokenizer.{' '}
                <a
                  href={`${base}licenses/IPADIC-COPYING.txt`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  IPADIC notice
                </a>
                .
              </p>
            </li>
          </ul>
          <p className={s['note']}>
            Dictionary data is shared under the licences above. Attribution and ShareAlike terms
            apply to the downloaded language packs, not to your lyrics.
          </p>
        </section>

        <section className={s['group']} aria-labelledby="font-h">
          <h2 id="font-h" className={s['groupTitle']}>
            Fonts
          </h2>
          <ul className={s['list']}>
            <li>
              <p className={s['name']}>Instrument Serif</p>
              <p className={s['licence']}>SIL Open Font License 1.1</p>
              <p className={s['text']}>
                <a
                  href={`${base}fonts/OFL-instrument-serif.txt`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Licence text
                </a>
                . Korean, Japanese and Chinese lyrics use the fonts built into your device.
              </p>
            </li>
          </ul>
        </section>

        <section className={s['group']} aria-labelledby="pkg-h">
          <h2 id="pkg-h" className={s['groupTitle']}>
            Open-source libraries
          </h2>
          <ul className={s['list']}>
            {PACKAGE_LICENCES.map((p) => (
              <li key={p.name} className={s['pkg']}>
                <span className={s['name']}>{p.name}</span>
                <span className={s['licence']}>
                  {p.version} · {p.licence}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={s['group']} aria-labelledby="lyrics-h">
          <h2 id="lyrics-h" className={s['groupTitle']}>
            Lyrics
          </h2>
          <p className={s['text']}>
            Lyrics are copyrighted by their owners. {APP_NAME} stores only the text you add, for
            your own study, and does not ship any song lyrics.
          </p>
        </section>
      </main>
    </>
  );
}
