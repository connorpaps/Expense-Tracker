import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ALIASES } from './scripts/alias.mjs';

function packageAlias() {
  return Object.fromEntries(
    Object.entries(PACKAGE_ALIASES).map(([name, target]) => [
      name,
      fileURLToPath(new URL(`./${target}`, import.meta.url)),
    ]),
  );
}

export default defineWorkspace([
  {
    test: {
      name: 'domain',
      dir: 'packages/domain',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    resolve: { alias: packageAlias() },
  },
  {
    test: {
      name: 'contracts',
      dir: 'packages/contracts',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    resolve: { alias: packageAlias() },
  },
  {
    test: {
      name: 'parsing',
      dir: 'packages/parsing',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    resolve: { alias: packageAlias() },
  },
  {
    test: {
      name: 'fixtures',
      dir: 'packages/fixtures',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    resolve: { alias: packageAlias() },
  },
  {
    test: {
      name: 'design-tokens',
      dir: 'packages/design-tokens',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    resolve: { alias: packageAlias() },
  },
  {
    plugins: [react()],
    test: {
      name: 'web',
      dir: 'apps/web',
      environment: 'jsdom',
      setupFiles: ['./apps/web/tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
    },
    resolve: { alias: packageAlias() },
  },
  {
    test: {
      name: 'relay',
      dir: 'apps/relay',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    resolve: { alias: packageAlias() },
  },
]);
