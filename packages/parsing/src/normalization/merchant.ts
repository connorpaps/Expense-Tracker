/**
 * Merchant display normalization: trim, collapse whitespace, strip explicit
 * store-number suffixes (#1234), and normalize casing. All-caps words are
 * title-cased ("STARBUCKS" -> "Starbucks", "UBER *TRIP" -> "Uber *Trip");
 * mixed-casing words are preserved ("Cafe, Downtown" stays as written). The
 * original source text is always preserved separately in `merchant_original`.
 */
export function displayMerchant(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!value) return null;
  const cleaned = value
    .replace(/#\s*\d+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned
    .split(' ')
    .map(titleWord)
    .join(' ')
    .trim();
}

function titleWord(word: string): string {
  const letters = word.replace(/[^A-Za-z]/g, '');
  // Title-case only when the letters are all uppercase; leave mixed casing.
  // Capitalize each alpha run ("APPLE.COM/BILL" -> "Apple.Com/Bill",
  // "JOE'S" -> "Joe's", "*TRIP" -> "*Trip").
  if (letters.length === 0 || letters !== letters.toUpperCase()) return word;
  return word.replace(/[A-Za-z]+/g, (run) =>
    run.length >= 2 ? run.charAt(0).toUpperCase() + run.slice(1).toLowerCase() : run.toLowerCase(),
  );
}
