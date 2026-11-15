/**
 * Mixes two integers into one 32-bit hash. The pose uses it to give each player and each time
 * window its own seeded values, with no state (design 5.1, 5.3).
 *
 * @param a The first integer, for example the seed.
 * @param b The second integer, for example a player index or a window index.
 * @returns An unsigned 32-bit integer.
 */
export function mixHash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Gives a seeded number from two integers, with no state.
 *
 * @param a The first integer, for example the seed of a player.
 * @param b The second integer, for example the index of a time window.
 * @returns A number in [0, 1).
 */
export function hashUnit(a: number, b: number): number {
  return mixHash(a, b) / 4_294_967_296;
}

/**
 * Makes a seeded random number generator: mulberry32. The same seed gives the same numbers.
 *
 * @param seed The seed, an integer.
 * @returns A function that gives the next number in [0, 1) at each call.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Makes the seeded generator of one decision of the plan (design 5.6): a framing, a jitter, or an
 * end. The seed, the time, and the name of the decision set its numbers, so the numbers do not
 * depend on the other decisions. With one generator for the full plan, each camera search took
 * numbers from it. When the search of one candidate changed, all later shots changed. A move of
 * the players by 1 to 2 cm then changed 30 of 31 shots of the Boulanger demo.
 *
 * @param seed The seed of the plan.
 * @param time The time of the decision, in song seconds: the cut, or the start of the shot.
 * @param name The name of the decision, for example `jitter solo 3`.
 * @returns The generator.
 */
export function decisionRandom(seed: number, time: number, name: string): () => number {
  let hash = mixHash(seed, Math.round(time * 1000));
  for (let i = 0; i < name.length; i++) {
    hash = mixHash(hash, name.charCodeAt(i));
  }
  return mulberry32(hash);
}
