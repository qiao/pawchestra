/**
 * The venues, in the order of the setting "Scene" (design 2.8, 4.1). The first one is the
 * default.
 */
export const VENUE_IDS = ['hall', 'forest'] as const;

/** The place around the stage (design 4.1). The hash key `scene` names it (design 2.8). */
export type VenueId = (typeof VENUE_IDS)[number];

/** The default venue: the concert hall. No hash key `scene` gives it. */
export const DEFAULT_VENUE: VenueId = VENUE_IDS[0];

/**
 * Finds if a text is the id of a venue.
 *
 * @param value The text.
 * @returns True for one of {@link VENUE_IDS}.
 */
export function isVenueId(value: string): value is VenueId {
  return VENUE_IDS.some((id) => id === value);
}
