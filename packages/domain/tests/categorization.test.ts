import { describe, expect, it } from 'vitest';
import type { Category } from '../src/entities/category';
import type { CategorizationRule } from '../src/entities/rules';
import { suggestCategory } from '../src/categorization/suggest';
import { normalizeMerchant } from '../src/categorization/normalize';
import { matchDefaultRules } from '../src/categorization/default-rules';

const categories: Category[] = [
  { id: 'cat-food', vault_id: 'v1', name: 'Food and Dining', slug: 'food-and-dining', kind: 'expense', color_token: 'copper', icon_name: 'utensils', position: 0, is_active: true, created_at: 'x', updated_at: 'x', version: 1 },
  { id: 'cat-transport', vault_id: 'v1', name: 'Transportation', slug: 'transportation', kind: 'expense', color_token: 'slate', icon_name: 'car', position: 1, is_active: true, created_at: 'x', updated_at: 'x', version: 1 },
  { id: 'cat-other', vault_id: 'v1', name: 'Other', slug: 'other', kind: 'other', color_token: 'stone', icon_name: 'ellipsis', position: 9, is_active: true, created_at: 'x', updated_at: 'x', version: 1 },
];

const noRules: CategorizationRule[] = [];

describe('Category suggestions (US1 prerequisite)', () => {
  it('normalizes merchants consistently', () => {
    expect(normalizeMerchant('STARBUCKS #1234')).toBe('starbucks');
    expect(normalizeMerchant('Starbucks - 5th Ave')).toBe('starbucks 5th ave');
    expect(normalizeMerchant('  AMAZON.COM  ')).toBe('amazon com');
  });

  it('matches deterministic default rules', () => {
    expect(matchDefaultRules('Starbucks')?.categoryName).toBe('Food and Dining');
    expect(matchDefaultRules('Shell Gas Station')?.categoryName).toBe('Transportation');
    expect(matchDefaultRules('Netflix Subscription')?.categoryName).toBe('Entertainment');
    expect(matchDefaultRules('Random Shop 42')).toBeNull();
  });

  it('suggests default-rule categories with provenance', () => {
    const suggestion = suggestCategory('Uber Trip', { categories, personalRules: noRules });
    expect(suggestion).toMatchObject({
      categoryId: 'cat-transport',
      source: 'default_rule',
      confidence: 'high',
    });
  });

  it('personal rules outrank defaults', () => {
    const personalRule: CategorizationRule = {
      id: 'rule-1',
      vault_id: 'v1',
      category_id: 'cat-other',
      rule_type: 'personal_merchant',
      matcher: 'the moon cafe',
      priority: 10,
      confidence: 1,
      evidence_count: 3,
      is_active: true,
      created_from: 'user_correction',
      created_at: 'x',
      updated_at: 'x',
      version: 1,
    };
    const suggestion = suggestCategory('THE MOON CAFE', { categories, personalRules: [personalRule] });
    expect(suggestion).toMatchObject({
      categoryId: 'cat-other',
      source: 'personal_rule',
      confidence: 'confirmed',
      matchedRuleId: 'rule-1',
    });
  });

  it('falls back to a review-required state instead of silently guessing', () => {
    const suggestion = suggestCategory('Mystery Purchase', { categories, personalRules: noRules });
    expect(suggestion.source).toBe('manual_required');
    expect(suggestion.confidence).toBe('unresolved');
  });
});
