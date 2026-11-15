import { VIEW_OFFSET_Y } from './view.ts';
import { clamp01 } from '../math.ts';

/**
 * The part of the canvas that shows the frame of the camera, in CSS pixels (design 4.5, camera).
 * The frame is the image of the field of view at the aspect of the canvas. The canvas always
 * fills the window, and the camera also renders the area outside the frame, so the scene
 * continues under the bar and the drawer.
 */
export interface ViewFrame {
  /** The size of the frame divided by the size of the canvas: 1, or less to fit a free area. */
  readonly scale: number;
  /** The middle of the frame, from the left edge of the canvas. */
  readonly x: number;
  /** The middle of the frame, from the top edge of the canvas. */
  readonly y: number;
}

/** The parts of the page over the canvas that move the frame (design 2.8, 4.5). */
export interface FrameCover {
  /** The width that the open drawer of a wide window covers at the right, or 0. */
  readonly right: number;
  /** The move of the frame up above the sheet of a phone, or 0. */
  readonly lift: number;
}

/** A box on the canvas, in CSS pixels. */
export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The height that the bar covers at the bottom of the canvas, in CSS pixels (design 2.8). */
export const BAR_COVER = 2 * VIEW_OFFSET_Y;

/**
 * The width that the open drawer of a wide window covers at the right, in CSS pixels: the panel of
 * 340 px and its gap of 12 px (design 2.8).
 */
export const DRAWER_COVER = 352;

/**
 * The share of the height of the window that the sheet of a phone moves the frame up, less
 * {@link SHEET_LIFT.below} (design 2.8).
 */
const SHEET_LIFT = { share: 0.3, below: 20 } as const;

/**
 * Calculates the frame of the camera on the canvas (design 4.5, camera). The middle of the frame
 * is the middle of the free area: above the bar, and left of the open drawer of a wide window.
 * The sheet of a phone moves it up. A close shot fits its full frame into the free area (design
 * 5.6), so that the bar and the drawer cover no part of it.
 *
 * @param width The width of the canvas, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 * @param cover The parts of the page over the canvas.
 * @param fit The share of the fit of a close shot, from 0 (none) to 1 (full).
 * @returns The frame.
 */
export function viewFrame(width: number, height: number, cover: FrameCover, fit = 0): ViewFrame {
  const freeWidth = width - cover.right;
  const freeHeight = height - BAR_COVER;
  const fitted = Math.min(1, freeWidth / width, freeHeight / height);
  return {
    scale: 1 - fit * (1 - fitted),
    x: freeWidth / 2,
    y: freeHeight / 2 - cover.lift,
  };
}

/** The space between the stage and the play button of the first screen, in CSS pixels. */
const FIRST_SCREEN_MARGIN = 12;

/**
 * Gives the move of the frame above the sheet of a phone (design 2.8): 30% of the height less
 * 20 px, so that the stage shows between the title and the sheet.
 *
 * @param height The height of the window, in CSS pixels.
 * @returns The move up, in CSS pixels.
 */
export function sheetLift(height: number): number {
  return SHEET_LIFT.share * height - SHEET_LIFT.below;
}

/**
 * Gives the arguments of `PerspectiveCamera.setViewOffset()` that show a frame on the canvas.
 * The full image of the camera is the frame, and the sub-view is the canvas.
 *
 * @param width The width of the canvas, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 * @param frame The frame.
 * @returns The full width, the full height, the x and the y of the sub-view, its width, and its
 *   height.
 */
export function viewOffset(
  width: number,
  height: number,
  frame: ViewFrame,
): [number, number, number, number, number, number] {
  const fullWidth = width * frame.scale;
  const fullHeight = height * frame.scale;
  return [fullWidth, fullHeight, fullWidth / 2 - frame.x, fullHeight / 2 - frame.y, width, height];
}

/**
 * Gives the box of the stage on the canvas from its box in the units of the view of the full
 * canvas (from -1 to 1, y up).
 *
 * @param box The box in the units of the view: left, bottom, right, and top.
 * @param width The width of the canvas, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 * @param frame The frame.
 * @returns The box on the canvas.
 */
export function boxOnCanvas(
  box: ScreenBox,
  width: number,
  height: number,
  frame: ViewFrame,
): ScreenBox {
  const halfWidth = (width * frame.scale) / 2;
  const halfHeight = (height * frame.scale) / 2;
  return {
    left: frame.x + box.left * halfWidth,
    right: frame.x + box.right * halfWidth,
    top: frame.y - box.top * halfHeight,
    bottom: frame.y - box.bottom * halfHeight,
  };
}

/** The scale of the frame that keeps the stage clear of the play button, and its fixed point. */
export interface FrameClear {
  /** The factor of the scale of the frame, from 0 to 1. */
  readonly factor: number;
  /** The point of the canvas that does not move, in CSS pixels. */
  readonly x: number;
  readonly y: number;
}

/** The clear of no play button: the frame does not change. */
export const NO_CLEAR: FrameClear = { factor: 1, x: 0, y: 0 };

/**
 * Calculates the scale of the frame that keeps the stage clear of the play button of the first
 * screen (design 2.2, 2.8). Below the stage, the stage shrinks toward its top, so that its front
 * edge stands 12 px above the load ring. Right of the stage, as on a short and wide screen, the
 * stage shrinks toward its left edge, so that it ends 12 px left of the ring. A stage that is
 * clear already keeps its size.
 *
 * @param stage The box of the stage on the canvas, in the frame with no clear.
 * @param ring The box of the load ring around the play button, in CSS pixels.
 * @returns The clear.
 */
export function clearFirstScreen(stage: ScreenBox, ring: ScreenBox): FrameClear {
  const middle = (stage.left + stage.right) / 2;
  const height = (stage.top + stage.bottom) / 2;
  if (ring.left > (middle + stage.right) / 2) {
    const room = ring.left - FIRST_SCREEN_MARGIN - stage.left;
    const factor = clamp01(room / (stage.right - stage.left));
    return { factor, x: stage.left, y: height };
  }
  const room = ring.top - FIRST_SCREEN_MARGIN - stage.top;
  const factor = clamp01(room / (stage.bottom - stage.top));
  return { factor, x: middle, y: stage.top };
}

/**
 * Applies a clear to a frame: it scales the frame by the factor around the fixed point.
 *
 * @param frame The frame.
 * @param clear The clear.
 * @returns The frame with the clear.
 */
export function clearedFrame(frame: ViewFrame, clear: FrameClear): ViewFrame {
  const { factor, x, y } = clear;
  return {
    scale: frame.scale * factor,
    x: x + (frame.x - x) * factor,
    y: y + (frame.y - y) * factor,
  };
}
