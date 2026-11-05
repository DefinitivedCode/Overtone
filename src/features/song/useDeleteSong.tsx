import { useState } from 'react';
import type { ReactNode } from 'react';
import { StorageError } from '@/db/errors';
import { purgeSong, softDeleteSong, undoDeleteSong } from '@/db/repositories/songs';
import type { Song } from '@/db/types';
import { ConfirmDialog, useToast } from '@/ui';

/**
 * Delete flow (J9.2): confirm → soft delete → Undo toast for 8 s → purge when the toast expires.
 * If the app closes before that, the song is purged at next launch (BootGate).
 */
export function useDeleteSong(onDeleted?: () => void): {
  requestDelete: (song: Song) => void;
  dialog: ReactNode;
} {
  const toast = useToast();
  const [target, setTarget] = useState<Song | null>(null);

  async function confirm() {
    const song = target;
    setTarget(null);
    if (!song) return;
    try {
      await softDeleteSong(song.id);
    } catch (e) {
      toast.show({ message: e instanceof StorageError ? e.message : 'Could not delete the song.' });
      return;
    }
    onDeleted?.();
    toast.show({
      message: `“${song.title}” deleted`,
      actionLabel: 'Undo',
      duration: 8000,
      onAction: () => void undoDeleteSong(song.id),
      onExpire: () => void purgeSong(song.id),
    });
  }

  return {
    requestDelete: setTarget,
    dialog: (
      <ConfirmDialog
        open={target !== null}
        title="Delete this song?"
        message={
          target
            ? `“${target.title}”, its progress and your corrections will be removed. You can undo for a few seconds.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirm()}
        onCancel={() => setTarget(null)}
      />
    ),
  };
}
