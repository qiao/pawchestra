import { describe, expect, it } from 'vitest';

import { DEFAULT_E2E_PORT, e2ePort } from './e2e-port.ts';

describe('e2ePort', () => {
  it('gives the default port when the variable is not set or empty', () => {
    expect(e2ePort(undefined)).toBe(DEFAULT_E2E_PORT);
    expect(e2ePort('')).toBe(DEFAULT_E2E_PORT);
  });

  it('reads the port of the variable', () => {
    expect(e2ePort('4290')).toBe(4290);
  });

  it('throws for a value that is not a free port number', () => {
    for (const value of ['abc', '4182.5', '80', '70000']) {
      expect(() => e2ePort(value)).toThrow('PAWCHESTRA_E2E_PORT');
    }
  });
});
