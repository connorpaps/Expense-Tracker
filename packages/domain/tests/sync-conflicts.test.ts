import { describe, expect, it } from 'vitest';
import { applySchema } from '../src/storage/schema';
import { insertConflict, insertVault, listOpenConflicts } from '../src/storage/repository';
import { applyMutationOnce } from '../src/sync/mutation-log';
import type { AppendMutationInput } from '../src/sync/mutation-log';
import { emptyClock, observeAndTick } from '../src/sync/clocks';
import { resolveConflict } from '../src/sync/conflict-resolution';
import { withNodeDb } from './support/node-db';

const now = '2026-08-05T00:00:00.000Z';

function makeVault(id: string) {
  return {
    id,
    vault_owner_label: id,
    default_currency: 'USD',
    locale: 'en-US',
    week_start: 'locale_default' as const,
    demo_mode: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

function syncMutation(input: Partial<AppendMutationInput> & { mutationId: string; entityId: string; deviceId: string; clock: ReturnType<typeof emptyClock> }): AppendMutationInput {
  return {
    vaultId: 'vault-a',
    entityType: 'transaction',
    operation: 'update',
    baseVersion: 1,
    changedFields: ['amount_minor'],
    ciphertext: 'opaque-encrypted-payload',
    origin: 'web',
    now,
    ...input,
  };
}

async function seedConflict(db: Parameters<typeof applySchema>[0], id = 'conflict-1', vaultId = 'vault-a') {
  await insertConflict(db, {
    id,
    vault_id: vaultId,
    entity_type: 'transaction',
    entity_id: 'transaction-1',
    conflicting_fields: ['amount_minor'],
    local_values: 'local-encrypted-candidate',
    remote_values: 'remote-encrypted-candidate',
    base_values: 'base-encrypted-candidate',
    status: 'open',
    resolved_values: null,
    created_at: now,
    resolved_at: null,
  });
}

describe('US6 field-aware conflict resolution', () => {
  it('detects overlapping concurrent fields across transactions, deletes, and rule updates', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const cases = [
        ['amount', 'transaction', 'transaction-amount', 'amount_minor', 'update'],
        ['date', 'transaction', 'transaction-date', 'occurred_on', 'update'],
        ['merchant', 'transaction', 'transaction-merchant', 'merchant_display', 'update'],
        ['category', 'transaction', 'transaction-category', 'category_id', 'update'],
        ['delete', 'transaction', 'transaction-delete', 'deleted_at', 'delete'],
        ['rule', 'categorization_rule', 'rule-1', 'matcher', 'update'],
      ] as const;
      for (const [name, entityType, entityId, field, operation] of cases) {
        const base = emptyClock('device-a', 1);
        const localClock = observeAndTick(base, emptyClock('device-a', 0), 'device-a');
        const remoteClock = observeAndTick(base, emptyClock('device-b', 0), 'device-b');
        const local = syncMutation({ mutationId: `local-${name}`, entityType, entityId, changedFields: [field], operation, deviceId: 'device-a', clock: localClock });
        const remoteFields = name === 'amount' ? ['amount_minor', 'note'] : [field];
        const remote = syncMutation({ mutationId: `remote-${name}`, entityType, entityId, changedFields: remoteFields, operation, deviceId: 'device-b', clock: remoteClock });
        expect((await applyMutationOnce(db, 'vault-a', local)).kind).toBe('applied');
        const conflict = await applyMutationOnce(db, 'vault-a', remote);
        expect(conflict.kind).toBe('conflict');
        if (conflict.kind !== 'conflict') throw new Error('Expected an overlapping concurrent conflict.');
        expect(conflict.mutation.conflict_id).toBe(conflict.conflictId);
        expect((await db.get<{ conflicting_fields: string; status: string }>(
          'SELECT conflicting_fields, status FROM conflicts WHERE id = ?',
          [conflict.conflictId],
        ))).toEqual({ conflicting_fields: JSON.stringify([field]), status: 'open' });
        expect((await applyMutationOnce(db, 'vault-a', remote)).kind).toBe('duplicate');
      }
    });
  });

  it('rolls back an open conflict when its mutation cannot be stored', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const base = emptyClock('device-a', 1);
      const local = syncMutation({ mutationId: 'local-rollback', entityId: 'transaction-rollback', deviceId: 'device-a', clock: observeAndTick(base, emptyClock('device-a', 0), 'device-a') });
      const remote = syncMutation({ mutationId: 'remote-rollback', entityId: 'transaction-rollback', deviceId: 'device-b', clock: observeAndTick(base, emptyClock('device-b', 0), 'device-b') });
      await applyMutationOnce(db, 'vault-a', local);
      const originalExec = db.exec;
      db.exec = async (sql, params = []) => {
        if (sql.includes('INSERT OR IGNORE INTO mutation_log')) throw new Error('simulated conflict mutation failure');
        return originalExec(sql, params);
      };
      await expect(applyMutationOnce(db, 'vault-a', remote)).rejects.toThrow(/conflict mutation failure/i);
      expect(await db.get('SELECT id FROM conflicts WHERE id = ?', ['conflict-remote-rollback'])).toBeUndefined();
      expect(await db.get('SELECT id FROM mutation_log WHERE id = ?', ['remote-rollback'])).toBeUndefined();
    });
  });

  it('treats missing field metadata as an unknown overlapping scope', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const base = emptyClock('device-a', 1);
      const local = syncMutation({ mutationId: 'local-unknown', entityId: 'transaction-unknown', deviceId: 'device-a', clock: observeAndTick(base, emptyClock('device-a', 0), 'device-a'), changedFields: [] });
      const remote = syncMutation({ mutationId: 'remote-unknown', entityId: 'transaction-unknown', deviceId: 'device-b', clock: observeAndTick(base, emptyClock('device-b', 0), 'device-b'), changedFields: ['note'] });
      await expect(applyMutationOnce(db, 'vault-a', local)).resolves.toMatchObject({ kind: 'applied' });
      const result = await applyMutationOnce(db, 'vault-a', remote);
      expect(result.kind).toBe('conflict');
      if (result.kind !== 'conflict') throw new Error('Expected unknown-field conflict.');
      expect(await db.get<{ conflicting_fields: string }>('SELECT conflicting_fields FROM conflicts WHERE id = ?', [result.conflictId])).toEqual({ conflicting_fields: '["*"]' });
    });
  });

  it('selects each opaque candidate without decrypting it', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      const cases = [
        ['local', 'keep_local', 'local-encrypted-candidate', 'resolved_local'],
        ['remote', 'keep_remote', 'remote-encrypted-candidate', 'resolved_remote'],
        ['both', 'keep_both', 'merged-encrypted-candidate', 'resolved_both'],
      ] as const;

      for (const [id, resolution, expectedValues, expectedStatus] of cases) {
        await seedConflict(db, `conflict-${id}`);
        const result = await resolveConflict(db, {
          conflictId: `conflict-${id}`,
          vaultId: 'vault-a',
          resolution,
          manualCiphertext: resolution === 'keep_both' ? 'merged-encrypted-candidate' : undefined,
          deviceId: 'web',
          origin: 'web',
          now,
        });
        expect(result.resolvedValues).toBe(expectedValues);
        expect(result.status).toBe(expectedStatus);
        expect(result.mutation.entity_type).toBe('conflict');
        expect(result.mutation.ciphertext).toBe(expectedValues);
      }
      expect(await listOpenConflicts(db, 'vault-a')).toHaveLength(0);
    });
  });

  it('requires an encrypted manual candidate and records it as a manual resolution', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      await seedConflict(db);
      await expect(resolveConflict(db, {
        conflictId: 'conflict-1', vaultId: 'vault-a', resolution: 'manual_edit', deviceId: 'web', origin: 'web', now,
      })).rejects.toThrow(/encrypted value/i);

      const result = await resolveConflict(db, {
        conflictId: 'conflict-1', vaultId: 'vault-a', resolution: 'manual_edit', manualCiphertext: 'manual-encrypted-candidate', deviceId: 'web', origin: 'web', now,
      });
      expect(result.status).toBe('resolved_manual');
      expect(result.resolvedValues).toBe('manual-encrypted-candidate');
    });
  });

  it('is idempotent on retry and rejects wrong-vault or already-resolved requests', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      await insertVault(db, makeVault('vault-b'));
      await seedConflict(db);

      await expect(resolveConflict(db, {
        conflictId: 'conflict-1', vaultId: 'vault-b', resolution: 'keep_local', deviceId: 'web', origin: 'web', now,
      })).rejects.toThrow(/does not exist in this vault/i);

      const first = await resolveConflict(db, {
        conflictId: 'conflict-1', vaultId: 'vault-a', resolution: 'keep_local', deviceId: 'web', origin: 'web', now,
      });
      const retry = await resolveConflict(db, {
        conflictId: 'conflict-1', vaultId: 'vault-a', resolution: 'keep_local', deviceId: 'web', origin: 'web', now,
      });
      expect(retry.mutation.id).toBe(first.mutation.id);
      expect(retry.resolvedValues).toBe(first.resolvedValues);

      await expect(resolveConflict(db, {
        conflictId: 'conflict-1', vaultId: 'vault-a', resolution: 'keep_remote', deviceId: 'web', origin: 'web', now,
      })).rejects.toThrow(/different choice/i);
    });
  });

  it('rolls back the conflict status when the resolution mutation cannot be appended', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, makeVault('vault-a'));
      await seedConflict(db);
      const originalExec = db.exec;
      db.exec = async (sql, params = []) => {
        if (sql.includes('INSERT OR IGNORE INTO mutation_log')) throw new Error('simulated resolution storage failure');
        return originalExec(sql, params);
      };

      await expect(resolveConflict(db, {
        conflictId: 'conflict-1', vaultId: 'vault-a', resolution: 'keep_local', deviceId: 'web', origin: 'web', now,
      })).rejects.toThrow(/resolution storage failure/i);
      expect(await db.get<{ status: string; resolved_values: string | null }>(
        'SELECT status, resolved_values FROM conflicts WHERE id = ?',
        ['conflict-1'],
      )).toEqual({ status: 'open', resolved_values: null });
      expect(await db.get('SELECT id FROM mutation_log WHERE id = ?', ['resolve-conflict-conflict-1'])).toBeUndefined();
    });
  });
});
