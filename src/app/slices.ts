import type { Steps } from '../score/steps.ts';

/**
 * The time after which a slice of the main thread ends, in ms (design 7.2). Lighthouse multiplies
 * each task by 4 for a phone, and a task above 50 ms blocks. A slice ends after the first step past
 * this time, so a step of up to about 7 ms keeps each task below 10 ms on the development Mac.
 */
const SLICE_MS = 3;

/** The resolvers of the calls of {@link yieldToMain} that wait for the message of the channel. */
const waiting: (() => void)[] = [];

/** The channel of {@link yieldToMain} in a browser with no `scheduler.yield()`. */
let channel: MessagePort | null = null;

/**
 * Gives the port that ends a yield with no `scheduler.yield()`: a message of a `MessageChannel`
 * comes in a new task, with no minimum delay of a timer.
 *
 * @returns The port that sends the message.
 */
function yieldPort(): MessagePort {
  if (!channel) {
    const pair = new MessageChannel();
    pair.port1.addEventListener('message', () => {
      waiting.shift()?.();
    });
    pair.port1.start();
    channel = pair.port2;
  }
  return channel;
}

/**
 * Gives the main thread back to the browser for one turn, so that it can draw a frame and run the
 * input events. It uses `scheduler.yield()` where it exists, because the rest of the work then
 * keeps its place before the other tasks of the page.
 *
 * @returns A promise that resolves in a later task.
 */
export function yieldToMain(): Promise<void> {
  if ('scheduler' in globalThis && 'yield' in scheduler) {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    waiting.push(resolve);
    yieldPort().postMessage(null, []);
  });
}

/**
 * Waits for the GPU between two checks of a step that waits, such as a shader program that
 * compiles in parallel. The message of a `MessageChannel` comes in a new task with no minimum
 * delay of a timer, so the wait ends soon after the GPU. The other tasks of the page keep their
 * place before it.
 *
 * @returns A promise that resolves in a later task.
 */
function waitForGpu(): Promise<void> {
  return new Promise((resolve) => {
    waiting.push(resolve);
    yieldPort().postMessage(null, []);
  });
}

/**
 * Runs the steps of a calculation in slices of the main thread (design 7.2). A slice runs steps
 * until {@link SLICE_MS} pass, and then gives the main thread back. A step that waits for the GPU
 * gives it back at once, and a step that yields the promise of a load gives it back until the load
 * ends. The first slice starts in a later task.
 *
 * @param steps The steps.
 * @param live Tells if the result is still needed. A later selection makes it false, and the run
 *   then stops at the end of a slice. A stop ends the steps, so that their `finally` blocks free
 *   the resources of the step that did not finish, such as the targets of a bake.
 * @returns The result, or `null` if the run stopped.
 */
export async function runSliced<T>(steps: Steps<T>, live: () => boolean): Promise<T | null> {
  await yieldToMain();
  let start = performance.now();
  for (;;) {
    if (!live()) {
      // The steps give no result, so their end takes `null`.
      const stopped: Generator<unknown, T | null, undefined> = steps;
      stopped.return(null);
      return null;
    }
    const step = steps.next();
    if (step.done) {
      return step.value;
    }
    // The slices run one after the other: each await gives the main thread back.
    if (step.value === 'wait') {
      // oxlint-disable-next-line eslint/no-await-in-loop -- see the comment above.
      await waitForGpu();
      start = performance.now();
    } else if (step.value !== undefined) {
      // A failed load ends the steps, so that their `finally` blocks run, and the run fails.
      const stopped: Generator<unknown, T | null, undefined> = steps;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- see the comment above.
        await step.value;
      } catch (error) {
        stopped.return(null);
        throw error;
      }
      start = performance.now();
    } else if (performance.now() - start >= SLICE_MS) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- see the comment above.
      await yieldToMain();
      start = performance.now();
    }
  }
}
