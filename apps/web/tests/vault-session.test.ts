// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { applySchema } from '@expense-tracker/domain';
import { createLocalVault, refreshVaultStore } from '../src/local/vault';
import { createNodeDb } from '../../../packages/domain/tests/support/node-db';

describe('US7 vault session transitions', () => {
  it('switches the active vault and falls back safely for an unknown id', async () => {
    const db = createNodeDb();
    try {
      await applySchema(db);
      const first = await createLocalVault(db, { label: 'Personal', demoMode: false });
      const second = await createLocalVault(db, { label: 'Demo', demoMode: true });

      const switched = await refreshVaultStore(db, first.id);
      expect(switched.vaultId).toBe(first.id);
      expect(switched.vault.demo_mode).toBe(false);
      expect(switched.vaults).toHaveLength(2);

      const fallback = await refreshVaultStore(db, 'does-not-exist');
      expect(fallback.vaultId).toBe(first.id);
      expect(fallback.vaults.map((vault) => vault.id)).toEqual([first.id, second.id]);
    } finally {
      await db.close();
    }
  });
});
