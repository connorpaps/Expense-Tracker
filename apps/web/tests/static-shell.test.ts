import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('optional static shell (T068)', () => {
  it('does not cache or reference vault data stores', () => {
    const worker = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
    expect(worker).toContain("const CACHE_NAME = 'expense-tracker-shell-v1'");
    expect(worker).toContain("url.pathname.startsWith('/assets/')");
    expect(worker).toContain('staticDestination');
    expect(worker).toContain("request.mode === 'navigate'");
    expect(worker).toContain("caches.match('/')");
    expect(worker).not.toMatch(/indexedDB|vault\.db|mutation_log|expense-tracker-security/iu);
  });

  it('registers only as a production enhancement and catches failure', () => {
    const main = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
    expect(main).toContain("if ('serviceWorker' in navigator)");
    expect(main).toContain('if (import.meta.env.PROD)');
    expect(main).toContain("register('/sw.js'");
    expect(main).toContain('getRegistrations()');
    expect(main).toContain('expense-tracker-shell-');
    expect(main).toContain('.catch((cause: unknown)');
  });
});
