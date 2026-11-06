import type { WebGLRenderTarget } from 'three';

import { CINEMA_ASPECT } from '../shots/view.ts';

/**
 * A box on the canvas, in CSS pixels: the image of the camera, or the part of the canvas that
 * shows the scene (design 2.5, 4.5). Its aspect can differ from the aspect of the canvas.
 */
export interface FrameBox {
  /** The middle of the box, from the left edge of the canvas. */
  readonly x: number;
  /** The middle of the box, from the top edge of the canvas. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A part of a render target in texture coordinates, from 0 to 1, with y up. */
export interface UvRect {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}

/**
 * Gives the frame of Cinematic mode (design 2.5): the largest box of the aspect
 * {@link CINEMA_ASPECT} inside the canvas, at its middle. A canvas narrower than 21:9 gets bars at
 * the top and the bottom, and a wider canvas gets bars at the sides.
 *
 * @param width The width of the canvas, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 * @returns The box.
 */
export function letterbox(width: number, height: number): FrameBox {
  if (width / height > CINEMA_ASPECT) {
    return { x: width / 2, y: height / 2, width: height * CINEMA_ASPECT, height };
  }
  return { x: width / 2, y: height / 2, width, height: width / CINEMA_ASPECT };
}

/**
 * Mixes two boxes.
 *
 * @param from The box at the share 0.
 * @param to The box at the share 1.
 * @param share The share, from 0 to 1.
 * @returns The box between them.
 */
export function mixBox(from: FrameBox, to: FrameBox, share: number): FrameBox {
  return {
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    width: from.width + (to.width - from.width) * share,
    height: from.height + (to.height - from.height) * share,
  };
}

/**
 * Gives the part of a target that a box of the canvas covers, in texture coordinates. The target
 * has the aspect of the canvas.
 *
 * @param box The box, in CSS pixels.
 * @param width The width of the canvas, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 * @returns The part, with y up.
 */
export function uvRectOf(box: FrameBox, width: number, height: number): UvRect {
  return {
    left: (box.x - box.width / 2) / width,
    right: (box.x + box.width / 2) / width,
    bottom: 1 - (box.y + box.height / 2) / height,
    top: 1 - (box.y - box.height / 2) / height,
  };
}

/**
 * Limits the passes into a target to a part of the canvas (design 2.5): the scissor covers each
 * pixel that the part touches. With no part, the passes write the full target. The target keeps
 * its size, so a move of the bars allocates nothing.
 *
 * @param target The target, with the aspect of the canvas.
 * @param rect The part, or `null` for the full target.
 */
export function cropTarget(target: WebGLRenderTarget, rect: UvRect | null): void {
  if (!rect) {
    target.scissorTest = false;
    return;
  }
  const { width, height } = target;
  const left = Math.max(0, Math.floor(rect.left * width));
  const bottom = Math.max(0, Math.floor(rect.bottom * height));
  const right = Math.min(width, Math.ceil(rect.right * width));
  const top = Math.min(height, Math.ceil(rect.top * height));
  target.scissor.set(left, bottom, Math.max(1, right - left), Math.max(1, top - bottom));
  target.scissorTest = true;
}
