/**
 * Causal clock metadata. Device wall clocks are never used for conflict
 * ordering; only Lamport/vector clocks determine causality.
 */

import type { KnownClock, Lamport, MutationClock, VectorClock } from '@expense-tracker/contracts';

export function initialVector(deviceId: string, value = 0): VectorClock {
  return { [deviceId]: value };
}

export function emptyClock(deviceId: string, lamport: Lamport = 0): MutationClock {
  return { lamport, vector: initialVector(deviceId, lamport) };
}

/**
 * Advance this device's clock when observing a remote mutation, then tick for
 * the local mutation.
 */
export function observeAndTick(local: MutationClock, remote: MutationClock, deviceId: string): MutationClock {
  const merged: KnownClock = { ...local.vector, ...remote.vector };
  for (const [device, counter] of Object.entries(remote.vector)) {
    merged[device] = Math.max(merged[device] ?? 0, counter);
  }
  const lamport = Math.max(local.lamport, remote.lamport) + 1;
  merged[deviceId] = lamport;
  return { lamport, vector: merged };
}

export function serializeVector(vector: VectorClock): string {
  const sorted: Record<string, number> = {};
  for (const device of Object.keys(vector).sort()) {
    sorted[device] = vector[device] ?? 0;
  }
  return JSON.stringify(sorted);
}

export function parseVector(serialized: string): VectorClock {
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid vector clock');
  }
  const result: VectorClock = {};
  for (const [device, counter] of Object.entries(parsed)) {
    if (typeof counter !== 'number') throw new Error('Invalid vector clock counter');
    result[device] = counter;
  }
  return result;
}

/** Merge a checkpoint into the local clock (take the max per device). */
export function mergeCheckpoint(local: MutationClock, checkpoint: KnownClock): MutationClock {
  const vector = { ...local.vector };
  let lamport = local.lamport;
  for (const [device, counter] of Object.entries(checkpoint)) {
    vector[device] = Math.max(vector[device] ?? 0, counter);
    lamport = Math.max(lamport, counter);
  }
  return { lamport, vector };
}
