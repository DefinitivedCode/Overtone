import { useState } from 'react';
import { isIOS, isStandalone } from '@/platform/standalone';
import { Banner } from '@/ui';
import s from './InstallTip.module.css';

const KEY = 'overtone:installTipDismissed';
const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * On iPhone Safari (not yet installed) explain Add to Home Screen: an installed app gets its own storage, opens like
 * an app and is less likely to be cleared. Shown only once the Library has songs; dismissal is remembered.
 */
export function InstallTip({ force = false }: { force?: boolean }) {
  const [dismissed, setDismissed] = useState(read);
  if (!force && (dismissed || !isIOS() || isStandalone())) return null;
  return (
    <div className={s['tip']}>
      <Banner
        onDismiss={() => {
          setDismissed(true);
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            // Remembering the dismissal is a convenience only.
          }
        }}
      >
        Install Overtone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. It
        opens like an app, works offline, and keeps your songs safer than a browser tab.
      </Banner>
    </div>
  );
}
