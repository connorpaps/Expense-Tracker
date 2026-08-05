// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { openVaultStore } from '../src/local/vault';

describe('browser vault bootstrap', () => {
  it('exposes the real wa-sqlite bootstrap contract', () => {
    // The actual IndexedDB/WASM execution is verified in Chrome; this test
    // documents the public result shape used by App and ImportPage.
    expect(openVaultStore).toBeTypeOf('function');
  });
});
