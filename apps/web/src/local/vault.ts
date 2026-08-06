import {
  DEFAULT_CATEGORIES,
  applySchema,
  categorySlug,
  getVault,
  insertCategory,
  insertTransaction,
  insertVault,
  listVaults,
  newTransaction,
  randomUuid,
} from '@expense-tracker/domain';
import type { Db, LocalVault } from '@expense-tracker/domain';
import { openWaSqliteDb } from './waSqliteDb';

const ACTIVE_VAULT_KEY = 'expense-tracker-active-vault';

const DEMO_TRANSACTIONS = [
  ['2026-07-01', 'Morning Roast Cafe', -675, 'Food and Dining'],
  ['2026-07-01', 'Metro Transit', -275, 'Transportation'],
  ['2026-07-02', 'Grocery Market', -8420, 'Food and Dining'],
  ['2026-07-03', 'Monthly Streaming', -1599, 'Subscriptions'],
  ['2026-07-05', 'Pharmacy', -2345, 'Health'],
  ['2026-07-06', 'Bookstore', -1840, 'Shopping'],
  ['2026-07-08', 'Electric Utility', -5630, 'Bills and Utilities'],
  ['2026-07-10', 'Ride Share', -1250, 'Transportation'],
  ['2026-07-12', 'Movie Theater', -2600, 'Entertainment'],
  ['2026-07-15', 'Employer Payroll', 185000, 'Income'],
  ['2026-07-20', 'Restaurant Night', -5820, 'Food and Dining'],
  ['2026-07-25', 'Phone Bill', -4200, 'Bills and Utilities'],
  ['2026-07-28', 'Weekend Getaway', -12400, 'Travel'],
] as const;

export interface VaultStore {
  db: Db;
  vault: LocalVault;
  vaults: LocalVault[];
  vaultId: string;
  defaultCurrency: string;
}

let openingVault: Promise<VaultStore> | null = null;

export function openVaultStore(): Promise<VaultStore> {
  if (openingVault) return openingVault;
  openingVault = openVaultStoreOnce().catch((error) => {
    openingVault = null;
    throw error;
  });
  return openingVault;
}

export async function refreshVaultStore(db: Db, preferredVaultId?: string): Promise<VaultStore> {
  const vaults = await listVaults(db);
  if (vaults.length === 0) {
    const vault = await createLocalVault(db, { label: 'Personal vault', demoMode: false });
    return buildStore(db, [vault], vault.id);
  }
  const storedId = preferredVaultId ?? readActiveVaultId();
  const active = vaults.find((vault) => vault.id === storedId) ?? vaults[0]!;
  writeActiveVaultId(active.id);
  return buildStore(db, vaults, active.id);
}

export async function createLocalVault(
  db: Db,
  options: { label: string; demoMode: boolean },
): Promise<LocalVault> {
  const label = options.label.trim();
  if (!label) throw new Error('Vault name cannot be blank.');
  const vaultId = randomUuid();
  const now = new Date().toISOString();
  const vault: LocalVault = {
    id: vaultId,
    vault_owner_label: label,
    default_currency: 'CAD',
    locale: 'en-US',
    week_start: 'locale_default',
    demo_mode: options.demoMode,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.transaction(async (transactionDb) => {
    await insertVault(transactionDb, vault);
    const categoryIds = new Map<string, string>();
    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
      const id = randomUuid();
      categoryIds.set(category.name, id);
      await insertCategory(transactionDb, {
        id,
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

    if (options.demoMode) {
      await transactionDb.exec(
        'INSERT INTO demo_datasets (id, vault_id, name, seed_version, created_at) VALUES (?, ?, ?, ?, ?)',
        [randomUuid(), vaultId, 'Sample data — not your real finances', '2026-08-04-01', now],
      );
      for (const [occurredOn, merchant, amountMinor, categoryName] of DEMO_TRANSACTIONS) {
        await insertTransaction(
          transactionDb,
          newTransaction({
            id: randomUuid(),
            vault_id: vaultId,
            occurred_on: occurredOn,
            merchant_display: merchant,
            amount_minor: amountMinor,
            currency: 'CAD',
            category_id: categoryIds.get(categoryName) ?? null,
            category_source: 'default_rule',
            category_confidence: 'high',
            source_type: 'demo',
            review_state: 'confirmed',
            now,
          }),
        );
      }
    }
  });

  writeActiveVaultId(vaultId);
  return vault;
}

async function openVaultStoreOnce(): Promise<VaultStore> {
  const db = await openWaSqliteDb({ vfs: 'idb' });
  await applySchema(db);
  const vaults = await listVaults(db);
  if (vaults.length === 0) {
    const vault = await createLocalVault(db, { label: 'Personal vault', demoMode: false });
    return buildStore(db, [vault], vault.id);
  }
  const active = vaults.find((vault) => vault.id === readActiveVaultId()) ?? vaults[0]!;
  writeActiveVaultId(active.id);
  return buildStore(db, vaults, active.id);
}

function buildStore(db: Db, vaults: LocalVault[], vaultId: string): VaultStore {
  const vault = vaults.find((candidate) => candidate.id === vaultId) ?? vaults[0]!;
  return {
    db,
    vault,
    vaults,
    vaultId: vault.id,
    defaultCurrency: vault.default_currency,
  };
}

function readActiveVaultId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_VAULT_KEY);
}

function writeActiveVaultId(vaultId: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_VAULT_KEY, vaultId);
}

export { getVault };
