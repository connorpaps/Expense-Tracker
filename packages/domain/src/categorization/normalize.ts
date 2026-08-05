/**
 * Merchant normalization used by categorization and duplicate fingerprints:
 * lower-case, collapse whitespace, strip store numbers/location suffixes and
 * punctuation so "STARBUCKS #1234" and "Starbucks - 5th Ave" both normalize
 * toward "starbucks".
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/#\s*\d+/g, ' ') // "#1234", "# 1234"
    .replace(/\b\d{2,}\b/g, ' ') // standalone store/order numbers
    .replace(/[.,;:()&_#%!?*/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact fingerprint token for duplicate matching. */
export function merchantFingerprintToken(raw: string): string {
  return normalizeMerchant(raw);
}
