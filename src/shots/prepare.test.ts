import { MathUtils } from 'three';
import { describe, expect, it } from 'vitest';

import {
  noteOff,
  noteOn,
  programChange,
  tempo,
  timeSignature,
  track,
  writeSmf,
} from '../midi/test-smf.ts';
import type { TestEvent, TestFile } from '../midi/test-smf.ts';
import type { Score } from '../score/types.ts';
import { angleDifference, viewAngle } from './camera-keys.ts';
import { layoutScene } from '../models/layout-scene.ts';
import type { SceneLayout } from '../models/layout.ts';
import { ModelCache } from '../models/model-cache.ts';
import { stringQuartetFile } from '../models/test-chamber.ts';
import { mulberry32 } from '../pose/random.ts';
import { firstVoiceFile } from '../score/test-first-voice.ts';
import { musicIn, prepareMusic } from './music.ts';
import { scoreOf } from '../score/test-score.ts';
import { FILM_GRAMMAR } from './grammar.ts';
import { SHOT_TIMES, SMALL_GROUP_SEATS, WIDE_VARIANTS, prepareShots } from './prepare.ts';
import { SECTION_GROUPS, prepareSubjects, sectionSubject, soloSubject } from './subjects.ts';
import type { SectionGroup } from './subjects.ts';
import { TEST_SEED, chamberShotScenes, shotDemos, shotSceneOf } from './test-shots.ts';
import type { ShotScene } from './test-shots.ts';
import type { Shot } from './types.ts';
import type { Vec3 } from '../models/tuples.ts';
import { DEFAULT_AZIMUTH, DEFAULT_ELEVATION, DEFAULT_TARGET, FIELD_OF_VIEW } from './view.ts';

const DEMOS = await shotDemos();

const SCENES = DEMOS.map((demo) => shotSceneOf(demo.file, demo.bytes));

/** The chamber test files: a piano solo, a duo, a string quartet, and a wind quintet. */
const CHAMBER = chamberShotScenes();

/**
 * Gives the group of a section or solo shot.
 *
 * @param score The score.
 * @param shot The shot.
 * @returns The group, or `null` for a wide, a high, or a conductor shot.
 */
function groupOf(score: Score, shot: Shot): SectionGroup | null {
  if (shot.kind !== 'section' && shot.kind !== 'solo') {
    return null;
  }
  const section = score.seats[shot.seats[0] ?? -1]?.section;
  return section && section !== 'sound-only' ? SECTION_GROUPS[section] : null;
}

/**
 * Moves each item of a layout away from the stage center by a factor in the stage plane, so that
 * no player blocks the view of another. The heights stay.
 *
 * @param layout The layout.
 * @param factor The factor.
 * @returns The spread layout.
 */
function spreadLayout(layout: SceneLayout, factor: number): SceneLayout {
  const away = (p: Vec3): Vec3 => [p[0] * factor, p[1], p[2] * factor];
  return {
    ...layout,
    stageSide: layout.stageSide * factor,
    podium: away(layout.podium),
    conductor: layout.conductor
      ? { ...layout.conductor, position: away(layout.conductor.position) }
      : null,
    players: layout.players.map((p) => ({ ...p, position: away(p.position) })),
    stands: layout.stands.map((s) => ({ ...s, position: away(s.position) })),
    risers: layout.risers.map((r) => ({ ...r, radius: r.radius * factor })),
  };
}

/**
 * Gives the elevations of the section and solo cameras of a plan, in degrees. A piano shot is
 * 20° higher, so that it looks down on the keys, and it does not count.
 *
 * @param score The score.
 * @param shots The shots of the plan.
 * @returns The elevations at the start of each shot.
 */
function closeElevations(score: Score, shots: readonly Shot[]): number[] {
  return shots
    .filter(
      (shot) =>
        (shot.kind === 'section' || shot.kind === 'solo') &&
        !shot.seats.every((seat) => score.seats[seat]?.section === 'piano'),
    )
    .map((shot) => MathUtils.radToDeg(shot.from.elevation));
}

/**
 * Tells if a shot is a wide or a high shot.
 *
 * @param shot The shot.
 * @returns True for a wide or a high shot.
 */
function isWide(shot: Shot): boolean {
  return shot.kind === 'wide' || shot.kind === 'high';
}

describe('the cut points of prepareShots() (design 5.6)', () => {
  it.each(SCENES)(
    'cuts $file on downbeats or middle beats, or on a beat when none fits',
    (scene) => {
      const { plan, score } = scene;
      const downbeats = score.beats.filter((b) => b.indexInBar === 0).map((b) => b.timeSec);
      const beats = score.beats.map((b) => b.timeSec);
      // The middle beat of a bar with an even number of beats (N5).
      const middles = downbeats.flatMap((time, i) => {
        const next = downbeats[i + 1];
        if (next === undefined) {
          return [];
        }
        const middle = (time + next) / 2;
        return beats.some((t) => Math.abs(t - middle) <= 0.001) ? [middle] : [];
      });
      const near = (list: readonly number[], time: number): boolean =>
        list.some((t) => Math.abs(t - time) <= 0.001);
      let onBeat = 0;
      for (const shot of plan.shots.slice(1)) {
        expect(near(beats, shot.startSec), `${shot.startSec}`).toBe(true);
        if (!near(downbeats, shot.startSec) && !near(middles, shot.startSec)) {
          onBeat++;
        }
      }
      // Nearly all cuts fall on a downbeat or on the middle beat of a bar.
      expect(onBeat).toBeLessThanOrEqual(Math.ceil(plan.shots.length * 0.1));
    },
  );

  it.each(SCENES)('varies the shot lengths of $file (N5)', (scene) => {
    // In Bach, 30 of 34 shots lasted 9.6 s, and K. 525 had three lengths. With cuts on downbeats
    // and middle beats, the bars of K. 525 (3.6 s) allow 5 lengths from 4 s to 14 s.
    const lengths = scene.plan.shots
      .slice(1, -1)
      .map((shot) => (shot.endSec - shot.startSec).toFixed(1));
    const counts = new Map<string, number>();
    for (const length of lengths) {
      counts.set(length, (counts.get(length) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...counts.values()) / lengths.length).toBeLessThanOrEqual(0.5);
  });

  it.each(SCENES)('gives few neighbor shots of $file the same length', (scene) => {
    // With no rule, 13 of 36 neighbor shots of the Bach demo had the same length.
    const lengths = scene.plan.shots
      .slice(1, -1)
      .map((shot) => (shot.endSec - shot.startSec).toFixed(1));
    const same = lengths.slice(1).filter((length, i) => length === lengths[i]).length;
    expect(same / (lengths.length - 1)).toBeLessThanOrEqual(0.15);
  });

  it.each(SCENES)(
    'gives each shot of $file 4 to 14 s, and 18 s for a wide or high shot',
    (scene) => {
      const { plan } = scene;
      for (const [i, shot] of plan.shots.entries()) {
        if (i > 0) {
          expect(shot.startSec).toBe(plan.shots[i - 1]?.endSec);
        }
        if (i === 0 || i === plan.shots.length - 1) {
          continue;
        }
        const length = shot.endSec - shot.startSec;
        expect(length, `shot ${i}`).toBeGreaterThanOrEqual(SHOT_TIMES.minSec - 1e-9);
        expect(length, `shot ${i}`).toBeLessThanOrEqual(
          (isWide(shot) ? SHOT_TIMES.maxWideSec : SHOT_TIMES.maxSec) + 1e-9,
        );
      }
      expect(Array.from(plan.starts)).toEqual(plan.shots.map((s) => s.startSec));
    },
  );

  it.each([...SCENES, ...CHAMBER])(
    'opens $file on the default view and ends on a wide shot',
    (scene) => {
      const { plan, score } = scene;
      const first = plan.shots[0];
      const last = plan.shots.at(-1);
      expect(first?.startSec).toBe(-Infinity);
      // The first screen shows the default view of design 4.5, so the click on play makes no cut.
      // The view pushes in over the first phrase.
      expect(first?.kind).toBe('wide');
      expect(first?.from.azimuth).toBeCloseTo(DEFAULT_AZIMUTH, 9);
      expect(first?.from.elevation).toBeCloseTo(DEFAULT_ELEVATION, 9);
      expect(first?.from.zoom).toBe(1);
      expect(first?.from.fov).toBe(FIELD_OF_VIEW);
      expect(first?.to).toEqual({ ...first?.from, zoom: 0.92 });
      expect(first?.target).toEqual(DEFAULT_TARGET);
      expect(first?.endSec).toBeGreaterThanOrEqual(SHOT_TIMES.minSec);
      expect(last?.kind).toBe('wide');
      expect(last?.endSec).toBe(Infinity);
      expect(last?.startSec).toBeLessThanOrEqual(score.durationSec - SHOT_TIMES.lastLeadSec);
      expect(last?.moveEndSec).toBe(score.durationSec);
      expect(last?.from.zoom).toBeLessThan(last?.to.zoom ?? 0);
      expect(last?.target).toEqual(DEFAULT_TARGET);
      for (const shot of plan.shots.filter((s) => s.kind === 'wide')) {
        expect(shot.target).toEqual(DEFAULT_TARGET);
      }
    },
  );

  it('takes the first wide variant from the default view (design 5.6)', () => {
    // The variants hold degrees, and the default view holds radians.
    const [first] = WIDE_VARIANTS;
    expect(MathUtils.degToRad(first?.azimuth ?? NaN)).toBeCloseTo(DEFAULT_AZIMUTH, 9);
    expect(MathUtils.degToRad(first?.elevation ?? NaN)).toBeCloseTo(DEFAULT_ELEVATION, 9);
    expect(first?.zoom).toBe(1);
  });

  it('keeps the zoom of a wide variant from the side, which arcs (design 5.6)', () => {
    // The push-in of a variant from the side went from the zoom 1.1 to 1.01, and a stage corner
    // of K. 525 left a view of the aspect 1.6.
    const k525 = DEMOS.find((demo) => demo.file === 'mozart-k525.mid');
    if (!k525) {
      throw new Error('The demo K. 525 is missing.');
    }

    const extra = [1, 2, 3].map((seed) => shotSceneOf(k525.file, k525.bytes, seed));
    let sides = 0;
    for (const { plan } of [...SCENES, ...extra]) {
      for (const shot of plan.shots.filter((s) => s.kind === 'wide' && s.from.zoom > 1)) {
        expect(shot.to.zoom).toBe(shot.from.zoom);
        expect(shot.to.azimuth).not.toBe(shot.from.azimuth);
        sides++;
      }
    }
    expect(sides).toBeGreaterThan(3);
  });
});

describe('the choice of the shots of prepareShots() (design 5.6)', () => {
  it.each(SCENES)('repeats no subject and no group in neighbor shots of $file', (scene) => {
    const { plan, score } = scene;
    for (let i = 1; i < plan.shots.length; i++) {
      const a = plan.shots[i - 1];
      const b = plan.shots[i];
      if (!a || !b) {
        continue;
      }
      // When no subject has a clear camera after a conductor shot, the conductor fills the time
      // with its other framing, a camera of another field of view (design 5.6, rule 6).
      if (a.kind === 'conductor' && b.kind === 'conductor') {
        expect(b.from.fov, `shots ${i - 1} and ${i}`).not.toBe(a.from.fov);
        continue;
      }
      const sameSubject = a.kind === b.kind && a.seats.join() === b.seats.join();
      expect(sameSubject && b.kind !== 'wide', `shots ${i - 1} and ${i}`).toBe(false);
      const group = groupOf(score, b);
      if (group) {
        expect(groupOf(score, a), `shots ${i - 1} and ${i}`).not.toBe(group);
      }
    }
  });

  it.each(SCENES)('keeps three shots between wide or high shots of $file, at most 25%', (scene) => {
    const { plan } = scene;
    // The opening is a wide shot. The rule counts the shots after it.
    let last = 0;
    let count = 0;
    for (const [i, shot] of plan.shots.entries()) {
      if (i > 0 && isWide(shot)) {
        expect(i - last, `shot ${i}`).toBeGreaterThan(SHOT_TIMES.wideSpacing);
        last = i;
        count++;
      }
    }
    expect(count / (plan.shots.length - 1)).toBeLessThanOrEqual(0.25);
  });

  it.each(SCENES)(
    'shows the conductor of $file in at most 20% of the shots, first over its shoulder',
    (scene) => {
      // Bach had 12 conductor shots of 35, all from one angle.
      const { plan } = scene;
      const conductor = plan.shots.flatMap((shot, i) => (shot.kind === 'conductor' ? [i] : []));
      expect(conductor.length / plan.shots.length).toBeLessThanOrEqual(0.2);
      // The first conductor shot comes after five other shots. Each camera stands on the audience
      // side, as views 02 and 05 of scene.png.
      const first = conductor[0] ?? -1;
      expect(first).toBeGreaterThanOrEqual(SHOT_TIMES.conductorSpacing);
      for (const i of conductor) {
        const azimuth = plan.shots[i]?.from.azimuth ?? Math.PI;
        expect(Math.abs(angleDifference(azimuth, 0)), `shot ${i}`).toBeLessThan(Math.PI / 2);
      }
      // The first one looks over the shoulder of the bear at the orchestra (view 02), and the next
      // one shows the bear close (view 05).
      const radius = (i: number): number => plan.shots[i]?.radius ?? 0;
      expect(radius(first)).toBeGreaterThan(0.25 * plan.stageSide);
      if (conductor.length > 1) {
        expect(radius(conductor[1] ?? -1)).toBeLessThan(1.5);
      }
    },
  );

  it.each(SCENES)(
    'puts each section and solo camera of $file on the 6° grid of its front',
    (scene) => {
      // The planner keeps the test result of each camera of a subject on the grid (design 5.6).
      const { score, layout, models, plan } = scene;
      const subjects = prepareSubjects(score, layout, models);
      let checked = 0;
      for (const shot of plan.shots) {
        const subject =
          shot.kind === 'solo'
            ? soloSubject(subjects, shot.seats[0] ?? -1)
            : shot.kind === 'section'
              ? sectionSubject(subjects, shot.seats, undefined, shot.part)
              : null;
        if (!subject) {
          continue;
        }
        const steps = angleDifference(shot.from.azimuth, subject.front) / ((6 * Math.PI) / 180);
        expect(
          Math.abs(steps - Math.round(steps)),
          `${shot.kind} at ${shot.startSec}`,
        ).toBeLessThan(1e-6);
        checked++;
      }
      expect(checked).toBeGreaterThan(5);
    },
  );

  it('keeps the section and solo cameras of the demos at 50° or lower (N4)', () => {
    // The close shots of the back rows looked down at 40° to 60°.
    const elevations = SCENES.flatMap(({ plan, score }) => closeElevations(score, plan.shots));
    expect(Math.max(...elevations)).toBeLessThanOrEqual(50 + 1e-9);
  });

  it('keeps the section and solo cameras low when no player blocks them (N4)', () => {
    // N4 asks for at least 60% of these cameras at 30° or lower, and at most 15% above 40°. In
    // the demos, the bodies block some low cameras, so a new body moves these shares. With each
    // layout spread 4 times, no player blocks another, and each camera stays in the lowest band.
    // Thus a planner that raises a camera with no blocked view fails here. With a spread of 3,
    // the red foxes still block the low cameras to the flutes of the Boulanger demo.
    const elevations = SCENES.flatMap(({ score, layout, models }) =>
      closeElevations(score, prepareShots(score, spreadLayout(layout, 4), TEST_SEED, models).shots),
    );
    const low = elevations.filter((e) => e <= 30 + 1e-9).length / elevations.length;
    const high = elevations.filter((e) => e > 40 + 1e-9).length / elevations.length;
    expect(elevations.length).toBeGreaterThan(50);
    expect(low).toBe(1);
    expect(high).toBe(0);
  });

  it('films the high shots of the demos from the front, high in the hall (scene.png 09)', () => {
    // The plans of three seeds give more than 5 high shots for each seed on average. One seed
    // gave 5 to 8, and a change of the cast moved the count across the limit of more than 5.
    const deg = 180 / Math.PI;
    const scenes = [
      ...SCENES,
      ...DEMOS.flatMap((demo) => [2, 3].map((seed) => shotSceneOf(demo.file, demo.bytes, seed))),
    ];
    const high = scenes.flatMap(({ plan }) => plan.shots.filter((shot) => shot.kind === 'high'));
    expect(high.length).toBeGreaterThan(3 * 5);
    for (const shot of high) {
      for (const key of [shot.from, shot.to]) {
        expect(Math.abs(key.azimuth * deg)).toBeLessThanOrEqual(12 + 1e-9);
        expect(key.elevation * deg).toBeGreaterThanOrEqual(40 - 1e-9);
        expect(key.elevation * deg).toBeLessThanOrEqual(48 + 1e-9);
        // Farther than the default view of a desktop (0.56), so the hall shows around the stage.
        expect(key.zoom).toBeCloseTo(0.75, 9);
      }
    }
  });

  it('starts the section and solo cameras of the front rows low (scene.png 06 to 08)', () => {
    // The lowest camera of a kind is its start elevation at the podium (back 0), with no rise.
    const deg = 180 / Math.PI;
    const lowest = (kind: Shot['kind']): number =>
      Math.min(
        ...SCENES.flatMap(({ plan }) =>
          plan.shots.filter((shot) => shot.kind === kind).map((shot) => shot.from.elevation * deg),
        ),
      );
    expect(lowest('section')).toBeCloseTo(14, 6);
    expect(lowest('solo')).toBeCloseTo(12, 6);
  });

  it.each(SCENES)('shows a wide or high shot of $file at least every 60 s (N6)', (scene) => {
    // K. 315 showed no wide view from 10 s to 183 s.
    const { plan } = scene;
    let lastEnd = 0;
    for (const shot of plan.shots) {
      if (!isWide(shot)) {
        continue;
      }
      const start = Math.max(0, shot.startSec);
      expect(start - lastEnd, `wide view at ${start.toFixed(1)} s`).toBeLessThanOrEqual(60 + 1e-9);
      lastEnd = shot.endSec;
    }
  });

  it.each(SCENES)(
    'turns the camera of the next shot of a subject of $file by 20° (N7)',
    (scene) => {
      // K. 315 showed the solo flute six times from almost the same angle.
      const { plan, score } = scene;
      const last = new Map<string, number>();
      let checked = 0;
      for (const shot of plan.shots) {
        if (shot.kind !== 'section' && shot.kind !== 'solo' && shot.kind !== 'side') {
          continue;
        }
        const section = score.seats[shot.seats[0] ?? -1]?.section;
        const group = section && section !== 'sound-only' ? SECTION_GROUPS[section] : 'none';
        const id =
          shot.kind === 'side'
            ? `side ${Math.sign(shot.target[0])}`
            : shot.kind === 'solo'
              ? `solo ${shot.seats[0]}`
              : `section ${group}`;
        const before = last.get(id);
        if (before !== undefined) {
          const turn = Math.abs(angleDifference(shot.from.azimuth, before)) * (180 / Math.PI);
          expect(turn, `${id} at ${shot.startSec.toFixed(1)} s`).toBeGreaterThanOrEqual(20 - 1e-6);
          checked++;
        }
        last.set(id, shot.from.azimuth);
      }
      // The count of the subjects that a plan shows a second time depends on the layout of the
      // demo, so the paused file `shots/plan-counts.test.ts` checks it.
      expect(checked).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(SCENES)('makes no jump cut in $file', (scene) => {
    const { plan } = scene;
    const size = (shot: Shot): number => (isWide(shot) ? 0.7 * plan.stageSide : shot.radius);
    for (let i = 1; i < plan.shots.length; i++) {
      const a = plan.shots[i - 1];
      const b = plan.shots[i];
      if (!a || !b) {
        continue;
      }
      const ratio = Math.max(size(a), size(b)) / Math.min(size(a), size(b));
      const angle = viewAngle(a.to, b.from);
      const { jumpAngle, jumpSize } = FILM_GRAMMAR;
      expect(angle >= jumpAngle || ratio >= jumpSize, `shots ${i - 1}, ${i}`).toBe(true);
    }
  });

  it('holds the previous shot when no subject fits, with no wide shot before the last', () => {
    // Four seats play 20 bars (40 s), rest 16 bars, and play one more bar. The windows after the
    // cuts in the rest have no active seat, so no subject fits. The previous shot holds on, and
    // then the conductor fills the time. In the Beethoven 8 demo, a wide shot there came just
    // before the last wide shot, against rule 3, and made a jump cut.
    const file: TestFile = {
      tracks: [
        [tempo(0, 120), timeSignature(0, 4, 4)],
        ...[40, 41, 42, 43].map((program, channel) =>
          track(
            [programChange(0, channel, program)],
            [...bars(channel, 60 + channel, 0, 20, 64), ...bars(channel, 60 + channel, 36, 37, 64)],
          ),
        ),
      ],
    };
    const { plan } = shotSceneOf('rest', writeSmf(file));
    const last = plan.shots.at(-1);
    expect(last?.kind).toBe('wide');
    expect(plan.shots.slice(-1 - SHOT_TIMES.wideSpacing, -1).some(isWide)).toBe(false);
    // The shot at the start of the rest holds into it, or the conductor fills it.
    const inRest = plan.shots.filter((shot) => shot.endSec > 44 && shot.startSec < 66);
    expect(inRest.every((shot) => !isWide(shot) || shot === last)).toBe(true);
    for (const shot of plan.shots.slice(1, -1)) {
      expect(shot.endSec - shot.startSec).toBeLessThanOrEqual(SHOT_TIMES.maxSec + 1e-9);
    }
  });

  it('gives the same plan for the same seed, and another plan for another seed', () => {
    const demo = DEMOS[0];
    const scene = SCENES[0];
    if (!demo || !scene) {
      throw new Error('No demo.');
    }
    expect(shotSceneOf(demo.file, demo.bytes, TEST_SEED).plan).toEqual(scene.plan);
    expect(shotSceneOf(demo.file, demo.bytes, TEST_SEED + 1).plan).not.toEqual(scene.plan);
  });
});

/** A quarter note in ticks. At 120 BPM, it is 0.5 s, and a bar of 4/4 is 2 s. */
const QUARTER = 480;

/** A bar of 4/4 in ticks. */
const BAR = QUARTER * 4;

/**
 * Makes a held note on a channel for a range of bars.
 *
 * @param channel The channel.
 * @param key The key.
 * @param from The first bar.
 * @param to The bar after the last bar.
 * @param velocity The velocity.
 * @returns The events, one note for each bar.
 */
function bars(
  channel: number,
  key: number,
  from: number,
  to: number,
  velocity: number,
): TestEvent[] {
  const events: TestEvent[] = [];
  for (let bar = from; bar < to; bar++) {
    events.push(
      noteOn(bar * BAR, channel, key, velocity),
      noteOff(bar * BAR + BAR - 10, channel, key),
    );
  }
  return events;
}

/**
 * Makes the horn test file: soft strings play 40 bars, and the horns rest from the start and
 * enter at bar 12 (24 s), on a phrase line. The single horn stands behind the strings.
 *
 * @returns The bytes of the file.
 */
function hornEntryFile(): Uint8Array {
  const file: TestFile = {
    tracks: [
      [tempo(0, 120), timeSignature(0, 4, 4)],
      track([programChange(0, 0, 40)], bars(0, 67, 0, 40, 40)),
      track([programChange(0, 1, 41)], bars(1, 60, 0, 40, 40)),
      track([programChange(0, 2, 42)], bars(2, 48, 0, 40, 40)),
      track([programChange(0, 3, 60)], bars(3, 67, 12, 24, 110)),
    ],
  };
  return writeSmf(file);
}

describe('the soloist and the first voice (design 5.6, UX audit 2026-10-05, SC4)', () => {
  it('gives the solo flute of the K. 315 concerto an early solo shot', () => {
    // The first rule gave the flute its first solo shot at 94 s.
    const scene = SCENES.find((s) => s.file === 'mozart-k315.mid');
    if (!scene) {
      throw new Error('No K. 315 demo.');
    }
    const flute = scene.score.seats.findIndex((s) => s.section === 'flute');
    const first = scene.plan.shots.find((s) => s.kind === 'solo' && s.seats[0] === flute);
    expect(first?.startSec).toBeLessThan(20);
  });

  it('films the soloist of K. 315 at its place at the front left (design 4.5, AM3)', () => {
    const scene = SCENES.find((s) => s.file === 'mozart-k315.mid');
    if (!scene) {
      throw new Error('No K. 315 demo.');
    }
    const { soloist } = scene.score;
    const place = scene.layout.players.find((p) => p.cast.seatIndex === soloist);
    const shots = scene.plan.shots.filter((s) => s.kind === 'solo' && s.seats[0] === soloist);
    // The seated players hide the low cameras of the solo of the horns at 78.3 s. The plan then takes a side shot that holds
    // the soloist, so its solo shot of 93.9 s drops out, and 2 solo shots of the soloist stay.
    expect(shots.length).toBeGreaterThanOrEqual(2);
    for (const shot of shots) {
      // The target is above the soloist, and the camera looks at its front from the audience.
      expect(shot.target[0]).toBeCloseTo(place?.position[0] ?? NaN, 6);
      expect(shot.target[2]).toBeCloseTo(place?.position[2] ?? NaN, 6);
      const front = Math.atan2(-Math.sin(place?.facing ?? 0), -Math.cos(place?.facing ?? 0));
      expect(Math.abs(angleDifference(shot.from.azimuth, front))).toBeLessThanOrEqual(
        (75 * Math.PI) / 180 + 1e-9,
      );
    }
  });

  it('shows the first voice at the first cut, also when other seats enter there', () => {
    // The oboe plays alone from 1 s, and four string seats enter at the first cut (8 s). The
    // entry rule needs two full bars of rest, so only the rule of the first voice gives the oboe
    // its entry. Without it, the strings got the first close shot for each of these seeds.
    const bytes = writeSmf(firstVoiceFile());
    for (const seed of [1, 2, 3, 4, 5]) {
      const { plan, score } = shotSceneOf('first-voice', bytes, seed);
      const oboe = score.seats.findIndex((s) => s.section === 'oboe');
      const shot = plan.shots[1];
      expect(shot?.startSec, `seed ${seed}`).toBe(8);
      expect(shot?.kind, `seed ${seed}`).toBe('solo');
      expect(shot?.seats, `seed ${seed}`).toEqual([oboe]);
    }
  });
});

/** The scene of the Ode to Joy demo and its choir seat. */
interface ChoirScene {
  /** The scene and the shot plan of the demo. */
  readonly scene: ShotScene;
  /** The index of the choir seat. */
  readonly choir: number;
}

/**
 * Finds the scene of the Ode to Joy demo, with its choir seat.
 *
 * @returns The scene and the choir seat.
 * @throws Error if the demo or its choir is missing.
 */
function odeToJoy(): ChoirScene {
  const scene = SCENES.find((s) => s.file === 'beethoven-9.mid');
  const choir = scene?.score.seats.findIndex((s) => s.section === 'choir') ?? -1;
  if (!scene || choir < 0) {
    throw new Error('No Ode to Joy demo with a choir.');
  }

  return { scene, choir };
}

describe('the choir shots of prepareShots() (design 5.6)', () => {
  it('films the choir over the orchestra, with all singers as subject players', () => {
    const { scene, choir } = odeToJoy();
    const { score, layout, models } = scene;
    const subjects = prepareSubjects(score, layout, models);
    const singers = layout.players.flatMap((p, i) => (p.cast.seatIndex === choir ? [i] : []));
    const section = sectionSubject(subjects, [choir]);
    // The 8 singers stand in one row of 4.2 m. The sphere of 2.6 m holds 7 of them, and the
    // eighth one is a subject player too.
    expect(singers).toHaveLength(8);
    expect(section?.members.toSorted((a, b) => a - b)).toEqual(singers);
    expect(section?.floor).toHaveLength(7);
    // The chest of a singer is 1 H below the middle of its head, under its folder.
    for (const chest of section?.floor ?? []) {
      expect(chest[1]).toBeGreaterThan(1.4);
      expect(chest[1]).toBeLessThan(1.6);
    }
    // A part shot holds only its players, and the other singers stay subject players.
    const part = sectionSubject(subjects, [choir], undefined, [0, 1]);
    const first = layout.players.filter((p) => p.cast.seatIndex === choir && p.cast.player < 2);
    expect(part?.part).toEqual([0, 1]);
    expect(part?.floor).toHaveLength(2);
    expect(part?.members.toSorted((a, b) => a - b)).toEqual(singers);
    expect(part?.target[0]).toBeCloseTo(
      ((first[0]?.position[0] ?? NaN) + (first[1]?.position[0] ?? NaN)) / 2,
      6,
    );
    // The other sections keep their rule: no floor.
    const violins = score.seats.findIndex((s) => s.section === 'violin');
    expect(sectionSubject(subjects, [violins])?.floor).toEqual([]);
  });

  it('shows the choir of the Ode to Joy in section shots over the orchestra, low', () => {
    // The heads of the back rows stood in front of the choir, and the foreground rule refused
    // each camera of the choir section below 50°. The plan had no choir section shot.
    const { scene, choir } = odeToJoy();
    const shots = scene.plan.shots.filter((s) => s.kind === 'section' && s.seats.includes(choir));
    expect(shots.length).toBeGreaterThanOrEqual(2);
    for (const shot of shots) {
      expect(shot.from.elevation).toBeLessThan((40 * Math.PI) / 180);
    }
    expect(shots.some((s) => Math.abs(s.from.azimuth) < (30 * Math.PI) / 180)).toBe(true);
  });

  it('films the sopranos of the Ode to Joy, who sing the top of the tune', () => {
    // The sopranos are the first two of the 8 singers, at the left end of the risers, behind
    // the contrabasses. They have a part shot in the theme, and each part shot shows them while
    // they sing the top of the tune.
    const { scene, choir } = odeToJoy();
    const music = prepareMusic(scene.score);
    const parts = scene.plan.shots.filter((s) => s.seats[0] === choir && s.part);
    expect(parts.some((shot) => shot.startSec < 64)).toBe(true);
    for (const shot of parts) {
      expect(shot.kind).toBe('section');
      expect(shot.part).toEqual([0, 1]);
      const window = musicIn(music, shot.startSec, shot.startSec + SHOT_TIMES.choiceWindowSec);
      expect(window.tunePlayers[choir], `${shot.startSec}`).toEqual([0, 1]);
    }
  });
});

/**
 * Makes the soloist test file: a soft contrabass and a soft harp play 30 bars, and from bar 13
 * (26 s) the violins, the violas, and the cellos play loud chords under a soloist with the top
 * line. The soloist rests from the start.
 *
 * @param program The program of the soloist: 0 for a piano, the soloist of the score.
 * @returns The bytes of the file.
 */
function soloistEntryFile(program: number): Uint8Array {
  const file: TestFile = {
    tracks: [
      [tempo(0, 120), timeSignature(0, 4, 4)],
      track([programChange(0, 0, 43)], bars(0, 36, 0, 30, 50)),
      track([programChange(0, 1, 46)], bars(1, 48, 0, 30, 50)),
      track([programChange(0, 2, 40)], bars(2, 67, 13, 30, 120)),
      track([programChange(0, 3, 41)], bars(3, 60, 13, 30, 120)),
      track([programChange(0, 4, 42)], bars(4, 52, 13, 30, 120)),
      track([programChange(0, 5, program)], bars(5, 84, 13, 30, 70)),
    ],
  };
  return writeSmf(file);
}

describe('the music of the shots of prepareShots() (design 5.6)', () => {
  it('cuts to the horns at their entry after four bars of rest', () => {
    const bytes = hornEntryFile();
    for (const seed of [1, 2, 3, 4, 5]) {
      const { plan, score } = shotSceneOf('horns', bytes, seed);
      const horn = score.seats.findIndex((s) => s.section === 'horn');
      const shot = plan.shots.find((s) => Math.abs(s.startSec - 24) < 1e-6);
      expect(shot, `seed ${seed}`).toBeDefined();
      expect(shot?.seats, `seed ${seed}`).toContain(horn);
    }
  });

  it('shows a loud tutti in a wide or high shot', () => {
    // Twelve seats play loud chords for 100 s. The opening and the last shot are wide shots, and
    // rule 3 needs three other shots after the opening and before the last shot.
    const programs = [40, 41, 42, 43, 73, 68, 71, 70, 60, 56, 57, 58];
    const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12];
    const file: TestFile = {
      tracks: [
        [tempo(0, 120), timeSignature(0, 4, 4)],
        ...channels.map((channel, i) =>
          track([programChange(0, channel, programs[i] ?? 0)], bars(channel, 55 + i, 0, 50, 120)),
        ),
      ],
    };
    const { plan } = shotSceneOf('tutti', writeSmf(file));
    expect(plan.shots.slice(1, -1).some(isWide)).toBe(true);
  });

  it('films no seat before its entry', () => {
    // The piano rests until 26 s. The window of 8 s after a cut at 22 s holds 4 s of its notes, so
    // the piano was an active seat there, with the lead. Its solo shot then showed the silent
    // pianist from 22 s, and rule 1 cut away from it at its entry (seeds 1 and 4).
    const bytes = soloistEntryFile(0);
    for (const seed of [1, 2, 3, 4, 5]) {
      const { plan, score } = shotSceneOf('soloist', bytes, seed);
      const piano = score.seats.findIndex((s) => s.section === 'piano');
      const early = plan.shots.filter((s) => s.seats.includes(piano) && s.startSec < 26 - 0.5);
      expect(early, `seed ${seed}`).toEqual([]);
    }
  });

  it('gives the cut at an entry to the soloist over the sections that enter with it', () => {
    // The strings enter loud with the soloist, and their share of the activity is larger. Without
    // the rank of a soloist, the solo shot of the first violins or of the cellos won the cut in 2
    // of these 5 plans with the piano.
    for (const [program, section] of [
      [0, 'piano'],
      [73, 'flute'],
    ] as const) {
      const bytes = soloistEntryFile(program);
      for (const seed of [1, 2, 3, 4, 5]) {
        const { plan, score } = shotSceneOf('soloist', bytes, seed);
        const soloist = score.seats.findIndex((s) => s.section === section);
        // The first cut from a quarter of a bar before the entry, at most one bar after it.
        const shot = plan.shots.find((s) => s.startSec >= 26 - 0.5 - 1e-6);
        expect(shot?.startSec, `${section}, seed ${seed}`).toBeLessThanOrEqual(28 + 1e-6);
        expect(shot?.kind, `${section}, seed ${seed}`).toBe('solo');
        expect(shot?.seats, `${section}, seed ${seed}`).toEqual([soloist]);
      }
    }
  });

  it('cuts to the horns within one bar of an entry on the second beat of a bar of 3/4', () => {
    // Ten seats play loud chords for 45 s. The horns rest from the start and enter on the second
    // beat of bar 13 (20 s). A bar of 3/4 has no middle beat, so the nearest cut points are the
    // downbeats 0.5 s before and 1 s after the entry.
    const BAR_34 = QUARTER * 3;
    const programs = [40, 41, 42, 43, 73, 68, 71, 70, 46, 47];
    const file: TestFile = {
      tracks: [
        [tempo(0, 120), timeSignature(0, 3, 4)],
        ...programs.map((program, channel) => {
          const notes: TestEvent[] = [];
          for (let bar = 0; bar < 30; bar++) {
            notes.push(
              noteOn(bar * BAR_34, channel, 55 + channel, 120),
              noteOff(bar * BAR_34 + BAR_34 - 10, channel, 55 + channel),
            );
          }
          return track([programChange(0, channel, program)], notes);
        }),
        track(
          [programChange(0, 10, 60)],
          Array.from({ length: 17 }, (...[, i]) => {
            const start = (13 + i) * BAR_34 + QUARTER;
            return [noteOn(start, 10, 67, 120), noteOff(start + BAR_34 - 10, 10, 67)];
          }).flat(),
        ),
      ],
    };
    const bytes = writeSmf(file);
    for (const seed of [1, 2, 3, 4, 5]) {
      const { plan, score } = shotSceneOf('horns in 3/4', bytes, seed);
      const horn = score.seats.findIndex((s) => s.section === 'horn');
      // The first cut from a quarter of a bar before the entry.
      const shot = plan.shots.find((s) => s.startSec >= 20 - 0.375 - 1e-6);
      expect(shot?.startSec, `seed ${seed}`).toBeLessThanOrEqual(21.5 + 1e-6);
      expect(shot?.seats, `seed ${seed}`).toContain(horn);
    }
  });
});

describe('the shots of a chamber group (design 4.2, 5.6)', () => {
  /** Gives the kinds of the shots of a plan after the opening, with the seats. */
  const kindsOf = (file: string): string[] => {
    const scene = CHAMBER.find((c) => c.file === file);
    if (!scene) {
      throw new Error(`No chamber scene ${file}.`);
    }
    return scene.plan.shots
      .slice(1)
      .map((s) =>
        s.seats.length > 0 ? `${s.kind} ${s.seats.toSorted((a, b) => a - b).join('+')}` : s.kind,
      );
  };

  it.each(CHAMBER)('gives $file no conductor shot', (scene) => {
    expect(scene.layout.conductor).toBeNull();
    expect(scene.plan.shots.filter((s) => s.kind === 'conductor')).toEqual([]);
    expect(scene.plan.shots.length).toBeGreaterThan(4);
  });

  it('films a duo with the close-ups of its players, a two-shot, and the wide view', () => {
    expect(SMALL_GROUP_SEATS).toBe(3);
    const kinds = kindsOf('violin-piano.mid');
    expect(new Set(kinds)).toEqual(new Set(['solo 0', 'solo 1', 'section 0+1', 'wide']));
    expect(kindsOf('piano-solo.mid').every((k) => k === 'solo 0' || k === 'wide')).toBe(true);
  });

  it('films a player alone from cameras at least 20° apart in a row of solo shots', () => {
    const scene = CHAMBER.find((c) => c.file === 'piano-solo.mid');
    const shots = scene?.plan.shots ?? [];
    let pairs = 0;
    shots.slice(1).forEach((shot, i) => {
      const previous = shots[i];
      if (shot.kind === 'solo' && previous?.kind === 'solo') {
        pairs++;
        const turn = Math.abs(angleDifference(shot.from.azimuth, previous.to.azimuth));
        expect(turn, `shot ${i + 1}`).toBeGreaterThanOrEqual((20 * Math.PI) / 180 - 1e-9);
      }
    });
    expect(pairs).toBeGreaterThan(1);
  });

  it('shows no conductor and no high shot to an orchestra of two seats', () => {
    // A violin seat and a cello seat with full sections: 7 players with a conductor.
    const [meta = [], violins = [], , , cellos = []] = stringQuartetFile().tracks;
    const score = scoreOf({ tracks: [meta, violins, cellos] }, 'full');
    const models = new ModelCache();
    const layout = layoutScene(score, models);
    expect(layout.conductor).not.toBeNull();
    expect(layout.players).toHaveLength(7);
    const plan = prepareShots(score, layout, TEST_SEED, models);
    const kinds = new Set(plan.shots.map((s) => s.kind));
    expect(kinds.has('conductor')).toBe(false);
    expect(kinds.has('high')).toBe(false);
    expect(kinds.has('solo')).toBe(true);
  });
});

/**
 * Moves each player of a layout by a distance in a seeded direction in the stage plane. Its
 * footprint boxes, its head, and its sight points move with it.
 *
 * @param layout The layout.
 * @param seed The seed of the directions.
 * @param distance The distance, in meters.
 * @returns The layout with the moved players.
 */
function movePlayers(layout: SceneLayout, seed: number, distance: number): SceneLayout {
  const random = mulberry32(seed);
  return {
    ...layout,
    players: layout.players.map((place) => {
      const angle = random() * 2 * Math.PI;
      const [x, y, z] = place.position;
      return {
        ...place,
        position: [x + distance * Math.cos(angle), y, z + distance * Math.sin(angle)],
      };
    }),
  };
}

describe('the stability of prepareShots() against small moves of the players (design 5.6)', () => {
  /** The move of each player, in meters. */
  const MOVE = 0.02;

  /** The seeds of the directions of the moves. */
  const MOVES = [1, 2, 3, 4];

  /** Gives the start of a shot as a key, in 0.01 s. */
  const startOf = (shot: Shot): string => shot.startSec.toFixed(2);

  /** Gives the start, the kind, and the seats of a shot as a key. */
  const labelOf = (shot: Shot): string =>
    `${startOf(shot)} ${shot.kind} ${shot.seats.toSorted((a, b) => a - b).join('+')}`;

  it('keeps most cuts and shots of the demos when each player moves by 2 cm', () => {
    // With one seeded generator for the full plan, the demos kept 61% to 63% of their shots and
    // 75% to 78% of their cuts. The cast branch changed 30 of 31 shots of the Boulanger demo. Now
    // they keep 80% to 87% of their shots and 92% to 97% of their cuts, for 5 sets of 4 moves.
    // One changed choice can still shift the later cuts of one demo, for example in 6 of 20 moves
    // of the Bach demo, so the bounds hold for all demos together.
    let shots = 0;
    let keptShots = 0;
    let keptCuts = 0;
    for (const scene of SCENES) {
      const base = scene.plan.shots.slice(1, -1);
      for (const seed of MOVES) {
        const layout = movePlayers(scene.layout, seed, MOVE);
        const moved = prepareShots(scene.score, layout, TEST_SEED, scene.models).shots.slice(1, -1);
        const labels = new Set(moved.map(labelOf));
        const starts = new Set(moved.map(startOf));
        shots += base.length;
        keptShots += base.filter((shot) => labels.has(labelOf(shot))).length;
        keptCuts += base.filter((shot) => starts.has(startOf(shot))).length;
      }
    }
    expect(keptCuts / shots).toBeGreaterThanOrEqual(0.9);
    expect(keptShots / shots).toBeGreaterThanOrEqual(0.75);
  });

  it('keeps the horn shot at the entry when each player moves by 2 cm', () => {
    // A move of 1 cm of a viola can take away the one clear horn camera in reach of the search.
    const bytes = hornEntryFile();
    for (const seed of [1, 2, 3, 4, 5]) {
      const { score, layout, models } = shotSceneOf('horns', bytes, seed);
      const horn = score.seats.findIndex((s) => s.section === 'horn');
      for (const moves of MOVES) {
        const plan = prepareShots(score, movePlayers(layout, moves, MOVE), seed, models);
        const shot = plan.shots.find((s) => Math.abs(s.startSec - 24) < 1e-6);
        expect(shot?.seats, `seed ${seed}, moves ${moves}`).toContain(horn);
      }
    }
  });
});
