/**
 * Deterministic clock utilities (T023). Sync tests must control Lamport and
 * vector clocks exactly so ordering, concurrency, and replay scenarios are
 * reproducible rather than time-dependent.
 */

import type { Lamport, VectorClock } from '@expense-tracker/contracts';
import { clockHappenedBefore, clocksAreConcurrent } from '@expense-tracker/contracts';

export class DeterministicLamportClock {
  private counter: Lamport;

  constructor(start: Lamport = 0) {
    this.counter = start;
  }

  get value(): Lamport {
    return this.counter;
  }

  /** Advance the local counter for a new local event. */
  tick(): Lamport {
    this.counter += 1;
    return this.counter;
  }

  /** Adopt a remote counter (causal receipt) and advance past it. */
  observe(remote: Lamport): Lamport {
    this.counter = Math.max(this.counter, remote) + 1;
    return this.counter;
  }
}

/** Return a new vector clock with `deviceId` advanced by one. */
export function tickVectorClock(clock: VectorClock, deviceId: string): VectorClock {
  return { ...clock, [deviceId]: (clock[deviceId] ?? 0) + 1 };
}

/** Merge vector clocks element-wise (max per device). */
export function mergeVectorClocks(...clocks: VectorClock[]): VectorClock {
  const merged: VectorClock = {};
  for (const clock of clocks) {
    for (const [deviceId, counter] of Object.entries(clock)) {
      merged[deviceId] = Math.max(merged[deviceId] ?? 0, counter);
    }
  }
  return merged;
}

export interface ClockAssertions {
  assertHappenedBefore(a: VectorClock, b: VectorClock): void;
  assertConcurrent(a: VectorClock, b: VectorClock): void;
}

/** Assert helpers for the shared clock ordering contract. */
export function clockAsserter(): ClockAssertions {
  return {
    assertHappenedBefore(a, b) {
      const occurred = clockHappenedBefore({ lamport: 0, vector: a }, { lamport: 0, vector: b });
      if (!occurred) {
        throw new Error(`expected ${JSON.stringify(a)} to precede ${JSON.stringify(b)}`);
      }
    },
    assertConcurrent(a, b) {
      if (!clocksAreConcurrent({ lamport: 0, vector: a }, { lamport: 0, vector: b })) {
        throw new Error(`expected ${JSON.stringify(a)} and ${JSON.stringify(b)} to be concurrent`);
      }
    },
  };
}
