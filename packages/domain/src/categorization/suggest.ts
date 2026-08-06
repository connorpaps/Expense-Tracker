import type { CategorySource, CategoryConfidence, CategoryExplanation } from '@expense-tracker/contracts';
import type { Category } from '../entities/category';
import type { CategorizationRule } from '../entities/rules';
import { matchDefaultRules } from './default-rules';
import { normalizeMerchant } from './normalize';

export interface Suggestion {
  categoryId: string | null;
  source: CategorySource;
  confidence: CategoryConfidence;
  matchedRuleId: string | null;
  matchedPattern: string | null;
  explanation: CategoryExplanation;
}

export interface SuggestionContext {
  categories: Category[];
  personalRules: CategorizationRule[];
  amountMinor?: number | null;
}

function confidenceForRule(rule: CategorizationRule): CategoryConfidence {
  if (rule.evidence_count >= 3 || rule.confidence >= 0.95) return 'confirmed';
  if (rule.confidence >= 0.9) return 'high';
  if (rule.confidence >= 0.75) return 'medium';
  return 'low';
}

/**
 * Suggest a category for a merchant. Explicitly enabled personal rules outrank
 * generic defaults. Ties are deterministic and conflicting same-specificity
 * rules remain reviewable instead of silently oscillating.
 */
export function suggestCategory(merchant: string, context: SuggestionContext): Suggestion {
  const normalized = normalizeMerchant(merchant);
  const activeCategories = new Map(context.categories.filter((category) => category.is_active).map((category) => [category.id, category]));
  const matchingRules = context.personalRules
    .filter((rule) => rule.is_active && activeCategories.has(rule.category_id))
    .map((rule) => ({
      rule,
      matcher: normalizeMerchant(rule.matcher),
      specificity: normalizeMerchant(rule.matcher).length,
    }))
    .filter(({ matcher }) => ` ${normalized} `.includes(` ${matcher} `))
    .sort((a, b) => b.specificity - a.specificity || b.rule.priority - a.rule.priority || b.rule.evidence_count - a.rule.evidence_count || a.rule.id.localeCompare(b.rule.id));

  const winner = matchingRules[0];
  const tied = winner ? matchingRules.filter((candidate) => candidate.specificity === winner.specificity && candidate.rule.priority === winner.rule.priority && candidate.rule.category_id !== winner.rule.category_id) : [];
  if (winner && tied.length > 0) {
    return unresolvedSuggestion(null, {
      source: 'manual_required',
      confidence: 'unresolved',
      matchedRuleId: null,
      matchedPattern: winner.matcher,
      detail: 'Multiple personal rules match this merchant with equal precedence. Choose a category to resolve the context.',
    });
  }

  if (winner) {
    const confidence = confidenceForRule(winner.rule);
    return {
      categoryId: winner.rule.category_id,
      source: 'personal_rule',
      confidence,
      matchedRuleId: winner.rule.id,
      matchedPattern: winner.matcher,
      explanation: {
        source: 'personal_rule',
        confidence,
        matchedRuleId: winner.rule.id,
        matchedPattern: winner.matcher,
        detail: `Matched your personal rule “${winner.matcher}” (${winner.rule.evidence_count} confirmation${winner.rule.evidence_count === 1 ? '' : 's'}).`,
      },
    };
  }

  const match = matchDefaultRules(merchant, { amountMinor: context.amountMinor });
  if (match) {
    const category = [...activeCategories.values()].find((candidate) => candidate.name === match.categoryName);
    if (category) {
      const confidence: CategoryConfidence = match.confidence >= 0.9 ? 'high' : match.confidence >= 0.75 ? 'medium' : 'low';
      return {
        categoryId: category.id,
        source: 'default_rule',
        confidence,
        matchedRuleId: match.ruleId,
        matchedPattern: match.matchedKeyword,
        explanation: {
          source: 'default_rule',
          confidence,
          matchedRuleId: match.ruleId,
          matchedPattern: match.matchedKeyword,
          detail: `Matched the default pattern “${match.matchedKeyword}”.`,
        },
      };
    }
  }

  return unresolvedSuggestion(null, {
    source: 'manual_required',
    confidence: 'unresolved',
    matchedRuleId: null,
    matchedPattern: null,
    detail: 'No active rule recognized this merchant. Choose a category during review.',
  });
}

function unresolvedSuggestion(categoryId: string | null, explanation: Omit<CategoryExplanation, 'source' | 'confidence'> & { source: 'manual_required'; confidence: 'unresolved' }): Suggestion {
  return {
    categoryId,
    source: explanation.source,
    confidence: explanation.confidence,
    matchedRuleId: explanation.matchedRuleId,
    matchedPattern: explanation.matchedPattern,
    explanation,
  };
}
