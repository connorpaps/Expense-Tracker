/**
 * Canonical map of internal package names to their source entry points.
 * Consumed by Vite/Vitest configs. tsconfig.base.json mirrors these paths
 * for the TypeScript language server and typechecking.
 */
export const PACKAGE_ALIASES = {
  '@expense-tracker/domain': 'packages/domain/src/index.ts',
  '@expense-tracker/contracts': 'packages/contracts/src/index.ts',
  '@expense-tracker/parsing': 'packages/parsing/src/index.ts',
  '@expense-tracker/fixtures': 'packages/fixtures/src/index.ts',
  '@expense-tracker/design-tokens': 'packages/design-tokens/src/index.ts',
};
