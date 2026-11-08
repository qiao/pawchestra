import { describe, expect, it } from 'vitest';

import { patchedDemo } from '../../tools/patch-demos.ts';
import { chord, programChange } from '../midi/test-smf.ts';
import { timeRatio } from '../test-speed.ts';
import { assignPlayersSteps } from './players.ts';
import { buildScore } from './score.ts';
import { assignSeats } from './seats.ts';
import { runAll } from './steps.ts';
import { timelineOf } from './test-score.ts';

/**
 * The most time of `buildScore()` for the largest demo, as a multiple of the time of the
 * reference work of {@link timeRatio} (design 9.7). On the development Mac, the ratio is 6.1 to
 * 6.6 at a load average of 25, and the limit is 2 times 6.5. Thus a build that is 3 times slower
 * fails (18.7), and the limit stays below the 100 ms of design 9.7 on that Mac (about 34 ms).
 */
const BUILD_LIMIT = 13;

/**
 * The rounds of the score build time. Each round times one build and one reference work. With
 * 16 busy processes, at a load average of 260 to 330, 20 rounds gave ratios up to 8.9, and 40
 * rounds up to 6.3.
 */
const BUILD_ROUNDS = 40;

/**
 * The most time of `assignPlayersSteps()` for a flute chord of 16,000 notes, as a multiple of the time
 * of the reference work of {@link timeRatio}. On the development Mac, the ratio is 3.0 (about
 * 8 ms), and the limit is 2 times the ratio. Thus an assignment that is 3 times slower fails.
 */
const CHORD_LIMIT = 6;

/** The rounds of the chord time. Each round times one assignment and one reference work. */
const CHORD_ROUNDS = 20;

describe('the time of the score (design 9.7)', () => {
  it('builds the score of the largest demo in at most 2 times the time on the development Mac', async () => {
    const demo = await patchedDemo('boulanger-matin.mid');
    const ratio = timeRatio(() => {
      buildScore(demo.source, 'auto');
    }, BUILD_ROUNDS);
    expect(ratio).toBeLessThan(BUILD_LIMIT);
  });

  it('gives the players of a flute chord of 16,000 notes in at most 2 times the time on the development Mac', () => {
    const keys = Array.from({ length: 16_000 }, (...[, i]) => 40 + (i % 60));
    const timeline = timelineOf({
      tracks: [
        [programChange(0, 0, 73), ...chord(0, 0, keys)],
        [programChange(0, 1, 73), ...chord(0, 1, [72])],
      ],
    });
    const seating = assignSeats(timeline);
    const ratio = timeRatio(() => {
      runAll(assignPlayersSteps(timeline, seating, 'auto'));
    }, CHORD_ROUNDS);
    expect(ratio).toBeLessThan(CHORD_LIMIT);
  });
});
