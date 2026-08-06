// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { applySchema, insertCategory, insertTransaction, insertVault, newTransaction, persistMutation } from '@expense-tracker/domain';
import type { Db } from '@expense-tracker/domain';
import { RelayClient } from '../src/local/sync/relay-client';
import { syncOnce } from '../src/local/sync/sync-service';
import { withNodeDb } from '../../../packages/domain/tests/support/node-db';

const now = '2026-08-06T12:00:00.000Z';

function socketWithoutAcceptedIds() {
  const socket = {
    readyState: 0,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onerror: null as (() => void) | null,
    onclose: null as (() => void) | null,
    send() {
      queueMicrotask(() => socket.onmessage?.({
        data: JSON.stringify({
          type: 'sync_exchange_response',
          response: {
            vault_id: 'vault-compat',
            mutations: [],
            checkpoint: { web: 1 },
            has_more: false,
            replay: false,
            conflicting_mutation_ids: [],
            rejected_mutation_ids: [],
          },
        }),
      }));
    },
    close() {
      socket.readyState = 3;
      socket.onclose?.();
    },
  };
  return {
    socketFactory: () => {
      socket.readyState = 1;
      queueMicrotask(() => socket.onopen?.());
      return socket;
    },
  };
}

async function seed(db: Db): Promise<void> {
  await applySchema(db);
  await insertVault(db, {
    id: 'vault-compat', vault_owner_label: 'Compat', default_currency: 'USD', locale: 'en-US', week_start: 'locale_default', demo_mode: false,
    created_at: now, updated_at: now, deleted_at: null,
  });
  await insertCategory(db, {
    id: 'category-compat', vault_id: 'vault-compat', name: 'Other', slug: 'other', kind: 'other', color_token: 'stone', icon_name: 'tag', position: 0,
    is_active: true, created_at: now, updated_at: now, version: 1,
  });
  await persistMutation(db, {
    mutationId: 'compat-local-1', vaultId: 'vault-compat', deviceId: 'web', entityType: 'transaction', entityId: 'compat-tx', operation: 'create',
    baseVersion: 0, changedFields: ['merchant_display'], ciphertext: 'opaque', origin: 'web', now,
    apply: (transactionDb) => insertTransaction(transactionDb, newTransaction({
      id: 'compat-tx', vault_id: 'vault-compat', occurred_on: '2026-08-06', merchant_display: 'Compatibility Cafe', amount_minor: -100,
      currency: 'USD', category_id: 'category-compat', source_type: 'manual', now,
    })),
  });
}

describe('web sync response compatibility', () => {
  it('fails closed for a legacy response without explicit accepted mutation IDs', async () => {
    await withNodeDb(async (db) => {
      await seed(db);
      const fake = socketWithoutAcceptedIds();
      const client = new RelayClient({ url: 'ws://relay.test/ws', socketFactory: fake.socketFactory });
      const result = await syncOnce(db, 'vault-compat', { relayUrl: 'ws://relay.test/ws', deviceId: 'web' }, undefined, client);
      expect(result.status).toBe('partial');
      expect(result.acknowledged).toBe(0);
      expect(result.errors[0]).toMatch(/did not acknowledge/i);
      expect(await db.get<{ status: string; last_error_code: string }>('SELECT status, last_error_code FROM mutation_log WHERE id = ?', ['compat-local-1'])).toMatchObject({ status: 'failed', last_error_code: 'RELAY_ACK_MISSING' });
    });
  });
});
