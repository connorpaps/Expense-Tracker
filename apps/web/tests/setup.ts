import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL cannot auto-register cleanup without vitest globals enabled.
afterEach(() => cleanup());
