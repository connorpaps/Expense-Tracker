/**
 * Category provenance and confidence vocabulary shared by web and iOS.
 * A suggestion is always distinguishable from a user-confirmed category.
 */

export type CategorySource =
  | 'user'
  | 'personal_rule'
  | 'default_rule'
  | 'manual_required';

export type CategoryConfidence = 'confirmed' | 'high' | 'medium' | 'low' | 'unresolved';

export interface CategoryExplanation {
  source: CategorySource;
  confidence: CategoryConfidence;
  matchedRuleId: string | null;
  matchedPattern: string | null;
  detail: string;
}

export const CATEGORY_SOURCE_LABELS: Record<CategorySource, string> = {
  user: 'You chose this',
  personal_rule: 'Your rule',
  default_rule: 'Default rule',
  manual_required: 'Needs review',
};

export const CATEGORY_CONFIDENCE_LABELS: Record<CategoryConfidence, string> = {
  confirmed: 'Confirmed',
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unresolved: 'Needs review',
};
