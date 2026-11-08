import { describe, expect, it } from 'vitest';

import { gzipSize, meshGzipBudget } from '../../tools/studio-budgets.ts';
import { STUDIO_BODIES } from './studio-body.ts';

describe('the size of the studio bodies (design 7.2)', () => {
  for (const [name, body] of Object.entries(STUDIO_BODIES)) {
    it(`keeps the packed mesh of ${name} within the gzip budget of a studio body`, () => {
      expect(gzipSize(body.mesh)).toBeLessThanOrEqual(meshGzipBudget(name));
    });
  }
});
