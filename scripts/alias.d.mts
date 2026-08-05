/**
 * Type declaration for scripts/alias.mjs so that TS-compiled configs
 * (vite.config.ts, vitest.workspace.ts) can import it without a module
 * declaration error.
 */

export interface PackageAlias {
  /** NPM package name (e.g. @expense-tracker/domain). */
  name: string;
  /** Relative path to the package directory from the repo root. */
  target: string;
}

export const PACKAGE_ALIASES: Record<string, string>;
