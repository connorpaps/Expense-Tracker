import type { RelayMessage, SyncExchangeRequest, SyncExchangeResponse } from '@expense-tracker/contracts';

export interface RelaySocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface RelayClientOptions {
  url: string;
  timeoutMs?: number;
  socketFactory?: (url: string) => RelaySocketLike;
}

export class RelayClient {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly socketFactory: (url: string) => RelaySocketLike;
  private socket: RelaySocketLike | null = null;
  private connecting: Promise<void> | null = null;

  constructor(options: RelayClientOptions) {
    if (!options.url.startsWith('ws://') && !options.url.startsWith('wss://')) {
      throw new Error('Relay URL must use ws:// or wss://.');
    }
    this.url = options.url;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as RelaySocketLike);
  }

  get connected(): boolean {
    return this.socket?.readyState === 1;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = this.socketFactory(this.url);
      let settled = false;
      const timeout = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error('Relay connection timed out.'));
      }, this.timeoutMs);
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        this.socket = socket;
        resolve();
      };
      socket.onerror = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        reject(new Error('Relay connection failed.'));
      };
      socket.onclose = () => {
        if (!settled) {
          settled = true;
          globalThis.clearTimeout(timeout);
          reject(new Error('Relay connection closed before it was ready.'));
        }
        if (this.socket === socket) this.socket = null;
      };
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async exchange(request: SyncExchangeRequest): Promise<SyncExchangeResponse> {
    await this.connect();
    const socket = this.socket;
    if (!socket) throw new Error('Relay is not connected.');
    return new Promise<SyncExchangeResponse>((resolve, reject) => {
      let settled = false;
      const timeout = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.onmessage = null;
        if (this.socket === socket) this.socket = null;
        socket.close();
        reject(new Error('Relay exchange timed out.'));
      }, this.timeoutMs);
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        socket.onmessage = null;
        callback();
      };
      socket.onmessage = (event) => {
        let message: RelayMessage;
        try {
          message = JSON.parse(event.data) as RelayMessage;
        } catch {
          finish(() => {
            if (this.socket === socket) this.socket = null;
            socket.close();
            reject(new Error('Relay returned an invalid message.'));
          });
          return;
        }
        if (message.type === 'relay_error') {
          finish(() => {
            if (this.socket === socket) this.socket = null;
            socket.close();
            reject(new Error(`Relay rejected the exchange (${message.code}).`));
          });
          return;
        }
        if (message.type !== 'sync_exchange_response') return;
        finish(() => resolve(message.response));
      };
      socket.onerror = () => finish(() => {
        if (this.socket === socket) this.socket = null;
        socket.close();
        reject(new Error('Relay exchange failed.'));
      });
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        finish(() => reject(new Error('Relay connection closed during exchange.')));
      };
      try {
        socket.send(JSON.stringify({ type: 'sync_exchange_request', request } satisfies RelayMessage));
      } catch (cause) {
        finish(() => {
          if (this.socket === socket) this.socket = null;
          socket.close();
          reject(cause instanceof Error ? cause : new Error('Relay exchange could not be sent.'));
        });
      }
    });
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
