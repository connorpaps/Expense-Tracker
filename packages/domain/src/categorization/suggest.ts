import type { CategorySource, CategoryConfidence } from '@expense-tracker/contracts';
import type { Category } from '../entities/category';
import type { CategorizationRule } from '../entities/rules';
import { FALLBACK_CATEGORY_NAME, matchDefaultRules } from './default-rules';
import { normalizeMerchant } from './normalize';

export interface Suggestion {
  categoryId: string | null;
  source: CategorySource;
  confidence: CategoryConfidence;
  matchedRuleId: string | null;
}

export interface SuggestionContext {
  categories: Category[];
  personalRules: CategorizationRule[];
}

/**
 * Suggest a category for a merchant. Personal rules outrank generic defaults;
 * explicit user selection is applied later by the import commit path.
 */
export function suggestCategory(merchant: string, context: SuggestionContext): Suggestion {
  const normalized = normalizeMerchant(merchant);

  for (const rule of context.personalRules) {
    if (!rule.is_active) continue;
    const matcher = rule.matcher.toLowerCase();
    if (normalized.includes(matcher) || matcher.includes(normalized)) {
      return {
        categoryId: rule.category_id,
        source: 'personal_rule',
        confidence: rule.confidence >= 0.9 ? 'confirmed' : 'high',
        matchedRuleId: rule.id,
      };
    }
  }

  const byName = new Map(context.categories.map((c) => [c.name, c]));
  const fallback = byName.get(FALLBACK_CATEGORY_NAME);
  const match = matchDefaultRules(merchant);
  if (match) {
    const category = byName.get(match.categoryName);
    if (category) {
      return {
        categoryId: category.id,
        source: 'default_rule',
        confidence: match.confidence >= 0.9 ? 'high' : 'medium',
        matchedRuleId: null,
      };
    }
  }

  return {
    categoryId: fallback?.id ?? null,
    source: 'manual_required',
    confidence: 'unresolved',
    matchedRuleId: null,
  };
}
