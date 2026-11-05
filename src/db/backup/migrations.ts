import { BACKUP_SCHEMA_VERSION } from './format';

/**
 * Forward migrations keyed by the version they upgrade FROM: `migrations[n]` turns a v(n) document
 * into v(n+1). v1 is the first shipped version, so the registry is empty; old key functions used by
 * future migrations that remap line keys must be kept in this folder (ARCHITECTURE §7).
 */
export type BackupMigration = (doc: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Readonly<Record<number, BackupMigration>> = {};

export class BackupMigrationError extends Error {}

/** Runs migrations sequentially up to `target`. Registry and target are parameters so tests can exercise the harness. */
export function migrateBackup(
  doc: Record<string, unknown>,
  target: number = BACKUP_SCHEMA_VERSION,
  registry: Readonly<Record<number, BackupMigration>> = MIGRATIONS,
): Record<string, unknown> {
  let current = doc;
  let version = current['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new BackupMigrationError('The backup has no valid schema version.');
  }
  while (version < target) {
    const step = registry[version];
    if (!step) throw new BackupMigrationError(`No migration from backup version ${version}.`);
    current = { ...step(current), schemaVersion: version + 1 };
    version += 1;
  }
  return current;
}
