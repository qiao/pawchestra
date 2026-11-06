/** The port of `vite preview` for the Playwright tests when `PAWCHESTRA_E2E_PORT` is not set. */
export const DEFAULT_E2E_PORT = 4182;

/**
 * Reads the port of `vite preview` for the Playwright tests from the value of
 * `PAWCHESTRA_E2E_PORT`. CI sets no value and gets the default port. A parallel run sets a free
 * port, so that its run of `pnpm test:e2e` does not stop on the port of another run.
 *
 * @param value The value of the variable, or undefined when it is not set.
 * @returns The port.
 * @throws When the value is not an integer from 1024 to 65535.
 */
export function e2ePort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_E2E_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(
      `PAWCHESTRA_E2E_PORT must be an integer from 1024 to 65535, and it is "${value}".`,
    );
  }
  return port;
}
