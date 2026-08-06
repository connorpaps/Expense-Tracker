/**
 * Deterministic default keyword/pattern rules. Generic defaults are ranked by
 * specificity first, then confidence, then declaration order. Personal rules
 * are evaluated separately and always outrank these defaults.
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
  matchedKeyword: string;
  specificity: number;
}

export function matchDefaultRules(merchant: string): MatchResult | null {
  const normalized = normalizeMerchant(merchant);
  let best: (MatchResult & { order: number }) | null = null;
  let order = 0;
  for (const rule of DEFAULT_KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeMerchant(keyword);
      const padded = ` ${normalized} `;
      const matches = padded.includes(` ${normalizedKeyword} `);
      if (matches) {
        const candidate = {
          categoryName: rule.categoryName,
          confidence: rule.confidence,
          matchedKeyword: normalizedKeyword,
          specificity: normalizedKeyword.length,
          order,
        };
        if (!best || candidate.specificity > best.specificity ||
          (candidate.specificity === best.specificity && candidate.confidence > best.confidence) ||
          (candidate.specificity === best.specificity && candidate.confidence === best.confidence && candidate.order < best.order)) {
          best = candidate;
        }
      }
      order += 1;
    }
  }
  if (!best) return null;
  const { order: _order, ...result } = best;
  return result;
}
