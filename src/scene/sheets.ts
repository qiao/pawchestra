import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, SRGBColorSpace } from 'three';
import type { MeshStandardMaterial } from 'three';

import { SCENE_COLORS } from '../models/colors.ts';
import { FINISH_ORDER } from '../models/mesh.ts';

/**
 * The printed music on the sheets of the stands and on the score of the conductor (design 4.5):
 * staff lines, bar lines, and note heads in one small canvas texture that the page draws at
 * start, so the close shots show music in place of blank paper. The texture holds no file.
 */
const SHEET_PRINT = {
  /** The width and the height of the texture, in pixels. */
  size: 256,
  /** The margin of the page on each side, as a part of the size. */
  margin: 0.09,
  /** The number of staves on a page. */
  staves: 6,
  /** The distance between two lines of a staff, in pixels. */
  lineGap: 4,
  /** The number of bars on each staff. */
  bars: 4,
  /** The number of notes in each bar. */
  notes: 4,
  /** The color of the ink, in sRGB. The paper color comes from the faces of the sheet. */
  ink: '#3b3631',
  /** The color of the paper in the texture: white, so the sheet keeps its face color. */
  paper: '#ffffff',
  /** The seed of the note heights, so each page load draws the same music. */
  seed: 7,
} as const;

/** The texture of {@link SHEET_PRINT}, made on its first use. */
let printTexture: CanvasTexture | null = null;

/**
 * Gives the next value of a small linear congruential generator.
 *
 * @param state The state, which the call changes.
 * @param state.value The current value.
 * @returns A number from 0 to 1.
 */
function nextRandom(state: { value: number }): number {
  state.value = (state.value * 1664525 + 1013904223) % 4294967296;
  return state.value / 4294967296;
}

/**
 * Draws the printed music of {@link SHEET_PRINT} into a canvas: staves of five lines, bar lines,
 * and filled note heads with stems.
 *
 * @param context The 2D context of a canvas of the size of the texture.
 */
function drawPrint(context: CanvasRenderingContext2D): void {
  const p = SHEET_PRINT;
  const margin = Math.round(p.size * p.margin);
  const width = p.size - 2 * margin;
  const random = { value: p.seed };
  context.fillStyle = p.paper;
  context.fillRect(0, 0, p.size, p.size);
  context.fillStyle = p.ink;
  context.strokeStyle = p.ink;
  context.lineWidth = 1;

  const staffStep = (p.size - 2 * margin) / p.staves;
  for (let s = 0; s < p.staves; s++) {
    const top = Math.round(margin + s * staffStep + staffStep / 2 - 2 * p.lineGap);
    for (let line = 0; line < 5; line++) {
      context.fillRect(margin, top + line * p.lineGap, width, 1);
    }
    const barWidth = width / p.bars;
    for (let bar = 0; bar <= p.bars; bar++) {
      context.fillRect(Math.round(margin + bar * barWidth), top, 1, 4 * p.lineGap + 1);
    }
    for (let bar = 0; bar < p.bars; bar++) {
      for (let n = 0; n < p.notes; n++) {
        const x = margin + bar * barWidth + ((n + 0.75) * barWidth) / (p.notes + 0.5);
        // A step is half the gap of the lines: a line or a space, from below the staff to above it.
        const step = Math.floor(nextRandom(random) * 11) - 1;
        const y = top + 4 * p.lineGap - (step * p.lineGap) / 2 + 0.5;
        context.beginPath();
        context.ellipse(x, y, 2.4, 1.7, -0.35, 0, 2 * Math.PI);
        context.fill();
        const up = step < 4;
        const stemX = up ? x + 2 : x - 2;
        context.fillRect(Math.round(stemX), up ? y - 3 * p.lineGap : y, 1, 3 * p.lineGap);
      }
    }
  }
}

/**
 * Gives the texture of the printed music, made on its first use. With no document, as in Node,
 * there is no texture.
 *
 * @returns The texture, or `null`.
 */
function sheetTexture(): CanvasTexture | null {
  if (printTexture) {
    return printTexture;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SHEET_PRINT.size;
  canvas.height = SHEET_PRINT.size;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  drawPrint(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // The music takes the texture points of the sheets, `uv1`. The finish table reads `uv`.
  texture.channel = 1;
  // The lines fade to gray at a distance with the mip levels, so they make no moiré.
  texture.anisotropy = 4;
  printTexture = texture;
  return texture;
}

/** The texture points of the corners of the two triangles of a sheet. */
const SHEET_UVS = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1] as const;

/** The corners of the two triangles of a sheet, as indices of its four corners. */
const SHEET_TRIANGLES = [0, 1, 2, 0, 2, 3] as const;

/**
 * Creates the mesh of the printed music on the sheets of a layout (design 4.5). Each sheet lies
 * on the white sheet of its stand or on a page of the score, and a polygon offset draws it in
 * front of that face. The material is a copy of the shared material with the texture, so the
 * light, the pool, and the finish stay.
 *
 * @param corners The corners of each sheet, from `buildSheets()` of `models/stage.ts`.
 * @param shared The shared material (`createMaterials()`).
 * @returns The mesh, or `null` with no sheet or no texture.
 */
export function createSheetMesh(corners: Float32Array, shared: MeshStandardMaterial): Mesh | null {
  const texture = sheetTexture();
  const sheets = corners.length / 12;
  if (!texture || sheets === 0) {
    return null;
  }

  const positions = new Float32Array(sheets * 18);
  const normals = new Float32Array(sheets * 18);
  const colors = new Float32Array(sheets * 18);
  const uv = new Float32Array(sheets * 12);
  const uv1 = new Float32Array(sheets * 12);
  const finish = (FINISH_ORDER.indexOf('matte') + 0.5) / FINISH_ORDER.length;
  for (let s = 0; s < sheets; s++) {
    const at = (k: number, axis: number): number => corners[s * 12 + k * 3 + axis] ?? 0;
    const e1 = [0, 1, 2].map((axis) => at(1, axis) - at(0, axis));
    const e2 = [0, 1, 2].map((axis) => at(3, axis) - at(0, axis));
    const [ax = 0, ay = 0, az = 0] = e1;
    const [bx = 0, by = 0, bz = 0] = e2;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz) || 1;
    for (const [i, k] of SHEET_TRIANGLES.entries()) {
      const v = s * 6 + i;
      for (let axis = 0; axis < 3; axis++) {
        positions[v * 3 + axis] = at(k, axis);
        colors[v * 3 + axis] = SCENE_COLORS.sheet[axis] ?? 1;
      }
      normals[v * 3] = nx / length;
      normals[v * 3 + 1] = ny / length;
      normals[v * 3 + 2] = nz / length;
      uv[v * 2] = finish;
      uv[v * 2 + 1] = 0.5;
      uv1[v * 2] = SHEET_UVS[i * 2] ?? 0;
      uv1[v * 2 + 1] = SHEET_UVS[i * 2 + 1] ?? 0;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('uv1', new BufferAttribute(uv1, 2));

  const material = shared.clone();
  material.map = texture;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -4;
  material.onBeforeCompile = (shader, renderer) => {
    shared.onBeforeCompile(shader, renderer);
  };
  material.customProgramCacheKey = () => `${shared.customProgramCacheKey()} sheet`;
  const mesh = new Mesh(geometry, material);
  mesh.name = 'sheets';
  mesh.receiveShadow = true;
  return mesh;
}
