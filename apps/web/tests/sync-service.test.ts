// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySchema,
  insertCategory,
  insertTransaction,
  insertVault,
  newTransaction,
  persistMutation,
} from '@expense-tracker/domain';
import type { Db } from '@expense-tracker/domain';
import { RelayClient } from '../src/local/sync/relay-client';
import { syncOnce } from '../src/local/sync/sync-service';
import { withNodeDb } from '../../../packages/domain/tests/support/node-db';

const now = '2026-08-06T12:00:00.000Z';

function fakeSocket(response: unknown): {
  socketFactory: (url: string) => {
    readyState: number;
    onopen: (() => void) | null;
    onmessage: ((event: { data: string }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    send(data: string): void;
    close(): void;
  };
  sent: () => string[];
} {
  const sentMessages: string[] = [];
  const socket = {
    readyState: 0,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onerror: null as (() => void) | null,
    onclose: null as (() => void) | null,
    send(data: string) {
      sentMessages.push(data);
      queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify(response) }));
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
    sent: () => sentMessages,
  };
}

async function seedVault(db: Db): Promise<void> {
  await applySchema(db);
  await insertVault(db, {
    id: 'vault-sync-service',
    vault_owner_label: 'Personal',
    default_currency: 'USD',
    locale: 'en-US',
    week_start: 'locale_default',
    demo_mode: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  await insertCategory(db, {
    id: 'category-food',
    vault_id: 'vault-sync-service',
    name: 'Food',
    slug: 'food',
    kind: 'expense',
    color_token: 'copper',
    icon_name: 'utensils',
    position: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
    version: 1,
  });
}

function localMutation(db: Db): Promise<void> {
  return persistMutation(db, {
    mutationId: 'local-sync-1',
    vaultId: 'vault-sync-service',
    deviceId: 'web-device',
    entityType: 'transaction',
    entityId: 'local-transaction',
    operation: 'create',
    baseVersion: 0,
    changedFields: ['occurred_on', 'merchant_display', 'amount_minor', 'currency'],
    ciphertext: 'opaque-local',
    origin: 'web',
    now,
    apply: (transactionDb) =>
      insertTransaction(
        transactionDb,
        newTransaction({
          id: 'local-transaction',
          vault_id: 'vault-sync-service',
          occurred_on: '2026-08-05',
          merchant_display: 'Local Cafe',
          amount_minor: -900,
          currency: 'USD',
          category_id: 'category-food',
          source_type: 'manual',
          now,
        }),
      ),
  });
}

describe('web foreground sync service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('marks local mutations applied only after the relay exchange responds', async () => {
    await withNodeDb(async (db) => {
      await seedVault(db);
      await localMutation(db);
      const response = {
        type: 'sync_exchange_response',
        response: {
          vault_id: 'vault-sync-service',
          mutations: [],
          checkpoint: { 'web-device': 1 },
          has_more: false,
          replay: false,
          conflicting_mutation_ids: [],
          rejected_mutation_ids: [],
          accepted_mutation_ids: ['local-sync-1'],
        },
      } as const;
      const fake = fakeSocket(response);
      const client = new RelayClient({
        url: 'ws://relay.test/ws',
        socketFactory: fake.socketFactory,
      });
      const result = await syncOnce(
        db,
        'vault-sync-service',
        { relayUrl: 'ws://relay.test/ws', deviceId: 'web-device' },
        undefined,
        client,
      );

      expect(result.status).toBe('relay_accepted');
      expect(result.uploaded).toBe(1);
      expect(result.acknowledged).toBe(1);
      expect(result.pending).toBe(0);
      expect(
        await db.get<{ status: string }>('SELECT status FROM mutation_log WHERE id = ?', [
          'local-sync-1',
        ]),
      ).toEqual({ status: 'exchanged' });
      expect(JSON.parse(fake.sent()[0]!).type).toBe('sync_exchange_request');
    });
  });

  it('keeps received opaque mutations pending when no trusted decoder is configured', async () => {
    await withNodeDb(async (db) => {
      await seedVault(db);
      const response = {
        type: 'sync_exchange_response',
        response: {
          vault_id: 'vault-sync-service',
          mutations: [
            {
              mutation_id: 'remote-1',
              vault_id: 'vault-sync-service',
              device_id: 'phone-device',
              clock: { lamport: 1, vector: { 'phone-device': 1 } },
              entity_type: 'transaction',
              entity_id: 'remote-transaction',
              operation: 'create',
              base_version: 0,
              changed_fields: ['occurred_on'],
              ciphertext: 'opaque-remote',
            },
          ],
          checkpoint: { 'phone-device': 1 },
          has_more: false,
          replay: false,
          conflicting_mutation_ids: [],
          rejected_mutation_ids: [],
          accepted_mutation_ids: ['local-sync-1'],
        },
      } as const;
      const fake = fakeSocket(response);
      const client = new RelayClient({
        url: 'ws://relay.test/ws',
        socketFactory: fake.socketFactory,
      });
      const result = await syncOnce(
        db,
        'vault-sync-service',
        { relayUrl: 'ws://relay.test/ws', deviceId: 'web-device' },
        undefined,
        client,
      );

      expect(result.status).toBe('partial');
      expect(result.remoteFailures).toBe(1);
      expect(result.errors[0]).toMatch(/no vault-key decoder/i);
      expect(
        await db.get<{ status: string; last_error_code: string; origin: string }>(
          'SELECT status, last_error_code, origin FROM mutation_log WHERE id = ?',
          ['remote-1'],
        ),
      ).toMatchObject({
        status: 'failed',
        last_error_code: 'REMOTE_DECODER_UNAVAILABLE',
        origin: 'relay',
      });
    });
  });

  it('applies a decoded remote transaction exactly once through the domain projection', async () => {
    await withNodeDb(async (db) => {
      await seedVault(db);
      const response = {
        type: 'sync_exchange_response',
        response: {
          vault_id: 'vault-sync-service',
          mutations: [
            {
              mutation_id: 'remote-transaction-1',
              vault_id: 'vault-sync-service',
              device_id: 'phone-device',
              clock: { lamport: 1, vector: { 'phone-device': 1 } },
              entity_type: 'transaction',
              entity_id: 'remote-transaction',
              operation: 'create',
              base_version: 0,
              changed_fields: ['occurred_on', 'merchant_display', 'amount_minor', 'currency'],
              ciphertext: 'opaque-remote',
            },
          ],
          checkpoint: { 'phone-device': 1 },
          has_more: false,
          replay: false,
          conflicting_mutation_ids: [],
          rejected_mutation_ids: [],
          accepted_mutation_ids: ['local-sync-1'],
        },
      } as const;
      const fake = fakeSocket(response);
      const client = new RelayClient({
        url: 'ws://relay.test/ws',
        socketFactory: fake.socketFactory,
      });
      const decoded = {
        entity: 'transaction' as const,
        value: {
          id: 'remote-transaction',
          vault_id: 'vault-sync-service',
          occurred_on: '2026-08-05',
          merchant_display: 'Phone Cafe',
          merchant_original: null,
          amount_minor: -1200,
          currency: 'USD',
          category_id: 'category-food',
          category_source: 'user' as const,
          category_confidence: 'confirmed' as const,
          note: null,
          source_type: 'manual' as const,
          statement_import_id: null,
          source_row_key: null,
          review_state: 'confirmed' as const,
          original_payload: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          version: 1,
          last_modified_by: 'ios' as const,
        },
      };
      const result = await syncOnce(
        db,
        'vault-sync-service',
        { relayUrl: 'ws://relay.test/ws', deviceId: 'web-device' },
        async () => ({ payload: decoded, origin: 'ios' }),
        client,
      );

      expect(result.applied).toBe(1);
      expect(result.remoteFailures).toBe(0);
      expect(
        await db.get<{ merchant_display: string }>(
          'SELECT merchant_display FROM transactions WHERE id = ?',
          ['remote-transaction'],
        ),
      ).toEqual({ merchant_display: 'Phone Cafe' });
      expect(
        await db.get<{ status: string }>('SELECT status FROM mutation_log WHERE id = ?', [
          'remote-transaction-1',
        ]),
      ).toEqual({ status: 'applied' });
    });
  });

  it('retries a previously blocked remote envelope when a decoder becomes available', async () => {
    await withNodeDb(async (db) => {
      await seedVault(db);
      const remoteEnvelope = {
        mutation_id: 'remote-retry-1',
        vault_id: 'vault-sync-service',
        device_id: 'phone-device',
        clock: { lamport: 1, vector: { 'phone-device': 1 } },
        entity_type: 'transaction' as const,
        entity_id: 'remote-retry-transaction',
        operation: 'create' as const,
        base_version: 0,
        changed_fields: ['occurred_on', 'merchant_display', 'amount_minor', 'currency'],
        ciphertext: 'opaque-remote-retry',
      };
      await (
        await import('@expense-tracker/domain')
      ).appendMutation(db, {
        mutationId: remoteEnvelope.mutation_id,
        vaultId: remoteEnvelope.vault_id,
        deviceId: remoteEnvelope.device_id,
        clock: remoteEnvelope.clock,
        entityType: remoteEnvelope.entity_type,
        entityId: remoteEnvelope.entity_id,
        operation: remoteEnvelope.operation,
        baseVersion: 0,
        changedFields: remoteEnvelope.changed_fields,
        ciphertext: remoteEnvelope.ciphertext,
        origin: 'relay',
        now,
      });
      await (
        await import('@expense-tracker/domain')
      ).markFailed(
        db,
        'vault-sync-service',
        remoteEnvelope.mutation_id,
        'REMOTE_DECODER_UNAVAILABLE',
      );
      const response = {
        type: 'sync_exchange_response',
        response: {
          vault_id: 'vault-sync-service',
          mutations: [],
          checkpoint: {},
          has_more: false,
          replay: false,
          conflicting_mutation_ids: [],
          rejected_mutation_ids: [],
          accepted_mutation_ids: [],
        },
      } as const;
      const fake = fakeSocket(response);
      const client = new RelayClient({
        url: 'ws://relay.test/ws',
        socketFactory: fake.socketFactory,
      });
      const result = await syncOnce(
        db,
        'vault-sync-service',
        { relayUrl: 'ws://relay.test/ws', deviceId: 'web-device' },
        async () => ({
          payload: {
            entity: 'transaction',
            value: {
              id: remoteEnvelope.entity_id,
              vault_id: remoteEnvelope.vault_id,
              occurred_on: '2026-08-05',
              merchant_display: 'Recovered Cafe',
              merchant_original: null,
              amount_minor: -500,
              currency: 'USD',
              category_id: 'category-food',
              category_source: 'user',
              category_confidence: 'confirmed',
              note: null,
              source_type: 'manual',
              statement_import_id: null,
              source_row_key: null,
              review_state: 'confirmed',
              original_payload: null,
              created_at: now,
              updated_at: now,
              deleted_at: null,
              version: 1,
              last_modified_by: 'ios',
            },
          },
          origin: 'ios',
        }),
        client,
      );
      expect(result.applied).toBe(1);
      expect(
        await db.get<{ status: string }>('SELECT status FROM mutation_log WHERE id = ?', [
          remoteEnvelope.mutation_id,
        ]),
      ).toEqual({ status: 'applied' });
      expect(
        await db.get<{ merchant_display: string }>(
          'SELECT merchant_display FROM transactions WHERE id = ?',
          [remoteEnvelope.entity_id],
        ),
      ).toEqual({ merchant_display: 'Recovered Cafe' });
    });
  });

  it('retains the pending queue when the relay is unavailable', async () => {
    await withNodeDb(async (db) => {
      await seedVault(db);
      await localMutation(db);
      const client = new RelayClient({
        url: 'ws://relay.test/ws',
        timeoutMs: 1,
        socketFactory: () => ({
          readyState: 3,
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
          send: () => {},
          close: () => {},
        }),
      });
      const result = await syncOnce(
        db,
        'vault-sync-service',
        { relayUrl: 'ws://relay.test/ws', deviceId: 'web-device' },
        undefined,
        client,
      );
      expect(result.status).toBe('failed');
      expect(result.pending).toBe(1);
      expect(
        await db.get<{ status: string; last_error_code: string }>(
          'SELECT status, last_error_code FROM mutation_log WHERE id = ?',
          ['local-sync-1'],
        ),
      ).toMatchObject({ status: 'failed', last_error_code: 'RELAY_UNAVAILABLE' });
    });
  });
});
