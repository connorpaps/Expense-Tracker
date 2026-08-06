import { describe, expect, it } from 'vitest';
import type { Category } from '../src/entities/category';
import type { CategorizationRule } from '../src/entities/rules';
import { suggestCategory } from '../src/categorization/suggest';
import { normalizeMerchant } from '../src/categorization/normalize';
import { matchDefaultRules } from '../src/categorization/default-rules';
import { applySchema } from '../src/storage/schema';
import { insertCategory, insertVault } from '../src/storage/repository';
import {
  recordCategoryCorrection,
  rememberMerchantRule,
  listCorrectionHistory,
} from '../src/categorization/personal-rules';
import { withNodeDb } from './support/node-db';

const categories: Category[] = [
  {
    id: 'cat-food',
    vault_id: 'v1',
    name: 'Food and Dining',
    slug: 'food-and-dining',
    kind: 'expense',
    color_token: 'copper',
    icon_name: 'utensils',
    position: 0,
    is_active: true,
    created_at: 'x',
    updated_at: 'x',
    version: 1,
  },
  {
    id: 'cat-transport',
    vault_id: 'v1',
    name: 'Transportation',
    slug: 'transportation',
    kind: 'expense',
    color_token: 'slate',
    icon_name: 'car',
    position: 1,
    is_active: true,
    created_at: 'x',
    updated_at: 'x',
    version: 1,
  },
  {
    id: 'cat-other',
    vault_id: 'v1',
    name: 'Other',
    slug: 'other',
    kind: 'other',
    color_token: 'stone',
    icon_name: 'ellipsis',
    position: 9,
    is_active: true,
    created_at: 'x',
    updated_at: 'x',
    version: 1,
  },
];

const noRules: CategorizationRule[] = [];
const rule = (
  id: string,
  category_id: string,
  matcher: string,
  overrides: Partial<CategorizationRule> = {},
): CategorizationRule => ({
  id,
  vault_id: 'v1',
  category_id,
  rule_type: 'personal_merchant',
  matcher,
  priority: 10,
  confidence: 0.9,
  evidence_count: 1,
  is_active: true,
  created_from: 'user_correction',
  created_at: 'x',
  updated_at: 'x',
  version: 1,
  ...overrides,
});

describe('Category suggestions (US4)', () => {
  it('normalizes merchants consistently', () => {
    expect(normalizeMerchant('STARBUCKS #1234')).toBe('starbucks');
    expect(normalizeMerchant('Starbucks - 5th Ave')).toBe('starbucks 5th ave');
    expect(normalizeMerchant('  AMAZON.COM  ')).toBe('amazon com');
  });

  it('matches deterministic default rules and returns a specific pattern', () => {
    expect(matchDefaultRules('Starbucks')?.categoryName).toBe('Food and Dining');
    expect(matchDefaultRules('Whole Foods Market')?.matchedKeyword).toBe('whole foods');
    expect(matchDefaultRules('Random Shop 42')).toBeNull();
  });

  it('categorizes the TD statement merchant matrix with explicit direction-aware defaults', () => {
    const expected: Array<[string, number, string]> = [
      ['Uber *Trip Help.Uber.Com Ca', -1845, 'Transportation'],
      ['Direct Dep - Payroll Gusto', 205000, 'Income'],
      ['Sq *Local Coffee Shop San Fran', -650, 'Food and Dining'],
      ['Ach Withdrawal - Comcast Cable', -8500, 'Bills and Utilities'],
      ['Target 00012345 Los Angeles', -6432, 'Shopping'],
      ['Amzn Mktp Us*Amzn.Com/Bill Wa', -3299, 'Shopping'],
      ["Trader Joe's Qps", -3840, 'Food and Dining'],
      ['Chevron 0123456 Gas', -4521, 'Transportation'],
      ['Netflix.Com Netflix.Com Ca', -1599, 'Subscriptions'],
      ['Ach Withdrawal - Amex Epay', -15000, 'Transfers'],
      ['Direct Dep - Payroll Gusto', 205000, 'Income'],
      ['Doordash*Chipotle Ca', -2875, 'Food and Dining'],
      ['Spotify Usa 800-952-5210 Ny', -1099, 'Subscriptions'],
      ['The Home Depot', -7821, 'Shopping'],
      ['Ach Withdrawal - State Farm', -12400, 'Bills and Utilities'],
      ['Online Transfer To Acct 9876', -50000, 'Transfers'],
      ['Apple.Com/Bill Cupertino Ca', -999, 'Shopping'],
      ['Wal-Mart', -6432, 'Shopping'],
      ['Ach Withdrawal - Apartment Rent', -185000, 'Bills and Utilities'],
    ];
    for (const [merchant, amountMinor, categoryName] of expected) {
      const suggestion = suggestCategory(merchant, {
        categories: [
          ...categories,
          {
            id: 'cat-shopping',
            vault_id: 'v1',
            name: 'Shopping',
            slug: 'shopping',
            kind: 'expense',
            color_token: 'violet',
            icon_name: 'bag',
            position: 2,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-bills',
            vault_id: 'v1',
            name: 'Bills and Utilities',
            slug: 'bills-and-utilities',
            kind: 'expense',
            color_token: 'sky',
            icon_name: 'receipt',
            position: 3,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-income',
            vault_id: 'v1',
            name: 'Income',
            slug: 'income',
            kind: 'income',
            color_token: 'green',
            icon_name: 'arrow-down-left',
            position: 4,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-subscriptions',
            vault_id: 'v1',
            name: 'Subscriptions',
            slug: 'subscriptions',
            kind: 'expense',
            color_token: 'plum',
            icon_name: 'repeat',
            position: 5,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-transfers',
            vault_id: 'v1',
            name: 'Transfers',
            slug: 'transfers',
            kind: 'transfer',
            color_token: 'gray',
            icon_name: 'repeat',
            position: 6,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
        ],
        personalRules: noRules,
        amountMinor,
      });
      expect(suggestion.source, merchant).toBe('default_rule');
      expect(suggestion.categoryId, merchant).toBe(
        [
          ...categories,
          {
            id: 'cat-shopping',
            vault_id: 'v1',
            name: 'Shopping',
            slug: 'shopping',
            kind: 'expense',
            color_token: 'violet',
            icon_name: 'bag',
            position: 2,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-bills',
            vault_id: 'v1',
            name: 'Bills and Utilities',
            slug: 'bills-and-utilities',
            kind: 'expense',
            color_token: 'sky',
            icon_name: 'receipt',
            position: 3,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-income',
            vault_id: 'v1',
            name: 'Income',
            slug: 'income',
            kind: 'income',
            color_token: 'green',
            icon_name: 'arrow-down-left',
            position: 4,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-subscriptions',
            vault_id: 'v1',
            name: 'Subscriptions',
            slug: 'subscriptions',
            kind: 'expense',
            color_token: 'plum',
            icon_name: 'repeat',
            position: 5,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
          {
            id: 'cat-transfers',
            vault_id: 'v1',
            name: 'Transfers',
            slug: 'transfers',
            kind: 'transfer',
            color_token: 'gray',
            icon_name: 'repeat',
            position: 6,
            is_active: true,
            created_at: 'x',
            updated_at: 'x',
            version: 1,
          },
        ].find((category) => category.name === categoryName)?.id,
      );
    }
  });

  it('keeps card-payment credits in Transfers and unknown merchants reviewable', () => {
    const payment = suggestCategory('Payment Thank You', {
      categories: [
        ...categories,
        {
          id: 'cat-transfers',
          vault_id: 'v1',
          name: 'Transfers',
          slug: 'transfers',
          kind: 'transfer',
          color_token: 'gray',
          icon_name: 'repeat',
          position: 2,
          is_active: true,
          created_at: 'x',
          updated_at: 'x',
          version: 1,
        },
      ],
      personalRules: noRules,
      amountMinor: 15000,
    });
    expect(payment.categoryId).toBe('cat-transfers');
    expect(
      suggestCategory('Unknown Merchant', { categories, personalRules: noRules, amountMinor: -100 })
        .source,
    ).toBe('manual_required');
  });

  it('suggests default-rule categories with explainable provenance', () => {
    const suggestion = suggestCategory('Uber Trip', { categories, personalRules: noRules });
    expect(suggestion).toMatchObject({
      categoryId: 'cat-transport',
      source: 'default_rule',
      confidence: 'high',
      matchedPattern: 'uber',
    });
    expect(suggestion.explanation.detail).toContain('uber');
  });

  it('gives the most specific personal rule precedence over a shorter rule', () => {
    const suggestion = suggestCategory('The Moon Cafe Downtown', {
      categories,
      personalRules: [
        rule('short', 'cat-food', 'moon', { priority: 50 }),
        rule('specific', 'cat-other', 'moon cafe downtown', { priority: 1 }),
      ],
    });
    expect(suggestion).toMatchObject({
      categoryId: 'cat-other',
      source: 'personal_rule',
      matchedRuleId: 'specific',
      matchedPattern: 'moon cafe downtown',
    });
  });

  it('keeps equal-precedence conflicting rules reviewable', () => {
    const suggestion = suggestCategory('Shared Merchant', {
      categories,
      personalRules: [
        rule('a', 'cat-food', 'shared merchant'),
        rule('b', 'cat-transport', 'shared merchant'),
      ],
    });
    expect(suggestion.source).toBe('manual_required');
    expect(suggestion.explanation.detail).toMatch(/multiple personal rules/i);
  });

  it('uses evidence to raise learned rules to confirmed confidence', () => {
    const suggestion = suggestCategory('Corner Cafe', {
      categories,
      personalRules: [rule('learned', 'cat-food', 'corner cafe', { evidence_count: 3 })],
    });
    expect(suggestion.confidence).toBe('confirmed');
  });

  it('falls back to a review-required state instead of silently guessing', () => {
    const suggestion = suggestCategory('Mystery Purchase', { categories, personalRules: noRules });
    expect(suggestion.source).toBe('manual_required');
    expect(suggestion.confidence).toBe('unresolved');
  });

  it('persists correction history and strengthens one learned rule instead of duplicating it', async () => {
    await withNodeDb(async (db) => {
      await applySchema(db);
      await insertVault(db, {
        id: 'v1',
        vault_owner_label: null,
        default_currency: 'USD',
        locale: 'en-US',
        week_start: 'locale_default',
        demo_mode: false,
        created_at: 'x',
        updated_at: 'x',
        deleted_at: null,
      });
      for (const category of categories) await insertCategory(db, category);
      await recordCategoryCorrection(db, {
        vaultId: 'v1',
        merchant: 'Corner Cafe #42',
        nextCategoryId: 'cat-food',
        previousCategoryId: 'cat-other',
        now: '2026-08-05T00:00:00.000Z',
      });
      const first = await rememberMerchantRule(db, {
        vaultId: 'v1',
        merchant: 'Corner Cafe #42',
        categoryId: 'cat-food',
        now: '2026-08-05T00:00:00.000Z',
      });
      const second = await rememberMerchantRule(db, {
        vaultId: 'v1',
        merchant: 'CORNER CAFE',
        categoryId: 'cat-food',
        now: '2026-08-05T00:01:00.000Z',
      });
      expect(first.id).toBe(second.id);
      expect(second.evidence_count).toBe(2);
      expect(await listCorrectionHistory(db, 'v1')).toHaveLength(1);
    });
  });
});
