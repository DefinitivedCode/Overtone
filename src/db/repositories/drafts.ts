import { guard } from '../errors';
import { getDb } from '../schema';
import type { Draft } from '../types';

export function getDraft(): Promise<Draft | undefined> {
  return guard(() => getDb().drafts.get('add-song'));
}

export function saveDraft(draft: Omit<Draft, 'id' | 'updatedAt'>, now = Date.now()): Promise<void> {
  return guard(async () => {
    await getDb().drafts.put({ ...draft, id: 'add-song', updatedAt: now });
  });
}

export function clearDraft(): Promise<void> {
  return guard(() => getDb().drafts.delete('add-song'));
}
