import { useState } from 'react';
import { clearLibraryMarker } from '@/db/repositories/meta';
import { ImportFlow } from '@/features/settings/ImportFlow';
import { Button, ConfirmDialog, EmptyState } from '@/ui';

/**
 * Shown when the database is empty but a marker says a library existed (J12.5): iOS or the user
 * probably cleared site data. Offers Import first; "Start fresh" only forgets the marker.
 */
export function RecoveryScreen({ onResolved }: { onResolved: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <main className="screen" style={{ paddingTop: 'var(--safe-top)' }}>
      <EmptyState
        title="Your library looks empty"
        action={
          <div style={{ display: 'grid', gap: 'var(--space-8)', width: '100%', maxWidth: 320 }}>
            <ImportFlow label="Import a backup" variant="primary" onImported={onResolved} />
            <Button variant="plain" onClick={() => setConfirm(true)}>
              Start fresh
            </Button>
          </div>
        }
      >
        Overtone remembers having songs here, but none were found. Your device may have cleared this
        app&rsquo;s storage. If you have a backup file, import it to bring your songs, progress and
        corrections back.
      </EmptyState>
      <ConfirmDialog
        open={confirm}
        title="Start with an empty library?"
        message="Overtone will stop looking for your previous songs. You can still import a backup later from Settings."
        confirmLabel="Start fresh"
        onConfirm={() => {
          setConfirm(false);
          void clearLibraryMarker().then(onResolved);
        }}
        onCancel={() => setConfirm(false)}
      />
    </main>
  );
}
