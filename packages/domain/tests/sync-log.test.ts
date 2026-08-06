import { describe, expect, it } from 'vitest';
import type { MutationClock } from '@expense-tracker/contracts';
import { applySchema } from '../src/storage/schema';
import { insertVault } from '../src/storage/repository';
import type { Db } from '../src/storage/schema';
import {
  appendMutation,
  applyMutationOnce,
  canCompact,
  computeCheckpoint,
  markFailed,
  mutationsNewerThan,
  pendingMutationCount,
} from '../src/sync/mutation-log';
import { emptyClock, observeAndTick, serializeVector, parseVector } from '../src/sync/clocks';
import type { AppendMutationInput } from '../src/sync/mutation-log';
import { withNodeDb } from './support/node-db';

async function withVaultedDb(fn: (db: Db) => Promise<void>): Promise<void> {
  await withNodeDb(async (db) => {
    await applySchema(db);
    await insertVault(db, {
      id: 'vault-1',
      vault_owner_label: null,
      default_currency: 'USD',
      locale: 'en-US',
      week_start: 'locale_default',
      demo_mode: false,
      created_at: '2026-08-04T00:00:00.000Z',
      updated_at: '2026-08-04T00:00:00.000Z',
      deleted_at: null,
    });
    await fn(db);
  });
}

function mutation(input: Partial<AppendMutationInput> & { mutationId: string; entityId: string; deviceId: string; clock: MutationClock }): AppendMutationInput {
  return {
    vaultId: 'vault-1',
    entityType: 'transaction',
    operation: 'create',
    baseVersion: 0,
    changedFields: ['amount_minor'],
    ciphertext: 'opaque',
    origin: 'web',
    now: '2026-08-04T00:00:00.000Z',
    ...input,
  };
}

describe('Append-only mutation log (T013)', () => {
  it('appends durably and applies exactly once', async () => {
    await withVaultedDb(async (db) => {
      const clock = emptyClock('device-a', 1);
      const input = mutation({ mutationId: 'm1', entityId: 'tx-1', deviceId: 'device-a', clock });
      const first = await applyMutationOnce(db, 'vault-1', input);
      expect(first.kind).toBe('applied');
      const second = await applyMutationOnce(db, 'vault-1', input);
      expect(second.kind).toBe('duplicate');
      expect(await pendingMutationCount(db, 'vault-1')).toBe(0);
      expect((await computeCheckpoint(db, 'vault-1'))['device-a']).toBe(1);
    });
  });

  it('treats duplicate append requests as idempotent', async () => {
    await withVaultedDb(async (db) => {
      const input = mutation({ mutationId: 'm-duplicate', entityId: 'tx-duplicate', deviceId: 'device-a', clock: emptyClock('device-a', 1) });
      const first = await appendMutation(db, input);
      const second = await appendMutation(db, { ...input, ciphertext: 'different', now: '2026-08-05T00:00:00.000Z' });
      expect(second.id).toBe(first.id);
      expect(second.ciphertext).toBe('opaque');
      expect(await mutationsNewerThan(db, 'vault-1', {}, 10)).toHaveLength(1);
    });
  });

  it('marks failed mutations with retry counts and pending status', async () => {
    await withVaultedDb(async (db) => {
      const input = mutation({ mutationId: 'm-fail', entityId: 'tx-2', deviceId: 'device-a', clock: emptyClock('device-a', 2) });
      await appendMutation(db, input);
      await markFailed(db, 'vault-1', 'm-fail', 'SYNC_RETRYABLE');
      expect(await pendingMutationCount(db, 'vault-1')).toBe(1);
      const queue = await mutationsNewerThan(db, 'vault-1', {}, 10);
      expect(queue).toHaveLength(1);
    });
  });

  it('orders by causal clocks, not wall clocks', async () => {
    await withVaultedDb(async (db) => {
      await appendMutation(db, mutation({ mutationId: 'm-b', entityId: 'tx-b', deviceId: 'device-b', clock: emptyClock('device-b', 5), now: '2026-08-04T00:00:00.000Z' }));
      await appendMutation(db, mutation({ mutationId: 'm-a', entityId: 'tx-a', deviceId: 'device-a', clock: emptyClock('device-a', 1), now: '2026-08-05T00:00:00.000Z' }));
      const queue = await mutationsNewerThan(db, 'vault-1', {}, 10);
      expect(queue.map((m) => m.id)).toEqual(['m-a', 'm-b']);
    });
  });

  it('detects causally concurrent overlapping edits as conflicts', async () => {
    await withVaultedDb(async (db) => {
      const base = emptyClock('device-a', 1);
      const local = observeAndTick(base, emptyClock('device-a', 0), 'device-a');
      const remote = observeAndTick(base, emptyClock('device-b', 0), 'device-b');
      const localInput = mutation({ mutationId: 'm-local', entityId: 'tx-1', deviceId: 'device-a', clock: local, operation: 'update', baseVersion: 1, changedFields: ['amount_minor'] });
      const remoteInput = mutation({ mutationId: 'm-remote', entityId: 'tx-1', deviceId: 'device-b', clock: remote, operation: 'update', baseVersion: 1, changedFields: ['amount_minor'] });

      const first = await applyMutationOnce(db, 'vault-1', localInput);
      expect(first.kind).toBe('applied');
      const second = await applyMutationOnce(db, 'vault-1', remoteInput);
      expect(second.kind).toBe('conflict');
    });
  });

  it('merges concurrent edits to disjoint fields without conflict', async () => {
    await withVaultedDb(async (db) => {
      const base = emptyClock('device-a', 1);
      const local = observeAndTick(base, emptyClock('device-a', 0), 'device-a');
      const remote = observeAndTick(base, emptyClock('device-b', 0), 'device-b');
      const localInput = mutation({ mutationId: 'm-local', entityId: 'tx-1', deviceId: 'device-a', clock: local, operation: 'update', baseVersion: 1, changedFields: ['amount_minor'] });
      const remoteInput = mutation({ mutationId: 'm-remote', entityId: 'tx-1', deviceId: 'device-b', clock: remote, operation: 'update', baseVersion: 1, changedFields: ['note'] });

      await applyMutationOnce(db, 'vault-1', localInput);
      const second = await applyMutationOnce(db, 'vault-1', remoteInput);
      expect(second.kind).toBe('applied');
    });
  });

  it('supports replay rejection for stale known clocks', async () => {
    await withVaultedDb(async (db) => {
      await appendMutation(db, mutation({ mutationId: 'm1', entityId: 'tx-1', deviceId: 'device-a', clock: emptyClock('device-a', 7) }));
      await appendMutation(db, mutation({ mutationId: 'm2', entityId: 'tx-2', deviceId: 'device-a', clock: emptyClock('device-a', 8) }));
      const newer = await mutationsNewerThan(db, 'vault-1', { 'device-a': 7 }, 10);
      expect(newer.map((m) => m.id)).toEqual(['m2']);
    });
  });

  it('requires all devices to acknowledge a checkpoint before compaction', async () => {
    await withVaultedDb(async (db) => {
      await appendMutation(db, mutation({ mutationId: 'm1', entityId: 'tx-1', deviceId: 'device-a', clock: emptyClock('device-a', 3) }));
      expect(await canCompact(db, 'vault-1', ['device-a'])).toBe(true);
      expect(await canCompact(db, 'vault-1', [])).toBe(false);
    });
  });

  it('round-trips vector clock serialization deterministically', () => {
    const vector = { 'device-b': 2, 'device-a': 1 };
    const serialized = serializeVector(vector);
    expect(serialized).toBe('{"device-a":1,"device-b":2}');
    expect(parseVector(serialized)).toEqual({ 'device-a': 1, 'device-b': 2 });
  });
});
