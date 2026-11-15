import type { Stance } from './body-frame.ts';
import type { Vec3 } from './tuples.ts';
import type { MeshBuilder } from './mesh.ts';
import type { BoneName } from './rig.ts';
import type { SpeciesParams } from './species.ts';
import type { Steps } from '../score/steps.ts';
import { buildBody, buildBodySteps } from './body.ts';

/** The bones that the body places. The instrument generators place the other bones. */
export type BodyBoneName = Exclude<
  BoneName,
  'instrument' | 'bow' | 'malletL' | 'malletR' | 'baton' | 'slide'
>;

/** The bind positions of the body bones, and the points that the instruments need. */
export interface BodyBones {
  /** The bind position of each body bone. */
  readonly positions: Readonly<Record<BodyBoneName, Vec3>>;
  /** The head height `H` of the species, in meters (design 4.5, body proportions). */
  readonly headHeight: number;
  /** The center of the head. */
  readonly headCenter: Vec3;
  /**
   * The middle of the mouth, at the front of the lips or the beak (`Body.mouth`, design 4.4,
   * 4.6).
   */
  readonly mouth: Vec3;
  /** The point on the floor under the middle of the body. */
  readonly floor: Vec3;
  /** The point in the middle of the palm of the left hand. */
  readonly palmL: Vec3;
  /** The point in the middle of the palm of the right hand. */
  readonly palmR: Vec3;
  /** The middle of the finger block of the left hand, on its `fingers` bone. */
  readonly fingerBlockL: Vec3;
}

/**
 * Builds the body of a species in its bind pose, and adds its parts to a mesh (design 4.4). Each
 * species has a body of its own (`SpeciesParams.body`): a body of `models/body.ts`.
 * The animal faces -z, its left side is -x, and the floor is at y = 0.
 *
 * @param builder The mesh that gets the parts.
 * @param species The species parameters.
 * @param stance The seat under the body, or no seat.
 * @returns The bind positions of the body bones.
 */
export function buildBiped(
  builder: MeshBuilder,
  species: SpeciesParams,
  stance: Stance,
): BodyBones {
  return buildBody(builder, species.body, stance.kind === 'standing', species.palette);
}

/**
 * Builds the body of a species as {@link buildBiped} does, in steps (design 7.2).
 *
 * @param builder The mesh that gets the parts.
 * @param species The species parameters.
 * @param stance The seat under the body, or no seat.
 * @returns The steps, which return the bind positions of the body bones.
 */
export function buildBipedSteps(
  builder: MeshBuilder,
  species: SpeciesParams,
  stance: Stance,
): Steps<BodyBones> {
  return buildBodySteps(builder, species.body, stance.kind === 'standing', species.palette);
}
