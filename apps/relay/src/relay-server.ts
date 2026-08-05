/**
 * Local relay server (T003). A $0 companion process that runs on the user's PC
 * so an iPhone on the same network can pair and later synchronize in the
 * foreground. It only routes opaque encrypted envelopes; it never reads vault
 * contents. Full pairing/sync protocol endpoints arrive in US6 (T074/T077).
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { RelayMessage } from '@expense-tracker/contracts';

export interface RelayOptions {
  host: string;
  port: number;
  name: string;
  version: string;
}

export interface RelayHandle {
  server: Server;
  wsServer: WebSocketServer;
  /** Actual bound port after listen (falls back to configured port before listen). */
  readonly port: number;
  store: OpaqueEnvelopeStore;
  close(): Promise<void>;
}

export const DEFAULT_RELAY_OPTIONS: RelayOptions = {
  host: '127.0.0.1',
  port: 8712,
  name: 'Expense Tracker relay',
  version: '0.1.0',
};

/**
 * Opaque envelope store: records envelope/batch ids so retries of the same
 * exchange are recognized as replays instead of double-applied (idempotency).
 */
export class OpaqueEnvelopeStore {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly maxEntries = 10_000,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
  ) {}

  isReplay(id: string, now = Date.now()): boolean {
    this.prune(now);
    return this.seen.has(id);
  }

  record(id: string, receivedAt = new Date().toISOString()): void {
    const timestamp = Date.parse(receivedAt);
    this.prune(Number.isNaN(timestamp) ? Date.now() : timestamp);
    this.seen.set(id, Number.isNaN(timestamp) ? Date.now() : timestamp);
    while (this.seen.size > this.maxEntries) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
  }

  receivedAt(id: string): string | undefined {
    const timestamp = this.seen.get(id);
    return timestamp === undefined ? undefined : new Date(timestamp).toISOString();
  }

  size(): number {
    this.prune(Date.now());
    return this.seen.size;
  }

  private prune(now: number): void {
    for (const [id, timestamp] of this.seen) {
      if (now - timestamp > this.ttlMs) this.seen.delete(id);
    }
  }
}

export function createRelayServer(options: Partial<RelayOptions> = {}): RelayHandle {
  const resolved: RelayOptions = { ...DEFAULT_RELAY_OPTIONS, ...options };
  const store = new OpaqueEnvelopeStore();

  const server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/health/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          name: resolved.name,
          version: resolved.version,
          started_at: new Date().toISOString(),
          requires_network_peers: true,
          stores_only_opaque_envelopes: true,
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_found' }));
  });

  const wsServer = new WebSocketServer({ server, path: '/ws' });

  wsServer.on('connection', (socket) => {
    socket.on('message', (data) => {
      let message: RelayMessage;
      try {
        message = JSON.parse(String(data)) as RelayMessage;
      } catch {
        socket.send(JSON.stringify({ type: 'relay_error', code: 'bad_message' }));
        return;
      }
      handleMessage(socket, message, store);
    });
  });

  const relayHandle: RelayHandle = {
    server,
    wsServer,
    get port() {
      const address = server.address();
      return typeof address === 'object' && address ? address.port : resolved.port;
    },
    store,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wsServer.clients) client.close();
        wsServer.close(() => {
          server.close(() => resolve());
        });
      }),
  };

  return relayHandle;
}

function handleMessage(socket: WebSocket, message: RelayMessage, store: OpaqueEnvelopeStore): void {
  switch (message.type) {
    case 'pong':
      socket.send(JSON.stringify({ type: 'pong' }));
      return;
    case 'sync_exchange_request': {
      const batchId = message.request.batch_id;
      const envelopeId = `${message.request.vault_id}:${message.request.device_id}:${batchId}`;
      const replay = store.isReplay(envelopeId);
      store.record(envelopeId);
      socket.send(JSON.stringify({ type: 'relay_ack', envelope_id: batchId, replay }));
      return;
    }
    case 'bootstrap_chunk':
    case 'bootstrap_status':
    case 'pairing_start':
    case 'pairing_accept':
    case 'pairing_confirmed':
    case 'revoke_device':
    case 'sync_exchange_response':
    case 'bootstrap_request':
      // Opaque relay: acknowledge receipt without inspecting contents.
      socket.send(JSON.stringify({ type: 'relay_ack', envelope_id: null, replay: false }));
      return;
  }
}
