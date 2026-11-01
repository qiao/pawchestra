import { isClick } from './pick.ts';
import type { PointerPoint } from './pick.ts';

/**
 * The two camera modes (design 2.5). In `cinematic`, the shots of design 5.6 move the camera. In
 * `free`, the orbit controls move it.
 */
export type CameraMode = 'cinematic' | 'free';

/**
 * An event that can change the camera mode (design 2.5): a drag of more than 4 px, a wheel, or a
 * pinch on the stage; a click of 4 px or less; the "Cinematic camera" button or the key C;
 * "Reset view"; and a new piece or a new section size.
 */
export type CameraEvent = 'drag' | 'wheel' | 'pinch' | 'click' | 'toggle' | 'reset' | 'new-piece';

/**
 * Gives the camera mode after an event (design 2.5). A drag, a wheel, or a pinch changes to Free
 * from the current camera. A click keeps the mode. The toggle switches the mode. "Reset view"
 * changes to Free at the default view. A new piece keeps the mode.
 *
 * @param mode The mode before the event.
 * @param event The event.
 * @returns The mode after the event.
 */
export function nextMode(mode: CameraMode, event: CameraEvent): CameraMode {
  switch (event) {
    case 'drag':
    case 'wheel':
    case 'pinch':
    case 'reset':
      return 'free';
    case 'toggle':
      return mode === 'cinematic' ? 'free' : 'cinematic';
    case 'click':
    case 'new-piece':
      return mode;
  }
}

/**
 * Gives the event of a pointer motion on the stage (design 2.3, 2.5). A motion of more than 4 CSS
 * pixels from the press is a drag of the view, or a pinch with two or more pointers down.
 *
 * @param down The position of the press of the pointer.
 * @param now The current position of the pointer.
 * @param pointers The number of pointers that are down on the stage.
 * @returns The event, or `null` while the motion is still a click.
 */
export function motionEvent(
  down: PointerPoint,
  now: PointerPoint,
  pointers: number,
): CameraEvent | null {
  if (isClick(down, now)) {
    return null;
  }
  return pointers >= 2 ? 'pinch' : 'drag';
}
