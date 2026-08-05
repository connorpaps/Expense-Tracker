/**
 * Duplicate detection (T031): fingerprint normalized merchant + date + amount
 * so legitimate recurring transactions (same merchant, different date) are NOT
 * flagged while exact repeat rows and overlapping statement re-imports are.
 */

import type { Transaction } from '../entities/transaction';
import { normalizeMerchant } from '../categorization/normalize';

export interface DuplicateFingerprint {
  merchantToken: string;
  occurredOn: string;
  amountMinor: number;
}

export function fingerprintFor(
  merchant: string,
  occurredOn: string,
  amountMinor: number,
): DuplicateFingerprint {
  return {
    merchantToken: normalizeMerchant(merchant),
    occurredOn,
    amountMinor,
  };
}

export function fingerprintKey(fingerprint: DuplicateFingerprint): string {
  return `${fingerprint.merchantToken}|${fingerprint.occurredOn}|${fingerprint.amountMinor}`;
}

export interface DuplicateCandidate {
  existingTransactionId: string;
  reason: string;
}

/**
 * Find transactions in an import batch that look like duplicates of existing
 * saved transactions, plus intra-import duplicates (same fingerprint twice).
 */
export function findDuplicateCandidates(
  batch: Array<{ merchant: string; occurredOn: string; amountMinor: number; rowKey: string }>,
  existing: readonly Transaction[],
  existingByRowKey: ReadonlyMap<string, Transaction>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const seenKeys = new Map<string, string>();

  for (const row of batch) {
    const fingerprint = fingerprintFor(row.merchant, row.occurredOn, row.amountMinor);
    const key = fingerprintKey(fingerprint);

    // Intra-import duplicate.
    const earlier = seenKeys.get(key);
    if (earlier) {
      push(result, row.rowKey, `Duplicate of row ${earlier} in this import`);
    } else {
      seenKeys.set(key, row.rowKey);
    }

    // Against saved transactions.
    const prior = existingByRowKey.get(row.rowKey);
    const matches = existing.filter(
      (tx) =>
        tx.deleted_at === null &&
        tx.merchant_original !== null &&
        fingerprintKey(fingerprintFor(tx.merchant_display, tx.occurred_on, tx.amount_minor)) === key,
    );
    if (prior) {
      continue;
    }
    for (const tx of matches.slice(0, 3)) {
      push(result, row.rowKey, `Matches saved transaction ${tx.id}`);
    }
  }
  return result;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}
