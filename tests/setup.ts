import { vi } from 'vitest';

vi.stubGlobal('console', {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});
