import { describe, expect, it } from 'vitest';

import { BODY_MESH_GZIP_BUDGET, gzipSize } from '../../tools/body-budgets.ts';
import { BODIES } from './bodies.ts';

describe('the size of the bodies (design 7.2)', () => {
  for (const [name, body] of Object.entries(BODIES)) {
    it(`keeps the packed mesh of ${name} within the gzip budget of a body`, () => {
      expect(gzipSize(body.mesh)).toBeLessThanOrEqual(BODY_MESH_GZIP_BUDGET);
    });
  }
});
