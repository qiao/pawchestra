/**
 * The value of a yield of {@link Steps}: `undefined` between two steps, or `wait` before a step
 * that waits for the GPU, such as a shader program that compiles in parallel. The pure modules
 * yield only `undefined`.
 */
export type StepYield = undefined | 'wait';

/**
 * The step form of a long calculation (design 7.2): a generator that yields between its steps and
 * returns its result. The app runs the steps in short slices of the main thread
 * (`app/slices.ts`), so that no task of the load blocks the page. A tool, a test, or a short
 * calculation runs all steps at once with {@link runAll}. A step of a pure module reads no clock,
 * so the result is the same in both forms.
 */
export type Steps<T> = Generator<StepYield, T, undefined>;

/**
 * Runs all steps of a calculation at once. It cannot run a step that yields `wait`: WebGL changes
 * the status of a fence or of a parallel compile only between two tasks, so that wait never ends
 * in one task (design 7.2).
 *
 * @param steps The steps.
 * @returns The result of the last step.
 */
export function runAll<T>(steps: Steps<T>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) {
      return step.value;
    }
  }
}
