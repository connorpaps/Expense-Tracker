import { DEFAULT_CATEGORIES, applySchema, categorySlug, insertCategory, insertVault, listVaults, randomUuid } from '@expense-tracker/domain';
import type { Db } from '@expense-tracker/domain';
import { openWaSqliteDb } from './waSqliteDb';

/**
 * Open (or lazily create) the local vault store. The first run seeds a demo
 * vault so the product is immediately explorable; real vaults are created
 * through the settings flow in later phases.
 */
let openingVault: Promise<{ db: Db; vaultId: string }> | null = null;

export function openVaultStore(): Promise<{ db: Db; vaultId: string }> {
  if (openingVault) return openingVault;

  openingVault = openVaultStoreOnce().catch((error) => {
    openingVault = null;
    throw error;
  });
  return openingVault;
}

async function openVaultStoreOnce(): Promise<{ db: Db; vaultId: string }> {
  const db = await openWaSqliteDb({ vfs: 'idb' });
  await applySchema(db);

  const existing = await listVaults(db);
  if (existing.length > 0) {
    return { db, vaultId: existing[0]!.id };
  }

  const vaultId = randomUuid();
  const now = new Date().toISOString();
  await insertVault(db, {
    id: vaultId,
    vault_owner_label: null,
    default_currency: 'USD',
    locale: 'en-US',
    week_start: 'locale_default',
    demo_mode: true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  // The browser adapter uses one async SQLite connection. Keep writes
  // sequential rather than Promise.all-ing statements against that connection;
  // concurrent asyncify operations can otherwise leave vault bootstrap waiting
  // indefinitely even though each individual SQL call succeeds.
  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await insertCategory(db, {
      id: randomUuid(),
      vault_id: vaultId,
      name: category.name,
      slug: categorySlug(category.name),
      kind: category.kind,
      color_token: category.color_token,
      icon_name: category.icon_name,
      position: index,
      is_active: true,
      created_at: now,
      updated_at: now,
      version: 1,
    });
  }

  return { db, vaultId };
}
