import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  GALLERY_FOV_DEG,
  closeView,
  gallerySupport,
  galleryTransport,
} from '../src/gallery/items.ts';
import { parseTestNotes } from '../src/gallery/notes.ts';
import {
  LINEUP,
  LINEUP_ELEVATION,
  ROLE_VIEWS,
  SERVER_PORT,
  baseGridLabels,
  closeViewPath,
  closeViewsArgs,
  lineupArgs,
  lineupCamera,
  lineupPath,
  roleOf,
} from './close-views.ts';
import type { RowBox } from './close-views.ts';

describe('closeViewPath', () => {
  it('shows the animal of each role alone and close, at the camera of each view', () => {
    for (const role of Object.values(ROLE_VIEWS)) {
      for (const view of role.views) {
        for (const moment of role.moments) {
          const search = new URLSearchParams(closeViewPath(role, view, moment).split('?')[1]);
          expect(search.get('only')).toBe(role.species);
          const close = closeView(search);
          expect(close.zoom).toBeGreaterThanOrEqual(1);
          expect(close.azimuth).toBe(view.azimuth);
          expect(close.elevation).toBe(view.elevation ?? role.camera.elevation);
          // A camera around the body takes the line and the target from the body.
          expect(close.body).toBe(role.camera.kind === 'body');
          // The rest pose is the transport before the first play (design 5.2).
          expect(galleryTransport(search).playing).toBe(!moment.rest);
        }
      }
    }
  });

  it('shows the conductor from the front, the right side, and the back at the four beats of a bar', () => {
    const { views, moments } = ROLE_VIEWS.conductor;
    expect(views.map((view) => view.azimuth)).toEqual([0, 90, 180]);
    const beats = moments.filter((moment) => moment.name.startsWith('beat-'));
    // The test notes of the gallery are 4/4 at 120 BPM: a beat is 0.5 s.
    expect(beats.map((moment) => moment.time)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('shows the pianist around its body from four sides and the paws on the keys', () => {
    const { views, moments, notes, camera } = ROLE_VIEWS.pianist;
    expect(camera.kind).toBe('body');
    const at = (name: string): number | undefined =>
      views.find((view) => view.name === name)?.azimuth;
    expect([at('front'), at('right'), at('back'), at('left')]).toEqual([0, 90, 180, -90]);
    // The view of the keys is on the left side, turned toward the front. The case and the lid
    // of the piano then stay beside the left paw.
    const keys = views.find((view) => view.name === 'keys');
    expect(keys?.azimuth).toBeGreaterThan(-90);
    expect(keys?.azimuth).toBeLessThan(-45);
    const result = parseTestNotes(notes ?? '');
    if (!result.ok) {
      throw new Error(`The test notes of the pianist fail on line ${result.line}.`);
    }
    const parsed = result.notes;
    const chord = moments.find((moment) => moment.name === 'chord');
    const sounding = parsed.filter(
      (note) => note.start <= (chord?.time ?? -1) && (chord?.time ?? -1) < note.start + note.length,
    );
    // Three keys below middle C and three keys above it.
    expect(sounding.filter((note) => note.key < 60)).toHaveLength(3);
    expect(sounding.filter((note) => note.key > 60)).toHaveLength(3);
    expect(moments.some((moment) => moment.rest)).toBe(true);
  });

  it('shows the violinist at the frog and the tip of a whole bow, at a crossing, at rest, and standing', () => {
    const { moments, notes } = ROLE_VIEWS.violinist;
    const result = parseTestNotes(notes ?? '');
    if (!result.ok) {
      throw new Error(`The test notes of the violinist fail on line ${result.line}.`);
    }
    const whole = result.notes[0];
    const timeOf = (name: string): number => moments.find((m) => m.name === name)?.time ?? NaN;
    // The frog is near the start of the long note, and the tip near its end.
    expect(timeOf('frog') - (whole?.start ?? NaN)).toBeLessThan(0.25 * (whole?.length ?? 0));
    expect((whole?.start ?? NaN) + (whole?.length ?? 0) - timeOf('tip')).toBeLessThan(
      0.25 * (whole?.length ?? 0),
    );
    // The crossing is at the start of a note on another string, after a note on the G string.
    const crossing = result.notes.find((note) => Math.abs(note.start - timeOf('crossing')) < 1e-9);
    const before = result.notes.find((note) => note.start + note.length === crossing?.start);
    expect(crossing && before && Math.abs(crossing.key - before.key)).toBeGreaterThan(12);
    expect(moments.some((moment) => moment.rest)).toBe(true);
    expect(moments.some((moment) => moment.stand)).toBe(true);
    const stand = moments.find((moment) => moment.stand);
    const search = new URLSearchParams(
      closeViewPath(
        ROLE_VIEWS.violinist,
        { name: 'front', azimuth: 0 },
        stand ?? moments[0]!,
      ).split('?')[1],
    );
    expect(search.has('stand')).toBe(true);
  });

  it('reads the role of the command line', () => {
    expect(roleOf('violinist')).toBe('violinist');
    expect(roleOf('fox-violinist')).toBe('fox-violinist');
    expect(roleOf('pianist')).toBe('pianist');
    expect(roleOf('conductor')).toBe('conductor');
    expect(roleOf('drummer')).toBeNull();
  });
});

describe('closeViewsArgs', () => {
  it('reads the role, the folder, the URL of a running site, and the commit to compare', () => {
    const camera = {
      zoom: null,
      elevation: null,
      scale: 1,
      pairs: null,
      crop: null,
      glb: null,
      holds: null,
      probes: null,
      target: null,
    };
    expect(closeViewsArgs(['violinist', 'out'])).toMatchObject({
      role: 'violinist',
      out: 'out',
      url: null,
      base: null,
      ...camera,
    });
    expect(
      closeViewsArgs(['pianist', 'out', '--base', 'main', '--url', 'http://localhost:5199/']),
    ).toMatchObject({
      role: 'pianist',
      out: 'out',
      url: 'http://localhost:5199/',
      base: 'main',
      ...camera,
    });
  });

  it('refuses a wrong role, no folder, and an option with no value', () => {
    expect(closeViewsArgs(['drummer', 'out'])).toBeNull();
    expect(closeViewsArgs(['violinist', '--base', 'main'])).toBeNull();
    expect(closeViewsArgs(['violinist', 'out', '--base'])).toBeNull();
    expect(closeViewsArgs(['violinist', 'out', '--url', '--base', 'main'])).toBeNull();
  });
});

describe('baseGridLabels', () => {
  it('names the commit in each cell of the upper grid and the working tree in the lower grid', () => {
    expect(baseGridLabels(['frog, front', 'frog, left'], 'main (cc83899c)')).toEqual([
      'main (cc83899c): frog, front',
      'main (cc83899c): frog, left',
      'working tree: frog, front',
      'working tree: frog, left',
    ]);
  });
});

describe('SERVER_PORT', () => {
  it('starts each server above 4290, so that Vite never moves up to 4182, the port of the merge', () => {
    expect(SERVER_PORT).toBeGreaterThan(4290);
  });
});

describe('lineupCamera', () => {
  /**
   * Projects a point with the camera of a lineup, as the gallery places it from the front.
   *
   * @param boxes The boxes of the trees.
   * @param point The point, in meters.
   * @returns The point in the image, from -1 to 1 on each axis inside the image.
   */
  function project(boxes: readonly RowBox[], point: Vector3): Vector3 {
    const aspect = LINEUP.width / LINEUP.height;
    const { target, distance } = lineupCamera(boxes, aspect);
    const camera = new PerspectiveCamera(GALLERY_FOV_DEG, aspect, 0.1, 100);
    const elevation = (LINEUP_ELEVATION * Math.PI) / 180;
    camera.position.set(0, target + distance * Math.sin(elevation), distance * Math.cos(elevation));
    camera.lookAt(0, target, 0);
    camera.updateMatrixWorld();
    return point.clone().project(camera);
  }

  it('shows the tallest model and the widest row of all trees whole, and fills the image', () => {
    const wide: RowBox[] = [
      { halfWidth: 3, halfDepth: 0.3, height: 1.5 },
      { halfWidth: 3.4, halfDepth: 0.35, height: 1.9 },
    ];
    const tall: RowBox[] = [{ halfWidth: 0.4, halfDepth: 0.3, height: 1.9 }];
    for (const boxes of [wide, tall]) {
      const halfWidth = Math.max(...boxes.map((box) => box.halfWidth));
      let fill = 0;
      for (const x of [-halfWidth, halfWidth]) {
        for (const z of [-0.35, 0.35]) {
          for (const y of [0, 1.9]) {
            const p = project(boxes, new Vector3(x, y, z));
            expect(Math.abs(p.x)).toBeLessThan(1);
            expect(Math.abs(p.y)).toBeLessThan(1);
            fill = Math.max(fill, Math.abs(p.x), Math.abs(p.y));
          }
        }
      }
      expect(fill).toBeGreaterThan(0.85);
    }
    // The camera does not depend on the order of the trees.
    expect(lineupCamera(wide.toReversed(), 2)).toEqual(lineupCamera(wide, 2));
  });
});

describe('lineupPath', () => {
  it('shows the species standing in the rest pose, low, at a fixed camera or at the fit', () => {
    const fixed = new URLSearchParams(
      lineupPath(['rabbit', 'fox-red'], { target: 0.8, distance: 9.5 }).split('?')[1],
    );
    expect(fixed.get('only')).toBe('rabbit,fox-red');
    expect(gallerySupport(fixed, 'violin')).toBe('stand');
    expect(galleryTransport(fixed).playing).toBe(false);
    expect(closeView(fixed)).toMatchObject({
      target: 0.8,
      distance: 9.5,
      elevation: LINEUP_ELEVATION,
      azimuth: 0,
    });
    const fit = new URLSearchParams(lineupPath(['rabbit'], null).split('?')[1]);
    expect(closeView(fit).distance).toBeNull();
  });
});

describe('lineupArgs', () => {
  it('reads the species, the folder, the URL, and the commit, and refuses a wrong line', () => {
    expect(lineupArgs(['lineup', 'rabbit,fox-red', 'out', '--base', 'main'])).toEqual({
      species: ['rabbit', 'fox-red'],
      out: 'out',
      url: null,
      base: 'main',
    });
    expect(lineupArgs(['lineup', 'rabbit,unicorn', 'out'])).toBeNull();
    expect(lineupArgs(['lineup', 'rabbit'])).toBeNull();
    expect(lineupArgs(['lineup', 'rabbit', 'out', '--base'])).toBeNull();
    expect(lineupArgs(['violinist', 'out'])).toBeNull();
  });
});
