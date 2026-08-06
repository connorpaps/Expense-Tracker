import type { CategoryKind } from './enums';

export interface Category {
  id: string;
  vault_id: string;
  name: string;
  slug: string;
  kind: CategoryKind;
  color_token: string;
  icon_name: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

export const DEFAULT_CATEGORIES: Array<{
  name: string;
  kind: CategoryKind;
  color_token: string;
  icon_name: string;
}> = [
  { name: 'Food and Dining', kind: 'expense', color_token: 'copper', icon_name: 'utensils' },
  { name: 'Transportation', kind: 'expense', color_token: 'slate', icon_name: 'car' },
  { name: 'Shopping', kind: 'expense', color_token: 'violet', icon_name: 'bag' },
  { name: 'Bills and Utilities', kind: 'expense', color_token: 'sky', icon_name: 'receipt' },
  { name: 'Entertainment', kind: 'expense', color_token: 'rose', icon_name: 'ticket' },
  { name: 'Subscriptions', kind: 'expense', color_token: 'plum', icon_name: 'repeat' },
  { name: 'Health', kind: 'expense', color_token: 'emerald', icon_name: 'heart' },
  { name: 'Travel', kind: 'expense', color_token: 'amber', icon_name: 'plane' },
  { name: 'Income', kind: 'income', color_token: 'green', icon_name: 'arrow-down-left' },
  { name: 'Transfers', kind: 'transfer', color_token: 'gray', icon_name: 'repeat' },
  { name: 'Other', kind: 'other', color_token: 'stone', icon_name: 'ellipsis' },
];

/** Canonical slug from a display name (stable, lower-case, hyphenated). */
export function categorySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
