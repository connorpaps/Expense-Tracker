/**
 * Local relay server. Production mode fails closed until devices complete a
 * server-driven, proof-of-possession pairing handshake. The relay stores only
 * opaque mutation/snapshot envelopes; durable device registry and TLS remain
 * separate deployment work.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createHash, createPublicKey, createVerify, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { pairingIdentityProofContext, pairingWrappedKeyProofContext } from '@expense-tracker/contracts';
import type {
  MutationEnvelope,
  RelayMessage,
  KnownClock,
  SyncExchangeResponse,
  PairingCapabilities,
} from '@expense-tracker/contracts';

export interface RelayOptions {
  host: string;
  port: number;
  name: string;
  version: string;
  /** Secure by default. `false` is allowed only for the Vitest transport harness. */
  secureMode: boolean;
  /** Explicit test-only escape hatch for the pre-authenticated opaque transport tests. */
  insecureTestMode?: boolean;
  /** Required to authorize first-device enrollment in secure mode. */
  enrollmentSecret?: string;
  /** Limits first enrollment to the explicitly provisioned vault. */
  enrollmentVaultId?: string;
  pairingTtlMs: number;
  authorizationTtlMs: number;
}

export interface RelayHandle {
  server: Server;
  wsServer: WebSocketServer;
  readonly port: number;
  store: OpaqueEnvelopeStore;
  close(): Promise<void>;
}

export const DEFAULT_RELAY_OPTIONS: RelayOptions = {
  host: '127.0.0.1',
  port: 8712,
  name: 'Expense Tracker relay',
  version: '0.1.0',
  secureMode: true,
  enrollmentVaultId: undefined,
  pairingTtlMs: 5 * 60 * 1000,
  authorizationTtlMs: 30 * 24 * 60 * 60 * 1000,
};

const MAX_MUTATIONS_PER_BATCH = 1_000;
const MAX_MUTATIONS_PER_RESPONSE = 1_000;

export class OpaqueEnvelopeStore {
  private readonly mutations = new Map<string, Map<string, MutationEnvelope>>();
  private readonly mutationOrder: Array<{ vaultId: string; mutationId: string }> = [];
  private readonly seen = new Map<string, number>();
  private readonly exchangeResponses = new Map<string, SyncExchangeResponse>();

  constructor(private readonly maxEntries = 10_000, private readonly ttlMs = 24 * 60 * 60 * 1000) {}

  isReplay(id: string, now = Date.now()): boolean { this.prune(now); return this.seen.has(id); }

  record(id: string, receivedAt = new Date().toISOString()): void {
    const timestamp = Date.parse(receivedAt);
    const now = Number.isNaN(timestamp) ? Date.now() : timestamp;
    this.prune(now);
    this.seen.set(id, now);
    while (this.seen.size > this.maxEntries) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
      this.exchangeResponses.delete(oldest);
    }
  }

  receivedAt(id: string): string | undefined {
    const timestamp = this.seen.get(id);
    return timestamp === undefined ? undefined : new Date(timestamp).toISOString();
  }

  size(): number { this.prune(Date.now()); return this.seen.size; }

  appendMutation(mutation: MutationEnvelope): 'inserted' | 'duplicate' | 'conflict' {
    let vaultMutations = this.mutations.get(mutation.vault_id);
    if (!vaultMutations) { vaultMutations = new Map(); this.mutations.set(mutation.vault_id, vaultMutations); }
    const existing = vaultMutations.get(mutation.mutation_id);
    if (existing) return canonicalMutation(existing) === canonicalMutation(mutation) ? 'duplicate' : 'conflict';
    vaultMutations.set(mutation.mutation_id, mutation);
    this.mutationOrder.push({ vaultId: mutation.vault_id, mutationId: mutation.mutation_id });
    while (this.mutationOrder.length > this.maxEntries) {
      const oldest = this.mutationOrder.shift();
      if (!oldest) break;
      const entries = this.mutations.get(oldest.vaultId);
      if (!entries?.delete(oldest.mutationId)) continue;
      if (entries.size === 0) this.mutations.delete(oldest.vaultId);
    }
    return 'inserted';
  }

  exchange(vaultId: string, knownClock: KnownClock, limit: number, replay = false, conflictingMutationIds: string[] = [], rejectedMutationIds: string[] = [], acceptedMutationIds: string[] = []): SyncExchangeResponse {
    const all = [...(this.mutations.get(vaultId)?.values() ?? [])].sort((a, b) => a.clock.lamport - b.clock.lamport || a.mutation_id.localeCompare(b.mutation_id));
    const eligible = all.filter((mutation) => mutation.clock.lamport > (knownClock[mutation.device_id] ?? 0));
    const mutations = eligible.slice(0, Math.max(0, limit));
    const checkpoint: KnownClock = { ...knownClock };
    for (const mutation of mutations) checkpoint[mutation.device_id] = Math.max(checkpoint[mutation.device_id] ?? 0, mutation.clock.lamport);
    return { vault_id: vaultId, mutations, checkpoint, has_more: mutations.length < eligible.length, replay, conflicting_mutation_ids: conflictingMutationIds, rejected_mutation_ids: rejectedMutationIds, accepted_mutation_ids: acceptedMutationIds };
  }

  mutationCount(vaultId: string): number { return this.mutations.get(vaultId)?.size ?? 0; }
  responseForReplay(id: string): SyncExchangeResponse | undefined { const response = this.exchangeResponses.get(id); return response ? cloneResponse(response) : undefined; }
  rememberResponse(id: string, response: SyncExchangeResponse): void { this.exchangeResponses.set(id, cloneResponse(response)); }

  private prune(now: number): void {
    for (const [id, timestamp] of this.seen) if (now - timestamp > this.ttlMs) { this.seen.delete(id); this.exchangeResponses.delete(id); }
  }
}

type DeviceRecord = {
  vaultId: string;
  deviceId: string;
  publicKey: string;
  capabilities: PairingCapabilities;
  tokenHash: string;
  authority: boolean;
  expiresAt: number;
  revoked: boolean;
};

type PairingSession = {
  id: string;
  code: string;
  vaultId: string;
  challenge: string;
  expiresAt: number;
  initiatorSocket: WebSocket;
  initiatorDeviceId: string;
  initiatorPublicKey: string;
  initiatorCapabilities: PairingCapabilities;
  initiatorProofed: boolean;
  firstEnrollment: boolean;
  initiatorTokenHash?: string;
  acceptingSocket?: WebSocket;
  acceptingDeviceId?: string;
  acceptingPublicKey?: string;
  acceptingCapabilities?: PairingCapabilities;
  acceptingProofed: boolean;
};

class PairingAuthority {
  private readonly sessions = new Map<string, PairingSession>();
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly consumedEnrollmentVaults = new Set<string>();
  private readonly reservedEnrollmentVaults = new Set<string>();
  private readonly socketTokens = new Map<WebSocket, string>();

  constructor(private readonly options: RelayOptions) {}

  start(socket: WebSocket, pairing: Extract<RelayMessage, { type: 'pairing_start' }>['pairing']): void {
    this.prune();
    if (!pairing.vault_id || !pairing.initiating_device_id || !validPublicKey(pairing.initiating_public_key) || !validCapabilities(pairing.capabilities)) return this.error(socket, 'invalid_pairing_identity');
    const existing = this.devices.get(this.key(pairing.vault_id, pairing.initiating_device_id));
    if (existing?.revoked) return this.error(socket, 'device_revoked');
    const authorizedExisting = existing && !existing.revoked && existing.expiresAt > Date.now() && !!pairing.authorization_token && tokenMatches(pairing.authorization_token, existing.tokenHash);
    const firstEnrollment = !existing && !this.consumedEnrollmentVaults.has(pairing.vault_id) && !!this.options.enrollmentSecret && this.options.enrollmentVaultId === pairing.vault_id && safeSecretEqual(pairing.enrollment_secret, this.options.enrollmentSecret);
    if (firstEnrollment && this.reservedEnrollmentVaults.has(pairing.vault_id)) return this.error(socket, 'enrollment_in_progress');
    if (authorizedExisting && !existing.authority) return this.error(socket, 'authority_required');
    if (authorizedExisting) this.socketTokens.set(socket, existing.tokenHash);
    if (!authorizedExisting && !firstEnrollment) return this.error(socket, 'pairing_authorization_required');
    const id = randomUUID();
    if (this.sessions.size >= 256) return this.error(socket, 'pairing_capacity_reached');
    const session: PairingSession = {
      id, code: randomBytes(4).toString('hex').toUpperCase(), vaultId: pairing.vault_id,
      challenge: randomBytes(32).toString('base64url'), expiresAt: Date.now() + this.options.pairingTtlMs,
      initiatorSocket: socket, initiatorDeviceId: pairing.initiating_device_id, initiatorPublicKey: pairing.initiating_public_key,
      initiatorCapabilities: pairing.capabilities, initiatorProofed: false, firstEnrollment,
      initiatorTokenHash: existing?.tokenHash,
      acceptingProofed: false,
    };
    this.sessions.set(id, session);
    if (firstEnrollment) this.reservedEnrollmentVaults.add(pairing.vault_id);
    this.send(socket, { type: 'pairing_challenge', pairing: { session_id: id, vault_id: session.vaultId, pairing_code: session.code, challenge: session.challenge, expires_at: new Date(session.expiresAt).toISOString() } });
  }

  startProof(socket: WebSocket, proof: Extract<RelayMessage, { type: 'pairing_start_proof' }>['proof']): void {
    const session = this.findSession(proof.session_id);
    if (!session || session.initiatorSocket !== socket) return this.error(socket, 'invalid_pairing_session');
    if (!verifyProof(session.initiatorPublicKey, proof.signature, pairingIdentityProofContext({ role: 'initiator', session_id: session.id, vault_id: session.vaultId, challenge: session.challenge, device_id: session.initiatorDeviceId, capabilities: session.initiatorCapabilities }))) return this.error(socket, 'invalid_initiator_proof');
    session.initiatorProofed = true;
  }

  accept(socket: WebSocket, pairing: Extract<RelayMessage, { type: 'pairing_accept' }>['pairing']): void {
    const session = this.findSession(pairing.session_id);
    if (!session || !session.initiatorProofed || session.code !== pairing.pairing_code) return this.error(socket, 'invalid_pairing_session');
    if (session.acceptingSocket || !validPublicKey(pairing.accepting_public_key) || !validCapabilities(pairing.capabilities)) return this.error(socket, 'pairing_already_accepted');
    if (pairing.accepting_device_id === session.initiatorDeviceId) return this.error(socket, 'device_ids_must_differ');
    if (this.devices.has(this.key(session.vaultId, pairing.accepting_device_id))) return this.error(socket, 'device_already_registered');
    if (!verifyProof(pairing.accepting_public_key, pairing.proof, pairingIdentityProofContext({ role: 'accepting', session_id: session.id, vault_id: session.vaultId, challenge: session.challenge, device_id: pairing.accepting_device_id, capabilities: pairing.capabilities }))) return this.error(socket, 'invalid_accepting_proof');
    session.acceptingSocket = socket;
    session.acceptingDeviceId = pairing.accepting_device_id;
    session.acceptingPublicKey = pairing.accepting_public_key;
    session.acceptingCapabilities = pairing.capabilities;
    session.acceptingProofed = true;
    this.send(session.initiatorSocket, { type: 'pairing_accepted', pairing: { session_id: session.id, vault_id: session.vaultId, accepting_device_id: pairing.accepting_device_id, accepting_public_key: pairing.accepting_public_key } });
  }

  confirm(socket: WebSocket, pairing: Extract<RelayMessage, { type: 'pairing_confirm' }>['pairing']): void {
    const session = this.findSession(pairing.session_id);
    if (!session || session.initiatorSocket !== socket || !session.acceptingProofed || !session.acceptingDeviceId || !session.acceptingPublicKey) return this.error(socket, 'invalid_pairing_session');
    if (!pairing.wrapped_vault_key || !verifyProof(session.initiatorPublicKey, pairing.signature, pairingWrappedKeyProofContext({ session_id: session.id, vault_id: session.vaultId, challenge: session.challenge, accepting_device_id: session.acceptingDeviceId, key_version: pairing.key_version, wrapped_vault_key: pairing.wrapped_vault_key }))) return this.error(socket, 'invalid_wrapped_key_proof');
    const existingInitiator = session.initiatorTokenHash ? this.devices.get(this.key(session.vaultId, session.initiatorDeviceId)) : undefined;
    if (session.initiatorTokenHash && (!existingInitiator || existingInitiator.revoked || existingInitiator.expiresAt <= Date.now() || !pairing.authorization_token || !tokenMatches(pairing.authorization_token, existingInitiator.tokenHash))) return this.error(socket, 'initiator_authorization_missing');
    const initiatorToken = session.initiatorTokenHash ? undefined : this.issueToken(session.vaultId, session.initiatorDeviceId, session.initiatorPublicKey, session.initiatorCapabilities, true);
    const acceptingToken = this.issueToken(session.vaultId, session.acceptingDeviceId, session.acceptingPublicKey, session.acceptingCapabilities ?? [], false);
    if (initiatorToken) session.initiatorTokenHash = hashToken(initiatorToken);
    if (!initiatorToken && !session.initiatorTokenHash) return this.error(socket, 'initiator_authorization_missing');
    const initiatorAuthorizationToken = initiatorToken ?? pairing.authorization_token;
    if (!initiatorAuthorizationToken) return this.error(socket, 'initiator_authorization_unavailable');
    if (session.firstEnrollment) {
      this.consumedEnrollmentVaults.add(session.vaultId);
      this.reservedEnrollmentVaults.delete(session.vaultId);
    }
    if (!this.bind(session.initiatorSocket, initiatorAuthorizationToken, session.vaultId, session.initiatorDeviceId)) {
      if (session.firstEnrollment) this.devices.delete(this.key(session.vaultId, session.initiatorDeviceId));
      this.devices.delete(this.key(session.vaultId, session.acceptingDeviceId));
      return this.error(socket, 'initiator_authorization_unavailable');
    }
    if (!this.bind(session.acceptingSocket!, acceptingToken, session.vaultId, session.acceptingDeviceId)) {
      this.devices.delete(this.key(session.vaultId, session.acceptingDeviceId));
      this.socketTokens.delete(session.initiatorSocket);
      return this.error(socket, 'accepting_authorization_unavailable');
    }
    this.send(session.initiatorSocket, { type: 'pairing_complete', pairing: { session_id: session.id, vault_id: session.vaultId, device_id: session.initiatorDeviceId, peer_device_id: session.acceptingDeviceId, authorization_token: initiatorAuthorizationToken, key_version: pairing.key_version } });
    this.send(session.acceptingSocket!, { type: 'pairing_complete', pairing: { session_id: session.id, vault_id: session.vaultId, device_id: session.acceptingDeviceId, peer_device_id: session.initiatorDeviceId, authorization_token: acceptingToken, key_version: pairing.key_version, wrapped_vault_key: pairing.wrapped_vault_key } });
    this.sessions.delete(session.id);
  }

  authorize(socket: WebSocket, vaultId: string, deviceId: string, token: string | undefined, capabilities: PairingCapabilities[number] | readonly PairingCapabilities[number][]): boolean {
    if (!token) return false;
    const required: readonly PairingCapabilities[number][] = Array.isArray(capabilities) ? capabilities : [capabilities];
    const record = this.devices.get(this.key(vaultId, deviceId));
    return !!record && !record.revoked && record.expiresAt > Date.now() && required.every((capability) => record.capabilities.includes(capability)) && tokenMatches(token, record.tokenHash) && this.socketTokens.get(socket) === record.tokenHash;
  }

  bind(socket: WebSocket, token: string, vaultId: string, deviceId: string): boolean {
    const record = this.devices.get(this.key(vaultId, deviceId));
    if (!record || record.revoked || record.expiresAt <= Date.now() || !tokenMatches(token, record.tokenHash)) return false;
    this.socketTokens.set(socket, record.tokenHash);
    return true;
  }

  revoke(socket: WebSocket, vaultId: string, targetDeviceId: string, token: string): boolean {
    const requester = this.findAuthorizedBySocket(socket, vaultId, token);
    if (!requester?.authority || requester.deviceId === targetDeviceId) return false;
    const target = this.devices.get(this.key(vaultId, targetDeviceId));
    if (!target || target.authority) return false;
    target.revoked = true;
    for (const [boundSocket, boundToken] of this.socketTokens) if (boundToken === target.tokenHash) this.socketTokens.delete(boundSocket);
    return true;
  }

  forget(socket: WebSocket): void {
    this.socketTokens.delete(socket);
    for (const [id, session] of this.sessions) {
      if (session.initiatorSocket === socket || session.acceptingSocket === socket) {
        this.sessions.delete(id);
        if (session.firstEnrollment) this.reservedEnrollmentVaults.delete(session.vaultId);
      }
    }
  }

  private issueToken(vaultId: string, deviceId: string, publicKey: string, capabilities: PairingCapabilities, authority: boolean): string {
    const token = randomBytes(32).toString('base64url');
    this.devices.set(this.key(vaultId, deviceId), { vaultId, deviceId, publicKey, capabilities, tokenHash: hashToken(token), authority, expiresAt: Date.now() + this.options.authorizationTtlMs, revoked: false });
    return token;
  }

  private findAuthorizedBySocket(socket: WebSocket, vaultId: string, token: string): DeviceRecord | undefined {
    return [...this.devices.values()].find((record) => record.vaultId === vaultId && record.authority && !record.revoked && tokenMatches(token, record.tokenHash) && this.socketTokens.get(socket) === record.tokenHash);
  }
  private key(vaultId: string, deviceId: string): string { return `${vaultId}:${deviceId}`; }
  private findSession(id: string): PairingSession | undefined { this.prune(); return this.sessions.get(id); }
  private prune(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        if (session.firstEnrollment) this.reservedEnrollmentVaults.delete(session.vaultId);
      }
    }
  }
  private send(socket: WebSocket, message: RelayMessage): void { socket.send(JSON.stringify(message)); }
  private error(socket: WebSocket, code: string): void { this.send(socket, { type: 'relay_error', code }); }
}

export function createRelayServer(options: Partial<RelayOptions> = {}): RelayHandle {
  const resolved: RelayOptions = { ...DEFAULT_RELAY_OPTIONS, ...options };
  if (!resolved.secureMode && (!resolved.insecureTestMode || process.env.NODE_ENV !== 'test')) throw new Error('Insecure relay mode is test-only.');
  if (resolved.pairingTtlMs <= 0 || resolved.authorizationTtlMs <= 0) throw new Error('Relay security TTLs must be positive.');
  if (resolved.secureMode && !['127.0.0.1', 'localhost', '::1'].includes(resolved.host)) {
    throw new Error('Secure relay mode is localhost-only until HTTPS/WSS certificate setup is implemented.');
  }
  const store = new OpaqueEnvelopeStore();
  const pairing = new PairingAuthority(resolved);
  const server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/health/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: resolved.name, version: resolved.version, started_at: new Date().toISOString(), requires_network_peers: true, stores_only_opaque_envelopes: true, secure_pairing_required: resolved.secureMode }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_found' }));
  });
  const wsServer = new WebSocketServer({ server, path: '/ws' });
  wsServer.on('connection', (socket) => {
    socket.on('message', (data) => {
      let message: RelayMessage;
      if (Buffer.byteLength(String(data), 'utf8') > 256 * 1024) {
        socket.send(JSON.stringify({ type: 'relay_error', code: 'message_too_large' }));
        return;
      }
      try { message = JSON.parse(String(data)) as RelayMessage; }
      catch { socket.send(JSON.stringify({ type: 'relay_error', code: 'bad_message' })); return; }
      try { handleMessage(socket, message, store, pairing, resolved); }
      catch { socket.send(JSON.stringify({ type: 'relay_error', code: 'invalid_message' })); }
    });
    socket.on('close', () => pairing.forget(socket));
  });
  return {
    server,
    wsServer,
    get port() { const address = server.address(); return typeof address === 'object' && address ? address.port : resolved.port; },
    store,
    close: () => new Promise<void>((resolve) => { for (const client of wsServer.clients) client.close(); wsServer.close(() => server.close(() => resolve())); }),
  };
}

function handleMessage(socket: WebSocket, message: RelayMessage, store: OpaqueEnvelopeStore, pairing: PairingAuthority, options: RelayOptions): void {
  if (!options.secureMode) return handleInsecureMessage(socket, message, store);
  switch (message.type) {
    case 'pong': socket.send(JSON.stringify({ type: 'pong' })); return;
    case 'pairing_start': pairing.start(socket, message.pairing); return;
    case 'pairing_start_proof': pairing.startProof(socket, message.proof); return;
    case 'pairing_accept': pairing.accept(socket, message.pairing); return;
    case 'pairing_confirm': pairing.confirm(socket, message.pairing); return;
    case 'revoke_device':
      if (!pairing.revoke(socket, message.request.vault_id, message.request.paired_device_id, message.request.authorization_token)) socket.send(JSON.stringify({ type: 'relay_error', code: 'not_authorized' }));
      else socket.send(JSON.stringify({ type: 'relay_ack', envelope_id: message.request.paired_device_id, replay: false }));
      return;
    case 'sync_exchange_request': {
      const capability = (message.request.mutations?.length ?? 0) > 0 ? ['read', 'write'] as const : ['read'] as const;
      if (!pairing.authorize(socket, message.request.vault_id, message.request.device_id, message.request.authorization_token, capability)) { socket.send(JSON.stringify({ type: 'relay_error', code: 'not_authorized' })); return; }
      return exchangeMessage(socket, message, store);
    }
    case 'bootstrap_request':
      if (!pairing.authorize(socket, message.request.vault_id, message.request.device_id, message.request.authorization_token, 'read')) socket.send(JSON.stringify({ type: 'relay_error', code: 'not_authorized' }));
      else socket.send(JSON.stringify({ type: 'relay_ack', envelope_id: null, replay: false }));
      return;
    case 'bootstrap_chunk':
      if (!pairing.authorize(socket, message.chunk.vault_id, message.chunk.device_id, message.chunk.authorization_token, 'write')) socket.send(JSON.stringify({ type: 'relay_error', code: 'not_authorized' }));
      else socket.send(JSON.stringify({ type: 'relay_ack', envelope_id: message.chunk.snapshot_id, replay: false }));
      return;
    case 'bootstrap_status':
      if (!pairing.authorize(socket, message.status.vault_id, message.status.device_id, message.status.authorization_token, 'read')) socket.send(JSON.stringify({ type: 'relay_error', code: 'not_authorized' }));
      else socket.send(JSON.stringify({ type: 'relay_ack', envelope_id: message.status.snapshot_id, replay: false }));
      return;
    default:
      socket.send(JSON.stringify({ type: 'relay_error', code: 'pairing_required' }));
  }
}

function handleInsecureMessage(socket: WebSocket, message: RelayMessage, store: OpaqueEnvelopeStore): void {
  if (message.type === 'pong') { socket.send(JSON.stringify({ type: 'pong' })); return; }
  if (message.type === 'sync_exchange_request') { exchangeMessage(socket, message, store); return; }
  if (message.type === 'pairing_start' || message.type === 'pairing_start_proof' || message.type === 'pairing_accept' || message.type === 'pairing_confirm' || message.type === 'revoke_device') {
    socket.send(JSON.stringify({ type: 'relay_error', code: 'secure_pairing_required' }));
    return;
  }
  socket.send(JSON.stringify({ type: 'relay_ack', envelope_id: null, replay: false }));
}

function exchangeMessage(socket: WebSocket, message: Extract<RelayMessage, { type: 'sync_exchange_request' }>, store: OpaqueEnvelopeStore): void {
  const batchId = message.request.batch_id;
  const envelopeId = `${message.request.vault_id}:${message.request.device_id}:${batchId}`;
  const replay = store.isReplay(envelopeId);
  let response = replay ? store.responseForReplay(envelopeId) : undefined;
  if (!response) {
    const conflictingMutationIds: string[] = [];
    const acceptedMutationIds: string[] = [];
    const uploadedMutations = message.request.mutations ?? [];
    const rejectedMutationIds = uploadedMutations.slice(MAX_MUTATIONS_PER_BATCH).map((mutation) => mutation.mutation_id);
    if (!replay) {
      store.record(envelopeId);
      for (const mutation of uploadedMutations.slice(0, MAX_MUTATIONS_PER_BATCH)) {
        if (mutation.vault_id !== message.request.vault_id) continue;
        const outcome = store.appendMutation(mutation);
        if (outcome === 'conflict') conflictingMutationIds.push(mutation.mutation_id);
        else acceptedMutationIds.push(mutation.mutation_id);
      }
    }
    response = store.exchange(message.request.vault_id, message.request.known_clock, Math.min(Math.max(0, message.request.requested_limit), MAX_MUTATIONS_PER_RESPONSE), replay, conflictingMutationIds, rejectedMutationIds, acceptedMutationIds);
    if (!replay) store.rememberResponse(envelopeId, response);
  }
  socket.send(JSON.stringify({ type: 'sync_exchange_response', response: replay ? { ...response, replay: true } : response }));
}

function canonicalMutation(mutation: MutationEnvelope): string {
  return JSON.stringify({ mutation_id: mutation.mutation_id, vault_id: mutation.vault_id, device_id: mutation.device_id, clock: { lamport: mutation.clock.lamport, vector: Object.fromEntries(Object.entries(mutation.clock.vector).sort(([a], [b]) => a.localeCompare(b))) }, entity_type: mutation.entity_type, entity_id: mutation.entity_id, operation: mutation.operation, base_version: mutation.base_version, changed_fields: [...mutation.changed_fields].sort(), ciphertext: mutation.ciphertext });
}
function cloneResponse(response: SyncExchangeResponse): SyncExchangeResponse { return JSON.parse(JSON.stringify(response)) as SyncExchangeResponse; }
function validCapabilities(capabilities: PairingCapabilities): boolean {
  const allowed = new Set(['read', 'write', 'import', 'export']);
  return capabilities.length > 0 && new Set(capabilities).size === capabilities.length && capabilities.every((capability) => allowed.has(capability));
}
function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function tokenMatches(token: string, expectedHash: string): boolean { const actual = Buffer.from(hashToken(token), 'hex'); const expected = Buffer.from(expectedHash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
function safeSecretEqual(provided: string, expected: string): boolean { if (!provided || !expected) return false; const a = Buffer.from(provided); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
function validPublicKey(value: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
  } catch { return false; }
}
function verifyProof(publicKey: string, signature: string, context: string): boolean {
  try {
    const verifier = createVerify('sha256');
    verifier.update(context);
    verifier.end();
    return verifier.verify({ key: createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
  } catch { return false; }
}
