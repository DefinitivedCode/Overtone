import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { StorageError } from '@/db/errors';
import { openDatabase } from '@/db/open';
import { checkRecovery } from '@/db/repositories/meta';
import { getSettings, updateSettings } from '@/db/repositories/settings';
import { purgeSoftDeleted } from '@/db/repositories/songs';
import { getDb, onDatabaseOutdated } from '@/db/schema';
import { RecoveryScreen } from '@/features/recovery/RecoveryScreen';
import { isPersisted, requestPersistence } from '@/platform/storage';
import { isStandalone } from '@/platform/standalone';
import { Banner, Button, EmptyState } from '@/ui';
import {
  getTextSize,
  getTheme,
  hydratePreferences,
  registerPreferencePersister,
} from './preferences';

type Phase =
  | { name: 'loading' }
  | { name: 'ready' }
  | { name: 'recovery' }
  | { name: 'error'; message: string };

async function boot(): Promise<Phase> {
  await openDatabase();
  await purgeSoftDeleted(); // the Undo window of any earlier session has passed
  const stored = await getDb().settings.get('app');
  if (stored) {
    const s = await getSettings();
    hydratePreferences({ theme: s.theme, textSize: s.textSize });
  } else {
    // First run: adopt whatever the pre-paint mirror holds so nothing the user chose is lost.
    await updateSettings((s) => ({ ...s, theme: getTheme(), textSize: getTextSize() }));
  }
  registerPreferencePersister((patch) => {
    void updateSettings((s) => ({ ...s, ...patch }));
  });
  const recovery = await checkRecovery();
  return recovery.needsRecovery ? { name: 'recovery' } : { name: 'ready' };
}

/** After launch: retry persistent storage in standalone mode if it was requested but not granted (§10.1). */
async function refreshPersistence(): Promise<void> {
  const s = await getSettings();
  if (!s.storage.persistRequested) return;
  const persisted =
    s.storage.persisted === true
      ? true
      : isStandalone()
        ? await requestPersistence()
        : await isPersisted();
  if (persisted !== s.storage.persisted)
    await updateSettings((x) => ({ ...x, storage: { ...x.storage, persisted } }));
}

/** Opens storage before any screen renders and routes to recovery / error states. */
export function BootGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [outdated, setOutdated] = useState(false);

  const run = useCallback(() => {
    boot().then(
      (p) => {
        setPhase(p);
        if (p.name === 'ready') void refreshPersistence().catch(() => undefined);
      },
      (e: unknown) =>
        setPhase({
          name: 'error',
          message: e instanceof StorageError ? e.message : 'Overtone could not start.',
        }),
    );
  }, []);

  const start = useCallback(() => {
    setPhase({ name: 'loading' });
    run();
  }, [run]);

  useEffect(() => {
    run();
    return onDatabaseOutdated(() => setOutdated(true));
  }, [run]);

  if (phase.name === 'loading') return <div className="boot" aria-hidden="true" />;
  if (phase.name === 'error')
    return (
      <main className="screen" style={{ paddingTop: 'var(--safe-top)' }}>
        <EmptyState
          title="Storage isn’t available"
          action={<Button onClick={start}>Try again</Button>}
        >
          {phase.message}
        </EmptyState>
      </main>
    );
  if (phase.name === 'recovery')
    return <RecoveryScreen onResolved={() => setPhase({ name: 'ready' })} />;
  return (
    <>
      {outdated ? (
        <div className="screen" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
          <Banner
            tone="warning"
            action={
              <Button variant="plain" onClick={() => window.location.reload()}>
                Reload
              </Button>
            }
          >
            Overtone was updated in another window. Reload to continue.
          </Banner>
        </div>
      ) : null}
      {children}
    </>
  );
}
