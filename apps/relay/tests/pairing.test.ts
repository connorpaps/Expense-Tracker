import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { WebSocket } from 'ws';
import { pairingIdentityProofContext, pairingWrappedKeyProofContext } from '@expense-tracker/contracts';
import type { PairingChallenge, RelayMessage } from '@expense-tracker/contracts';
import { createRelayServer } from '../src/relay-server';

function keyPair() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return { privateKey: pair.privateKey, publicKey };
}

function proof(privateKey: ReturnType<typeof keyPair>['privateKey'], context: string): string {
  return sign('sha256', Buffer.from(context), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}

async function startSecure() {
  const handle = createRelayServer({
    host: '127.0.0.1',
    port: 0,
    secureMode: true,
    enrollmentSecret: 'enrollment-secret',
    enrollmentVaultId: 'vault-1',
  });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', resolve));
  const address = handle.server.address();
  return { handle, port: typeof address === 'object' && address ? address.port : 0 };
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function next(socket: WebSocket): Promise<RelayMessage> {
  return new Promise((resolve) => socket.once('message', (data) => resolve(JSON.parse(String(data)) as RelayMessage)));
}

function startMessage(keys: ReturnType<typeof keyPair>, deviceId = 'pc', enrollmentSecret = 'enrollment-secret'): Extract<RelayMessage, { type: 'pairing_start' }> {
  return {
    type: 'pairing_start',
    pairing: {
      vault_id: 'vault-1',
      initiating_device_id: deviceId,
      initiating_public_key: keys.publicKey,
      capabilities: ['read', 'write', 'import', 'export'],
      enrollment_secret: enrollmentSecret,
    },
  };
}

describe('secure relay pairing foundation (T069/T074-T075)', () => {
  it('requires localhost secure mode, server challenge proof, wrapped-key proof, and distinct socket tokens', async () => {
    expect(() => createRelayServer({ host: '0.0.0.0', secureMode: true, enrollmentSecret: 's', enrollmentVaultId: 'vault-1' })).toThrow(/localhost-only/i);
    const { handle, port } = await startSecure();
    const initiator = await connect(port);
    const accepting = await connect(port);
    try {
      const initiatorKeys = keyPair();
      const acceptingKeys = keyPair();
      const challengePromise = next(initiator);
      initiator.send(JSON.stringify(startMessage(initiatorKeys)));
      const challengeMessage = await challengePromise;
      expect(challengeMessage.type).toBe('pairing_challenge');
      if (challengeMessage.type !== 'pairing_challenge') throw new Error('Expected pairing challenge.');
      const challenge: PairingChallenge = challengeMessage.pairing;
      initiator.send(JSON.stringify({ type: 'pairing_start_proof', proof: { session_id: challenge.session_id, signature: proof(initiatorKeys.privateKey, pairingIdentityProofContext({ role: 'initiator', session_id: challenge.session_id, vault_id: 'vault-1', challenge: challenge.challenge, device_id: 'pc', capabilities: ['read', 'write', 'import', 'export'] })) } } satisfies RelayMessage));

      accepting.send(JSON.stringify({
        type: 'pairing_accept',
        pairing: {
          session_id: challenge.session_id,
          pairing_code: challenge.pairing_code,
          accepting_device_id: 'phone',
          accepting_public_key: acceptingKeys.publicKey,
          capabilities: ['read'],
          proof: proof(acceptingKeys.privateKey, pairingIdentityProofContext({ role: 'accepting', session_id: challenge.session_id, vault_id: 'vault-1', challenge: challenge.challenge, device_id: 'phone', capabilities: ['read'] })),
        },
      } satisfies RelayMessage));
      const accepted = await next(initiator);
      expect(accepted.type).toBe('pairing_accepted');

      const wrapped = 'wrapped-vault-key';
      const completeInitiator = next(initiator);
      const completeAccepting = next(accepting);
      initiator.send(JSON.stringify({
        type: 'pairing_confirm',
        pairing: {
          session_id: challenge.session_id,
          key_version: 1,
          wrapped_vault_key: wrapped,
          signature: proof(initiatorKeys.privateKey, pairingWrappedKeyProofContext({ session_id: challenge.session_id, vault_id: 'vault-1', challenge: challenge.challenge, accepting_device_id: 'phone', key_version: 1, wrapped_vault_key: wrapped })),
        },
      } satisfies RelayMessage));
      const initiatorComplete = await completeInitiator;
      const acceptingComplete = await completeAccepting;
      expect(initiatorComplete.type).toBe('pairing_complete');
      expect(acceptingComplete.type).toBe('pairing_complete');
      if (initiatorComplete.type !== 'pairing_complete' || acceptingComplete.type !== 'pairing_complete') throw new Error('Expected pairing completion.');
      expect(initiatorComplete.pairing.authorization_token).not.toBe(acceptingComplete.pairing.authorization_token);
      expect(acceptingComplete.pairing.wrapped_vault_key).toBe(wrapped);

      const unauthenticated = await connect(port);
      try {
        const denied = next(unauthenticated);
        unauthenticated.send(JSON.stringify({
          type: 'sync_exchange_request',
          request: { vault_id: 'vault-1', device_id: 'phone', known_clock: {}, requested_limit: 10, mutations: [], batch_id: 'unauthorized', oldest_pending_mutation_id: null, authorization_token: initiatorComplete.pairing.authorization_token },
        } satisfies RelayMessage));
        const deniedMessage = await denied;
        expect(deniedMessage).toEqual({ type: 'relay_error', code: 'not_authorized' });
      } finally { unauthenticated.close(); }

      const authorized = next(accepting);
      accepting.send(JSON.stringify({
        type: 'sync_exchange_request',
        request: { vault_id: 'vault-1', device_id: 'phone', known_clock: {}, requested_limit: 10, mutations: [], batch_id: 'authorized', oldest_pending_mutation_id: null, authorization_token: acceptingComplete.pairing.authorization_token },
      } satisfies RelayMessage));
      const authorizedMessage = await authorized;
      expect(authorizedMessage.type).toBe('sync_exchange_response');

      const uploadDenied = next(accepting);
      accepting.send(JSON.stringify({
        type: 'sync_exchange_request',
        request: {
          vault_id: 'vault-1', device_id: 'phone', known_clock: {}, requested_limit: 10,
          mutations: [{ mutation_id: 'read-only-upload', vault_id: 'vault-1', device_id: 'phone', clock: { lamport: 1, vector: { phone: 1 } }, entity_type: 'transaction', entity_id: 'read-only-upload', operation: 'create', base_version: 0, changed_fields: ['amount_minor'], ciphertext: 'opaque' }],
          batch_id: 'read-only-upload', oldest_pending_mutation_id: null, authorization_token: acceptingComplete.pairing.authorization_token,
        },
      } satisfies RelayMessage));
      expect(await uploadDenied).toEqual({ type: 'relay_error', code: 'not_authorized' });

      const revokeAck = next(initiator);
      initiator.send(JSON.stringify({
        type: 'revoke_device',
        request: { vault_id: 'vault-1', paired_device_id: 'phone', authorization_token: initiatorComplete.pairing.authorization_token },
      } satisfies RelayMessage));
      expect(await revokeAck).toEqual({ type: 'relay_ack', envelope_id: 'phone', replay: false });
      const revokedExchange = next(accepting);
      accepting.send(JSON.stringify({
        type: 'sync_exchange_request',
        request: { vault_id: 'vault-1', device_id: 'phone', known_clock: {}, requested_limit: 10, mutations: [], batch_id: 'revoked', oldest_pending_mutation_id: null, authorization_token: acceptingComplete.pairing.authorization_token },
      } satisfies RelayMessage));
      expect(await revokedExchange).toEqual({ type: 'relay_error', code: 'not_authorized' });

      const secondAccepting = await connect(port);
      try {
        const secondChallengePromise = next(initiator);
        const existingStart = startMessage(initiatorKeys, 'pc', '');
        existingStart.pairing.authorization_token = initiatorComplete.pairing.authorization_token;
        initiator.send(JSON.stringify(existingStart));
        const secondChallengeMessage = await secondChallengePromise;
        expect(secondChallengeMessage.type).toBe('pairing_challenge');
        if (secondChallengeMessage.type !== 'pairing_challenge') throw new Error('Expected second pairing challenge.');
        const secondChallenge = secondChallengeMessage.pairing;
        initiator.send(JSON.stringify({ type: 'pairing_start_proof', proof: { session_id: secondChallenge.session_id, signature: proof(initiatorKeys.privateKey, pairingIdentityProofContext({ role: 'initiator', session_id: secondChallenge.session_id, vault_id: 'vault-1', challenge: secondChallenge.challenge, device_id: 'pc', capabilities: ['read', 'write', 'import', 'export'] })) } } satisfies RelayMessage));
        const secondKeys = keyPair();
        secondAccepting.send(JSON.stringify({
          type: 'pairing_accept',
          pairing: {
            session_id: secondChallenge.session_id,
            pairing_code: secondChallenge.pairing_code,
            accepting_device_id: 'phone-2',
            accepting_public_key: secondKeys.publicKey,
            capabilities: ['read'],
            proof: proof(secondKeys.privateKey, pairingIdentityProofContext({ role: 'accepting', session_id: secondChallenge.session_id, vault_id: 'vault-1', challenge: secondChallenge.challenge, device_id: 'phone-2', capabilities: ['read'] })),
          },
        } satisfies RelayMessage));
        expect((await next(initiator)).type).toBe('pairing_accepted');
        const secondWrapped = 'wrapped-vault-key-2';
        const missingToken = next(initiator);
        initiator.send(JSON.stringify({ type: 'pairing_confirm', pairing: { session_id: secondChallenge.session_id, key_version: 1, wrapped_vault_key: secondWrapped, signature: proof(initiatorKeys.privateKey, pairingWrappedKeyProofContext({ session_id: secondChallenge.session_id, vault_id: 'vault-1', challenge: secondChallenge.challenge, accepting_device_id: 'phone-2', key_version: 1, wrapped_vault_key: secondWrapped })) } } satisfies RelayMessage));
        expect(await missingToken).toEqual({ type: 'relay_error', code: 'initiator_authorization_missing' });

        // A failed confirmation must not register phone-2 before the authority credential is present.
        const retryAccepting = await connect(port);
        try {
          const retryChallengePromise = next(initiator);
          const retryStart = startMessage(initiatorKeys, 'pc', '');
          retryStart.pairing.authorization_token = initiatorComplete.pairing.authorization_token;
          initiator.send(JSON.stringify(retryStart));
          const retryChallengeMessage = await retryChallengePromise;
          expect(retryChallengeMessage.type).toBe('pairing_challenge');
          if (retryChallengeMessage.type !== 'pairing_challenge') throw new Error('Expected retry pairing challenge.');
          const retryChallenge = retryChallengeMessage.pairing;
          initiator.send(JSON.stringify({ type: 'pairing_start_proof', proof: { session_id: retryChallenge.session_id, signature: proof(initiatorKeys.privateKey, pairingIdentityProofContext({ role: 'initiator', session_id: retryChallenge.session_id, vault_id: 'vault-1', challenge: retryChallenge.challenge, device_id: 'pc', capabilities: ['read', 'write', 'import', 'export'] })) } } satisfies RelayMessage));
          const retryAccepted = next(initiator);
          retryAccepting.send(JSON.stringify({ type: 'pairing_accept', pairing: { session_id: retryChallenge.session_id, pairing_code: retryChallenge.pairing_code, accepting_device_id: 'phone-2', accepting_public_key: secondKeys.publicKey, capabilities: ['read'], proof: proof(secondKeys.privateKey, pairingIdentityProofContext({ role: 'accepting', session_id: retryChallenge.session_id, vault_id: 'vault-1', challenge: retryChallenge.challenge, device_id: 'phone-2', capabilities: ['read'] })) } } satisfies RelayMessage));
          expect((await retryAccepted).type).toBe('pairing_accepted');
        } finally { retryAccepting.close(); }

        const secondInitiatorComplete = next(initiator);
        const secondAcceptingComplete = next(secondAccepting);
        initiator.send(JSON.stringify({ type: 'pairing_confirm', pairing: { session_id: secondChallenge.session_id, authorization_token: initiatorComplete.pairing.authorization_token, key_version: 1, wrapped_vault_key: secondWrapped, signature: proof(initiatorKeys.privateKey, pairingWrappedKeyProofContext({ session_id: secondChallenge.session_id, vault_id: 'vault-1', challenge: secondChallenge.challenge, accepting_device_id: 'phone-2', key_version: 1, wrapped_vault_key: secondWrapped })) } } satisfies RelayMessage));
        expect((await secondInitiatorComplete).type).toBe('pairing_complete');
        expect((await secondAcceptingComplete).type).toBe('pairing_complete');
      } finally { secondAccepting.close(); }
    } finally {
      initiator.close();
      accepting.close();
      await handle.close();
    }
  });

  it('reserves first enrollment and releases it when the initiating socket closes', async () => {
    const { handle, port } = await startSecure();
    const first = await connect(port);
    const second = await connect(port);
    try {
      const firstKeys = keyPair();
      const firstChallenge = next(first);
      first.send(JSON.stringify(startMessage(firstKeys)));
      expect((await firstChallenge).type).toBe('pairing_challenge');
      const denied = next(second);
      second.send(JSON.stringify({ type: 'pairing_start', pairing: startMessage(keyPair()).pairing } satisfies RelayMessage));
      expect(await denied).toEqual({ type: 'relay_error', code: 'enrollment_in_progress' });
      first.close();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const afterClose = next(second);
      second.send(JSON.stringify({ type: 'pairing_start', pairing: startMessage(keyPair()).pairing } satisfies RelayMessage));
      expect((await afterClose).type).toBe('pairing_challenge');
    } finally {
      first.close();
      second.close();
      await handle.close();
    }
  });

  it('rejects wrong enrollment vault, invalid proof, and pairing in insecure mode', async () => {
    const secure = createRelayServer({ host: '127.0.0.1', port: 0, secureMode: true, enrollmentSecret: 'secret', enrollmentVaultId: 'vault-1' });
    await new Promise<void>((resolve) => secure.server.listen(0, '127.0.0.1', resolve));
    const address = secure.server.address();
    const socket = await connect(typeof address === 'object' && address ? address.port : 0);
    try {
      const keys = keyPair();
      const denied = next(socket);
      const wrongVaultStart = startMessage(keys);
      socket.send(JSON.stringify({ ...wrongVaultStart, pairing: { ...wrongVaultStart.pairing, vault_id: 'vault-2' } }));
      expect(await denied).toEqual({ type: 'relay_error', code: 'pairing_authorization_required' });

      const badProof = next(socket);
      socket.send(JSON.stringify(startMessage(keys, 'pc', 'secret')));
      const challenge = await badProof;
      expect(challenge.type).toBe('pairing_challenge');
      if (challenge.type === 'pairing_challenge') {
        const invalid = next(socket);
        socket.send(JSON.stringify({ type: 'pairing_start_proof', proof: { session_id: challenge.pairing.session_id, signature: proof(keys.privateKey, pairingIdentityProofContext({ role: 'initiator', session_id: challenge.pairing.session_id, vault_id: 'vault-1', challenge: challenge.pairing.challenge, device_id: 'pc', capabilities: ['read'] })) } } satisfies RelayMessage));
        expect(await invalid).toEqual({ type: 'relay_error', code: 'invalid_initiator_proof' });
      }
    } finally { socket.close(); await secure.close(); }

    const insecure = createRelayServer({ host: '127.0.0.1', port: 0, secureMode: false, insecureTestMode: true });
    await new Promise<void>((resolve) => insecure.server.listen(0, '127.0.0.1', resolve));
    const insecureAddress = insecure.server.address();
    const insecureSocket = await connect(typeof insecureAddress === 'object' && insecureAddress ? insecureAddress.port : 0);
    try {
      const denied = next(insecureSocket);
      insecureSocket.send(JSON.stringify({ type: 'pairing_start', pairing: { vault_id: 'vault-1', initiating_device_id: 'pc', initiating_public_key: 'bad', capabilities: [], enrollment_secret: 'secret' } } satisfies RelayMessage));
      expect(await denied).toEqual({ type: 'relay_error', code: 'secure_pairing_required' });
    } finally { insecureSocket.close(); await insecure.close(); }
  });
});
