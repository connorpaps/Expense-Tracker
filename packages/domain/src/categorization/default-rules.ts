/**
 * Deterministic default keyword/pattern rules (T056 prerequisite). These are
 * the generic defaults applied to import suggestions; personal rules outrank
 * them. A suggestion is always distinguishable from a user-confirmed category.
 */

import { normalizeMerchant } from './normalize';

export interface KeywordRule {
  keywords: string[];
  categoryName: string;
  confidence: number;
}

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  { keywords: ['uber', 'lyft', 'taxi', 'metro', 'transit', 'gas', 'shell', 'chevron', 'bp ', 'parking'], categoryName: 'Transportation', confidence: 0.9 },
  { keywords: ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'burger', 'pizza', 'sushi', 'chipotle', 'grocer', 'whole foods', 'trader joe', 'kroger', 'safeway', 'walmart', 'target'], categoryName: 'Food and Dining', confidence: 0.9 },
  { keywords: ['amazon', 'ebay', 'etsy', 'zara', 'nike', 'apple store', 'best buy', 'department'], categoryName: 'Shopping', confidence: 0.8 },
  { keywords: ['electric', 'utility', 'water', 'internet', 'comcast', 'verizon', 'att ', 't-mobile', 'rent', 'mortgage', 'insurance'], categoryName: 'Bills and Utilities', confidence: 0.85 },
  { keywords: ['netflix', 'spotify', 'hulu', 'cinema', 'movie', 'steam', 'playstation', 'xbox', 'concert', 'ticket'], categoryName: 'Entertainment', confidence: 0.9 },
  { keywords: ['pharmacy', 'cvs', 'walgreens', 'doctor', 'dentist', 'hospital', 'clinic', 'therapy', 'prescription'], categoryName: 'Health', confidence: 0.9 },
  { keywords: ['airline', 'airbnb', 'hotel', 'marriott', 'hilton', 'booking', 'expedia', 'flight', 'trip'], categoryName: 'Travel', confidence: 0.9 },
  { keywords: ['salary', 'payroll', 'deposit', 'interest', 'refund', 'dividend'], categoryName: 'Income', confidence: 0.9 },
  { keywords: ['transfer', 'zelle', 'venmo', 'paypal', 'internal'], categoryName: 'Transfers', confidence: 0.85 },
];

export const FALLBACK_CATEGORY_NAME = 'Other';

export interface MatchResult {
  categoryName: string;
  confidence: number;
  matchedKeyword: string | null;
}

export function matchDefaultRules(merchant: string): MatchResult | null {
  const normalized = normalizeMerchant(merchant);
  let best: MatchResult | null = null;
  for (const rule of DEFAULT_KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        const candidate: MatchResult = {
          categoryName: rule.categoryName,
          confidence: rule.confidence,
          matchedKeyword: keyword,
        };
        if (!best || candidate.confidence > best.confidence) {
          best = candidate;
        }
      }
    }
  }
  return best;
}
