/**
 * Relay tests (T003 + T023). Covers the local relay server surface (health,
 * WebSocket keepalive, opaque envelope replay detection) and the test harness
 * utilities sync tests rely on: deterministic clocks, AES-GCM/ECDH envelope
 * helpers, and the test-only local transport's replay/idempotency assertions.
 */

import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { RelayMessage, VectorClock } from '@expense-tracker/contracts';
import { createRelayServer, OpaqueEnvelopeStore } from '../src/relay-server';
import { DeterministicLamportClock, tickVectorClock, mergeVectorClocks, clockAsserter } from './support/deterministic-clock';
import { TestEnvelopeCipher, TestDeviceKeyWrapper, buildMutationEnvelope, splitEnvelopeCiphertext, toBase64Url } from './support/envelope-helpers';
import { InMemoryRelayTransport, assertExactlyOnce } from './support/local-transport';

async function startRelay() {
  const handle = createRelayServer({ host: '127.0.0.1', port: 0, secureMode: false, insecureTestMode: true });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', resolve));
  const address = handle.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { handle, port };
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<RelayMessage> {
  return new Promise((resolve) => {
    socket.once('message', (data) => resolve(JSON.parse(String(data)) as RelayMessage));
  });
}

describe('relay server (T003)', () => {
  it('serves a health endpoint with version and opaque-envelope guarantees', async () => {
    const { handle, port } = await startRelay();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body.stores_only_opaque_envelopes).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it('answers WebSocket keepalives', async () => {
    const { handle, port } = await startRelay();
    const socket = await connect(port);
    try {
      const reply = nextMessage(socket);
      socket.send(JSON.stringify({ type: 'pong' } satisfies RelayMessage));
      expect(await reply).toEqual({ type: 'pong' });
    } finally {
      socket.close();
      await handle.close();
    }
  });

  it('stores uploaded opaque mutations and returns only mutations beyond the known clock', async () => {
    const { handle, port } = await startRelay();
    const socket = await connect(port);
    try {
      const makeMutation = (id: string, deviceId: string, lamport: number, vaultId = 'vault-1') => ({
        mutation_id: id,
        vault_id: vaultId,
        device_id: deviceId,
        clock: { lamport, vector: { [deviceId]: lamport } },
        entity_type: 'transaction' as const,
        entity_id: id,
        operation: 'create' as const,
        base_version: 0,
        changed_fields: ['amount_minor'],
        ciphertext: `opaque-${id}`,
      });
      const request: RelayMessage = {
        type: 'sync_exchange_request',
        request: {
          vault_id: 'vault-1',
          device_id: 'phone',
          known_clock: { web: 1 },
          requested_limit: 1,
          mutations: [makeMutation('m-1', 'web', 1), makeMutation('m-2', 'web', 2), makeMutation('m-3', 'web', 3), makeMutation('wrong-vault', 'web', 4, 'vault-2')],
          batch_id: 'batch-upload-1',
          oldest_pending_mutation_id: 'm-1',
        },
      };
      const reply = nextMessage(socket);
      socket.send(JSON.stringify(request));
      const message = await reply;
      expect(message.type).toBe('sync_exchange_response');
      if (message.type === 'sync_exchange_response') {
        expect(message.response.mutations.map((mutation) => mutation.mutation_id)).toEqual(['m-2']);
        expect(message.response.has_more).toBe(true);
        expect(message.response.checkpoint).toEqual({ web: 2 });
        expect(message.response.replay).toBe(false);
        expect(message.response.conflicting_mutation_ids).toEqual([]);
      }
      expect(handle.store.mutationCount('vault-1')).toBe(3);
      expect(handle.store.mutationCount('vault-2')).toBe(0);
    } finally {
      socket.close();
      await handle.close();
    }
  });

  it('detects retried exchange batches as replays (idempotent acks)', async () => {
    const { handle, port } = await startRelay();
    const socket = await connect(port);
    try {
      const request: RelayMessage = {
        type: 'sync_exchange_request',
        request: {
          vault_id: 'vault-1',
          device_id: 'phone',
          known_clock: {},
          requested_limit: 100,
          mutations: [],
          batch_id: 'batch-42',
          oldest_pending_mutation_id: null,
        },
      };
      const first = nextMessage(socket);
      socket.send(JSON.stringify(request));
      const firstAck = await first;
      expect(firstAck.type).toBe('sync_exchange_response');

      const second = nextMessage(socket);
      socket.send(JSON.stringify({
        ...request,
        request: {
          ...request.request,
          known_clock: { web: 99 },
          mutations: [
            {
              mutation_id: 'late-mutation',
              vault_id: 'vault-1',
              device_id: 'phone',
              clock: { lamport: 1, vector: { phone: 1 } },
              entity_type: 'transaction',
              entity_id: 'late-mutation',
              operation: 'create',
              base_version: 0,
              changed_fields: [],
              ciphertext: 'must-not-append',
            },
          ],
        },
      }));
      const secondAck = await second;
      expect(secondAck.type).toBe('sync_exchange_response');
      if (secondAck.type === 'sync_exchange_response') {
        expect(secondAck.response.replay).toBe(true);
        expect(secondAck.response.mutations).toEqual([]);
        expect(secondAck.response.checkpoint).toEqual(firstAck.type === 'sync_exchange_response' ? firstAck.response.checkpoint : {});
      }
      expect(handle.store.mutationCount('vault-1')).toBe(0);
      expect(handle.store.isReplay('vault-1:phone:batch-42')).toBe(true);
      expect(handle.store.size()).toBe(1);
    } finally {
      socket.close();
      await handle.close();
    }
  });

  it('treats reordered equivalent envelope fields as a duplicate', () => {
    const store = new OpaqueEnvelopeStore(10);
    const mutation = {
      mutation_id: 'm-equivalent',
      vault_id: 'vault-1',
      device_id: 'web',
      clock: { lamport: 1, vector: { web: 1, ios: 0 } },
      entity_type: 'transaction' as const,
      entity_id: 'tx-1',
      operation: 'create' as const,
      base_version: 0,
      changed_fields: ['amount_minor', 'merchant_display'],
      ciphertext: 'opaque-a',
    };
    expect(store.appendMutation(mutation)).toBe('inserted');
    const reordered = {
      ciphertext: mutation.ciphertext,
      changed_fields: ['merchant_display', 'amount_minor'],
      operation: mutation.operation,
      base_version: mutation.base_version,
      entity_id: mutation.entity_id,
      entity_type: mutation.entity_type,
      clock: { lamport: 1, vector: { ios: 0, web: 1 } },
      device_id: mutation.device_id,
      vault_id: mutation.vault_id,
      mutation_id: mutation.mutation_id,
    };
    expect(store.appendMutation(reordered)).toBe('duplicate');
  });

  it('reports conflicting duplicate IDs and retains the original envelope', () => {
    const store = new OpaqueEnvelopeStore(10);
    const mutation = {
      mutation_id: 'm-conflict',
      vault_id: 'vault-1',
      device_id: 'web',
      clock: { lamport: 1, vector: { web: 1 } },
      entity_type: 'transaction' as const,
      entity_id: 'tx-1',
      operation: 'create' as const,
      base_version: 0,
      changed_fields: ['amount_minor'],
      ciphertext: 'opaque-a',
    };
    expect(store.appendMutation(mutation)).toBe('inserted');
    expect(store.appendMutation({ ...mutation, ciphertext: 'opaque-b' })).toBe('conflict');
    expect(store.mutationCount('vault-1')).toBe(1);
    const response = store.exchange('vault-1', {}, 10, false, ['m-conflict']);
    expect(response.mutations[0]?.ciphertext).toBe('opaque-a');
    expect(response.conflicting_mutation_ids).toEqual(['m-conflict']);
    expect(response.rejected_mutation_ids).toEqual([]);
  });

  it('caps oversized upload and response requests at defensive relay limits', async () => {
    const { handle, port } = await startRelay();
    const socket = await connect(port);
    try {
      const mutations = Array.from({ length: 1_005 }, (_, index) => ({
        mutation_id: `large-${index}`,
        vault_id: 'vault-large',
        device_id: 'web',
        clock: { lamport: index + 1, vector: { web: index + 1 } },
        entity_type: 'transaction' as const,
        entity_id: `tx-${index}`,
        operation: 'create' as const,
        base_version: 0,
        changed_fields: [],
        ciphertext: `opaque-${index}`,
      }));
      const reply = nextMessage(socket);
      socket.send(JSON.stringify({
        type: 'sync_exchange_request',
        request: {
          vault_id: 'vault-large',
          device_id: 'phone',
          known_clock: {},
          requested_limit: 5_000,
          mutations,
          batch_id: 'large-batch',
          oldest_pending_mutation_id: 'large-0',
        },
      } satisfies RelayMessage));
      const response = await reply;
      expect(response.type).toBe('sync_exchange_response');
      if (response.type === 'sync_exchange_response') {
        expect(response.response.mutations).toHaveLength(1_000);
        expect(response.response.has_more).toBe(false);
        expect(response.response.rejected_mutation_ids).toHaveLength(5);
        expect(response.response.rejected_mutation_ids[0]).toBe('large-1000');
      }
      expect(handle.store.mutationCount('vault-large')).toBe(1_000);
    } finally {
      socket.close();
      await handle.close();
    }
  });

  it('evicts mutations in global insertion order across vaults', () => {
    const store = new OpaqueEnvelopeStore(2);
    const makeMutation = (id: string, vaultId: string) => ({
      mutation_id: id,
      vault_id: vaultId,
      device_id: 'web',
      clock: { lamport: 1, vector: { web: 1 } },
      entity_type: 'transaction' as const,
      entity_id: id,
      operation: 'create' as const,
      base_version: 0,
      changed_fields: [],
      ciphertext: id,
    });
    store.appendMutation(makeMutation('first', 'vault-a'));
    store.appendMutation(makeMutation('second', 'vault-b'));
    store.appendMutation(makeMutation('third', 'vault-a'));
    expect(store.mutationCount('vault-a')).toBe(1);
    expect(store.mutationCount('vault-b')).toBe(1);
    expect(store.exchange('vault-a', {}, 10).mutations.map((item) => item.mutation_id)).toEqual(['third']);
  });
});

describe('deterministic clocks (T023)', () => {
  it('advances Lamport counters on tick and observe', () => {
    const clock = new DeterministicLamportClock();
    expect(clock.tick()).toBe(1);
    expect(clock.tick()).toBe(2);
    expect(clock.observe(5)).toBe(6);
    expect(clock.value).toBe(6);
  });

  it('ticks and merges vector clocks per device', () => {
    const a = tickVectorClock({}, 'web');
    expect(a).toEqual({ web: 1 });
    const b = tickVectorClock({ web: 1, ios: 0 }, 'ios');
    expect(b).toEqual({ web: 1, ios: 1 });
    expect(mergeVectorClocks(a, b)).toEqual({ web: 1, ios: 1 });
  });

  it('orders causal and concurrent clocks correctly', () => {
    const asserts = clockAsserter();
    const v1 = tickVectorClock({}, 'web');
    const v2 = tickVectorClock(v1, 'web');
    asserts.assertHappenedBefore(v1, v2);

    const phoneA = tickVectorClock({}, 'ios');
    const phoneB = tickVectorClock({}, 'ios');
    asserts.assertConcurrent(phoneA, phoneB);

    const diverged: VectorClock = { web: 2, ios: 1 };
    const base = { web: 1, ios: 1 };
    asserts.assertHappenedBefore(base, diverged);
    asserts.assertConcurrent({ web: 2, ios: 1 }, { web: 1, ios: 2 });
  });
});

describe('envelope helpers (T023)', () => {
  it('round-trips AES-GCM envelopes and binds AAD', async () => {
    const cipher = await TestEnvelopeCipher.create();
    const aad = new TextEncoder().encode('vault-1:tx-1');
    const envelope = await cipher.encrypt(new TextEncoder().encode('{"merchant":"Starbucks"}'), aad);
    const plaintext = await cipher.decrypt(envelope, aad);
    expect(new TextDecoder().decode(plaintext)).toBe('{"merchant":"Starbucks"}');

    await expect(cipher.decrypt(envelope, new TextEncoder().encode('wrong-context'))).rejects.toThrow();
  });

  it('builds and splits contract-shaped mutation envelopes', async () => {
    const cipher = await TestEnvelopeCipher.create();
    const envelope = await buildMutationEnvelope(
      cipher,
      {
        mutation_id: 'm-1',
        vault_id: 'vault-1',
        device_id: 'phone',
        entity_type: 'transaction',
        entity_id: 'tx-1',
        operation: 'create',
        changed_fields: ['merchant_display', 'amount_minor'],
        payload: { merchant_display: 'Uber', amount_minor: -1234 },
      },
      { lamport: 3, vector: { phone: 3 } },
    );
    expect(envelope.ciphertext.split('.')).toHaveLength(3);

    const parts = splitEnvelopeCiphertext(envelope.ciphertext);
    const decrypted = await cipher.decrypt(parts, new TextEncoder().encode('vault-1:tx-1:m-1'));
    expect(JSON.parse(new TextDecoder().decode(decrypted))).toEqual({ merchant_display: 'Uber', amount_minor: -1234 });
  });

  it('wraps and unwraps a vault key with P-256 ECDH', async () => {
    const wrapper = new TestDeviceKeyWrapper();
    const phone = await wrapper.generateKeyPair();
    const vaultKey = globalThis.crypto.getRandomValues(new Uint8Array(32));

    const wrapped = await wrapper.wrapVaultKey(vaultKey, phone.publicKey);
    expect(wrapped.keyVersion).toBe(1);
    const unwrapped = await wrapper.unwrapVaultKey(wrapped, phone.privateKey);
    expect(toBase64Url(unwrapped)).toBe(toBase64Url(vaultKey));

    // A different device must not be able to open the wrapped key.
    const stranger = await wrapper.generateKeyPair();
    await expect(wrapper.unwrapVaultKey(wrapped, stranger.privateKey)).rejects.toThrow();
  });
});

describe('local transport (T023)', () => {
  it('flags retried batches as replays and records exactly once', () => {
    const transport = new InMemoryRelayTransport();
    const request: RelayMessage = {
      type: 'sync_exchange_request',
      request: {
        vault_id: 'vault-1',
        device_id: 'phone',
        known_clock: {},
        requested_limit: 50,
        batch_id: 'batch-replay-1',
        oldest_pending_mutation_id: null,
      },
    };

    transport.sendFromClient(request);
    transport.sendFromClient(request);
    transport.sendFromClient(request);

    expect(transport.replayCount()).toBe(2);
    assertExactlyOnce(transport.deliveredLog(), 'batch-replay-1');

    transport.acknowledge();
    expect(transport.deliveredLog().some((d) => d.direction === 'relay_to_client' && d.message.type === 'pong')).toBe(true);
  });
});
