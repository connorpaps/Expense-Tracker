import { normalizeMerchant } from './normalize';

export type RuleDirection = 'expense' | 'income' | 'both';

export interface KeywordRule {
  id: string;
  keywords: string[];
  categoryName: string;
  confidence: number;
  direction: RuleDirection;
  priority: number;
}

export interface MatchContext {
  amountMinor?: number | null;
}

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  {
    id: 'transfer-descriptor',
    keywords: [
      'online transfer',
      'account transfer',
      'internal transfer',
      'zelle',
      'venmo',
      'paypal transfer',
    ],
    categoryName: 'Transfers',
    confidence: 0.95,
    direction: 'both',
    priority: 100,
  },
  {
    id: 'card-payment',
    keywords: [
      'amex epay',
      'amex payment',
      'credit card payment',
      'chase payment',
      'capital one payment',
      'payment thank you',
    ],
    categoryName: 'Transfers',
    confidence: 0.95,
    direction: 'both',
    priority: 100,
  },
  {
    id: 'direct-deposit',
    keywords: ['direct dep', 'direct deposit', 'payroll', 'salary', 'wage'],
    categoryName: 'Income',
    confidence: 0.95,
    direction: 'income',
    priority: 100,
  },
  {
    id: 'amazon',
    keywords: ['amazon', 'amzn', 'amzn mktp', 'amazon marketplace'],
    categoryName: 'Shopping',
    confidence: 0.95,
    direction: 'expense',
    priority: 90,
  },
  {
    id: 'target',
    keywords: ['target'],
    categoryName: 'Shopping',
    confidence: 0.95,
    direction: 'expense',
    priority: 90,
  },
  {
    id: 'walmart',
    keywords: ['walmart', 'wal mart'],
    categoryName: 'Shopping',
    confidence: 0.95,
    direction: 'expense',
    priority: 90,
  },
  {
    id: 'home-depot',
    keywords: ['home depot'],
    categoryName: 'Shopping',
    confidence: 0.95,
    direction: 'expense',
    priority: 90,
  },
  {
    id: 'apple-billing',
    keywords: ['apple com bill', 'apple bill'],
    categoryName: 'Shopping',
    confidence: 0.85,
    direction: 'expense',
    priority: 85,
  },
  {
    id: 'subscription-merchant',
    keywords: [
      'netflix',
      'spotify',
      'hulu',
      'disney plus',
      'disney',
      'linkedin premium',
      'microsoft 365',
      'adobe',
    ],
    categoryName: 'Subscriptions',
    confidence: 0.95,
    direction: 'expense',
    priority: 90,
  },
  {
    id: 'food-delivery',
    keywords: ['doordash', 'uber eats', 'grubhub', 'postmates', 'seamless'],
    categoryName: 'Food and Dining',
    confidence: 0.95,
    direction: 'expense',
    priority: 85,
  },
  {
    id: 'food',
    keywords: [
      'restaurant',
      'cafe',
      'coffee',
      'starbucks',
      'mcdonald',
      'burger',
      'pizza',
      'sushi',
      'chipotle',
      'grocer',
      'whole foods',
      "trader joe's",
      'kroger',
      'safeway',
      'market',
    ],
    categoryName: 'Food and Dining',
    confidence: 0.9,
    direction: 'expense',
    priority: 50,
  },
  {
    id: 'transportation',
    keywords: [
      'uber',
      'lyft',
      'taxi',
      'metro',
      'transit',
      'gas',
      'shell',
      'chevron',
      'exxon',
      'bp',
      'parking',
      'toll',
    ],
    categoryName: 'Transportation',
    confidence: 0.9,
    direction: 'expense',
    priority: 50,
  },
  {
    id: 'bills',
    keywords: [
      'electric',
      'utility',
      'water',
      'internet',
      'comcast',
      'spectrum',
      'verizon',
      'att',
      't mobile',
      'rent',
      'mortgage',
      'insurance',
      'state farm',
      'apartment',
    ],
    categoryName: 'Bills and Utilities',
    confidence: 0.9,
    direction: 'expense',
    priority: 55,
  },
  {
    id: 'entertainment',
    keywords: ['cinema', 'movie', 'steam', 'playstation', 'xbox', 'concert', 'ticket', 'theater'],
    categoryName: 'Entertainment',
    confidence: 0.9,
    direction: 'expense',
    priority: 50,
  },
  {
    id: 'health',
    keywords: [
      'pharmacy',
      'cvs',
      'walgreens',
      'doctor',
      'dentist',
      'hospital',
      'clinic',
      'therapy',
      'prescription',
      'gym',
      'fitness',
    ],
    categoryName: 'Health',
    confidence: 0.9,
    direction: 'expense',
    priority: 50,
  },
  {
    id: 'travel',
    keywords: ['airline', 'airbnb', 'hotel', 'marriott', 'hilton', 'booking', 'expedia', 'flight'],
    categoryName: 'Travel',
    confidence: 0.9,
    direction: 'expense',
    priority: 50,
  },
  {
    id: 'income',
    keywords: ['deposit', 'interest', 'refund', 'dividend'],
    categoryName: 'Income',
    confidence: 0.85,
    direction: 'income',
    priority: 60,
  },
];

export const FALLBACK_CATEGORY_NAME = 'Other';

export interface MatchResult {
  ruleId: string;
  categoryName: string;
  confidence: number;
  matchedKeyword: string;
  specificity: number;
  priority: number;
}

function directionAllowed(rule: KeywordRule, amountMinor: number | null | undefined): boolean {
  if (
    amountMinor === null ||
    amountMinor === undefined ||
    amountMinor === 0 ||
    rule.direction === 'both'
  )
    return true;
  return amountMinor > 0 ? rule.direction === 'income' : rule.direction === 'expense';
}

export function matchDefaultRules(
  merchant: string,
  context: MatchContext = {},
): MatchResult | null {
  const normalized = normalizeMerchant(merchant);
  const padded = ` ${normalized} `;
  let best: MatchResult | null = null;
  for (const rule of DEFAULT_KEYWORD_RULES) {
    if (!directionAllowed(rule, context.amountMinor)) continue;
    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeMerchant(keyword);
      if (!normalizedKeyword || !padded.includes(` ${normalizedKeyword} `)) continue;
      const candidate: MatchResult = {
        ruleId: rule.id,
        categoryName: rule.categoryName,
        confidence: rule.confidence,
        matchedKeyword: normalizedKeyword,
        specificity: normalizedKeyword.length,
        priority: rule.priority,
      };
      if (
        !best ||
        candidate.priority > best.priority ||
        (candidate.priority === best.priority && candidate.specificity > best.specificity) ||
        (candidate.priority === best.priority &&
          candidate.specificity === best.specificity &&
          candidate.confidence > best.confidence)
      )
        best = candidate;
    }
  }
  return best;
}
