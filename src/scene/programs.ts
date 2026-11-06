import type { WebGLProgram, WebGLRenderTarget, WebGLRenderer } from 'three';

import type { Steps } from '../score/steps.ts';

declare module 'three' {
  interface WebGLProgram {
    /**
     * Tells if the GPU finished the compile and the link of the program, from
     * `KHR_parallel_shader_compile`. With no such extension, it is always true. three.js has it,
     * but its types do not declare it.
     */
    isReady(): boolean;
  }
}

/**
 * Compiles shader programs with a render target as the current target (design 7.2). three.js
 * gives a pass into a target other programs than a pass to the canvas: no tone mapping, and the
 * linear colors. The size of the target does not change a program.
 *
 * @param renderer The renderer.
 * @param target The target, or `null` for a pass to the canvas.
 * @param compile Calls `compile()` of the renderer.
 */
export function compileInto(
  renderer: WebGLRenderer,
  target: WebGLRenderTarget | null,
  compile: () => void,
): void {
  const saved = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    compile();
  } finally {
    renderer.setRenderTarget(saved);
  }
}

/** The programs whose first use {@link programsReadySteps} did. */
const used = new WeakSet<WebGLProgram>();

/**
 * Waits until the GPU links each shader program of the renderer, and then does the first use of
 * each new program (design 7.2). With `KHR_parallel_shader_compile`, the GPU compiles in parallel,
 * and a draw with a program that is not ready blocks the main thread until the link ends. Each
 * check is a step that waits. A lost context gives no link status, so the wait ends: the restore
 * of the context compiles the programs again.
 *
 * @param renderer The renderer.
 * @returns The steps.
 */
export function* programsReadySteps(renderer: WebGLRenderer): Steps<undefined> {
  const gl = renderer.getContext();
  while (!gl.isContextLost() && renderer.info.programs?.some((program) => !program.isReady())) {
    yield 'wait';
  }
  // The first draw with a program reads its log, its uniforms, and its attributes. A step does it
  // for each new program, so that the first frame does it for none.
  for (const program of renderer.info.programs ?? []) {
    if (!used.has(program)) {
      used.add(program);
      program.getUniforms();
      program.getAttributes();
      yield;
    }
  }
  return undefined;
}

/**
 * Waits until the GPU ends each command of the renderer so far (design 7.2). A command that sends
 * data to the GPU, such as the upload of a buffer, waits on the main thread while the GPU is busy,
 * so a long bake or capture ends before the next step sends more. A fence of WebGL2 shows the end,
 * and each check is a step that waits.
 *
 * @param renderer The renderer.
 * @returns The steps.
 */
export function* gpuDoneSteps(renderer: WebGLRenderer): Steps<undefined> {
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) {
    return undefined;
  }
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) {
    return undefined;
  }
  gl.flush();
  try {
    while (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) {
      yield 'wait';
    }
  } finally {
    gl.deleteSync(fence);
  }
  return undefined;
}
