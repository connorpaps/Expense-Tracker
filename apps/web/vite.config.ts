import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ALIASES } from '../../scripts/alias.mjs';

function alias() {
  return Object.fromEntries(
    Object.entries(PACKAGE_ALIASES).map(([name, target]) => [
      name,
      fileURLToPath(new URL(`../../${target}`, import.meta.url)),
    ]),
  );
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: alias() },
  optimizeDeps: { exclude: Object.keys(PACKAGE_ALIASES) },
  server: { port: 5173 },
  build: { target: 'es2022' },
});
