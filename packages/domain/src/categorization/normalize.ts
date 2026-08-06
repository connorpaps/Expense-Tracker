/**
 * Normalize a merchant descriptor for matching only. The original statement
 * text is always retained on the transaction/import row.
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\b(?:sq|tst|pos|dd|py|bt|wix)\s*\*\s*/g, ' ')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/g, ' ')
    .replace(/\b(?:ca|ny|wa|fl|tx|il|co|az|nv|or|ma|ga|nj|pa|va|md|oh|mi)\b/g, ' ')
    .replace(/[.,;:()&_#%!?*/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact fingerprint token for duplicate matching. */
export function merchantFingerprintToken(raw: string): string {
  return normalizeMerchant(raw);
}

/** Return normalized whitespace-delimited tokens for rule matching. */
export function merchantTokens(raw: string): string[] {
  return normalizeMerchant(raw).split(' ').filter(Boolean);
}
