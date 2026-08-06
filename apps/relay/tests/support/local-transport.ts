/**
 * Test-only local transport (T023). An in-memory loopback for relay protocol
 * tests: deterministic delivery, a full message log for assertions, and a
 * replay guard that models the relay's idempotency behavior (a retried batch
 * id is acknowledged as a replay and never double-recorded).
 */

import type { RelayMessage } from '@expense-tracker/contracts';

export interface Delivery {
  direction: 'client_to_relay' | 'relay_to_client';
  message: RelayMessage;
  replayed: boolean;
}

export class InMemoryRelayTransport {
  private readonly delivered: Delivery[] = [];
  private readonly listeners = new Set<(message: RelayMessage, replayed: boolean) => void>();
  private readonly seenEnvelopeIds = new Set<string>();

  /** Connect a client handler; returns a send function for that client. */
  connect(handler: (message: RelayMessage, replayed: boolean) => void): (message: RelayMessage) => void {
    this.listeners.add(handler);
    return (message: RelayMessage) => this.deliver(message);
  }

  sendFromClient(message: RelayMessage): void {
    this.deliver(message);
  }

  private deliver(message: RelayMessage): void {
    const envelopeId = envelopeIdOf(message);
    const replayed = envelopeId !== null && this.seenEnvelopeIds.has(envelopeId);
    if (envelopeId !== null) this.seenEnvelopeIds.add(envelopeId);
    this.delivered.push({ direction: 'client_to_relay', message, replayed });
    for (const listener of this.listeners) listener(message, replayed);
  }

  /** Simulate the relay's keepalive acknowledgement. */
  acknowledge(): void {
    const pong: RelayMessage = { type: 'pong' };
    this.delivered.push({ direction: 'relay_to_client', message: pong, replayed: false });
    this.listeners.forEach((listener) => listener(pong, false));
  }

  deliveredLog(): Delivery[] {
    return [...this.delivered];
  }

  replayCount(): number {
    return this.delivered.filter((d) => d.replayed).length;
  }
}

function envelopeIdOf(message: RelayMessage): string | null {
  switch (message.type) {
    case 'sync_exchange_request':
      return message.request.batch_id;
    case 'sync_exchange_response':
      return message.response.vault_id;
    case 'bootstrap_request':
      return message.request.vault_id;
    case 'pairing_start':
      return message.pairing.initiating_device_id;
    default:
      return null;
  }
}

/** Replay/idempotency assertion: identical exchanges must be recorded once. */
export function assertExactlyOnce(deliveries: Delivery[], batchId: string): void {
  const attempts = deliveries.filter(
    (d) => d.message.type === 'sync_exchange_request' && d.message.request.batch_id === batchId,
  );
  if (attempts.length < 2) {
    throw new Error(`expected a retried exchange for batch ${batchId}, got ${attempts.length}`);
  }
  if (!attempts[0] || attempts[0].replayed) {
    throw new Error(`first exchange for batch ${batchId} must not be a replay`);
  }
  for (const attempt of attempts.slice(1)) {
    if (!attempt.replayed) {
      throw new Error(`retried exchange for batch ${batchId} must be flagged as a replay`);
    }
  }
}
