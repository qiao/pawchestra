import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';
import type { Browser, CDPSession, Page, Route } from '@playwright/test';
import { preview } from 'vite';

import { FIRST_PLAY, SAMPLES_READY } from '../src/app/dev-hook.ts';
import { DEFAULT_DEMO, DEMOS } from '../src/app/demos.ts';
import { FILE_FAILURE_TEXT } from '../src/app/messages.ts';
import { REPOSITORY_LABEL, REPOSITORY_TEXT, REPOSITORY_URL } from '../src/app/page-title.ts';
import { chromiumArgs } from './chromium-args.ts';

/** The accessible name of the link to GitHub, as `src/ui/title.ts` writes it (design 2.8). */
const REPOSITORY_NAME = `${REPOSITORY_TEXT}: ${REPOSITORY_LABEL}`;

/** The title of the default demo: the current row of the demo list at start. */
const DEFAULT_TITLE = DEMOS[DEFAULT_DEMO].title;

/** The result of one keyboard operation of one control. */
export interface KeyCheck {
  /** The size of the page, for example `1440 × 900`. */
  readonly size: string;
  /** The control, by its accessible name. */
  readonly control: string;
  /** The keys, in order. */
  readonly keys: string;
  /** What the page did. */
  readonly result: string;
  readonly pass: boolean;
}

/**
 * Writes the results of the keyboard check as a Markdown table.
 *
 * @param checks The results, in order.
 * @returns The table, with a line for each result.
 */
export function checkTable(checks: readonly KeyCheck[]): string {
  const cell = (text: string): string => text.replaceAll('|', '\\|');
  const rows = checks.map(
    (c) =>
      `| ${c.size} | ${cell(c.control)} | ${cell(c.keys)} | ${cell(c.result)} | ${c.pass ? 'pass' : 'fail'} |`,
  );
  return ['| Size | Control | Keys | Result | Check |', '|---|---|---|---|---|', ...rows].join(
    '\n',
  );
}

/**
 * Lists the failed checks.
 *
 * @param checks The results.
 * @returns One line for each failed check. An empty list is a pass.
 */
export function failedChecks(checks: readonly KeyCheck[]): string[] {
  return checks
    .filter((c) => !c.pass)
    .map((c) => `${c.size}: ${c.control} (${c.keys}): ${c.result}`);
}

/** A valid MIDI file of one note: format 0, 480 ticks for each quarter note. */
const ONE_NOTE_FILE = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 13,
  0x00, 0x90, 0x3c, 0x40, 0x83, 0x60, 0x80, 0x3c, 0x00, 0x00, 0xff, 0x2f, 0x00,
]);

/**
 * Gives the test of one accessible name.
 *
 * @param name The name.
 * @returns A test that is true for this name only.
 */
function named(name: string): (label: string) => boolean {
  return (label) => label === name;
}

/** The checks of one page size, with the helpers that read the page. */
class Checker {
  readonly checks: KeyCheck[] = [];
  readonly #page: Page;
  readonly #size: string;

  /**
   * Creates the checker of a page.
   *
   * @param page The page.
   * @param size The size of the page, for the table.
   */
  constructor(page: Page, size: string) {
    this.#page = page;
    this.#size = size;
  }

  /**
   * Records one result.
   *
   * @param control The control.
   * @param keys The keys.
   * @param result What the page did.
   * @param pass True if the page did what the design asks.
   */
  record(control: string, keys: string, result: string, pass: boolean): void {
    this.checks.push({ size: this.#size, control, keys, result, pass });
    // The progress goes to stderr, so that the table on stdout stays whole.
    console.error(`${pass ? 'pass' : 'FAIL'}  ${this.#size}  ${control}: ${result}`);
  }

  /** Gives the accessible name of the element with the focus, or its tag. */
  async focused(): Promise<string> {
    return this.#page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) {
        return 'body';
      }
      const label = element.getAttribute('aria-label');
      const text = element.textContent?.replaceAll(/\s+/gu, ' ').trim() ?? '';
      return label ?? (text || element.tagName.toLowerCase());
    });
  }

  /**
   * Presses Tab until the focus reaches a control, at most 80 times.
   *
   * @param matches Tells if an accessible name is the name of the control.
   * @param back True for Shift+Tab.
   * @returns The count of presses, or -1 if the focus did not reach it.
   */
  async tabTo(matches: (label: string) => boolean, back = false): Promise<number> {
    for (let i = 1; i <= 80; i++) {
      await this.#page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
      if (matches(await this.focused())) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Reads an attribute of an element.
   *
   * @param selector The CSS selector.
   * @param name The attribute.
   * @returns The value, or '' with no such element or attribute.
   */
  async attribute(selector: string, name: string): Promise<string> {
    return (await this.#page.getAttribute(selector, name)) ?? '';
  }

  /**
   * Reads the value of an input or a select.
   *
   * @param selector The CSS selector.
   * @returns The value.
   */
  async value(selector: string): Promise<string> {
    return this.#page.$eval(selector, (element) =>
      element instanceof HTMLInputElement || element instanceof HTMLSelectElement
        ? element.value
        : '',
    );
  }

  /**
   * Presses keys, then waits for the page to show the change.
   *
   * @param keys The keys, in order.
   * @param waitMs The wait after the keys, in milliseconds.
   */
  async press(keys: readonly string[], waitMs = 150): Promise<void> {
    for (const key of keys) {
      await this.#page.keyboard.press(key);
    }
    await this.#page.waitForTimeout(waitMs);
  }
}

/** A file for the file dialog. */
interface ChosenFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/**
 * Moves the focus to the file button, presses a key on it, and selects a file in the dialog.
 * Under a high load of the machine, the dialog can miss the first key, so the key repeats once.
 *
 * @param c The checker.
 * @param page The page.
 * @param key The key on the button: Enter or Space.
 * @param file The file.
 */
async function chooseFile(c: Checker, page: Page, key: string, file: ChosenFile): Promise<void> {
  await c.tabTo(named('Open a MIDI file'));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10_000 }),
        page.keyboard.press(key),
      ]);
      await chooser.setFiles(file);
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      console.error(`The file dialog did not open after ${key}. The key repeats.`);
    }
  }
}

/**
 * Tells if the message box is hidden.
 *
 * @param page The page.
 * @returns True with no message.
 */
async function messageHidden(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelector('.message')?.hasAttribute('hidden') === true);
}

/**
 * Tells if the drawer is closed.
 *
 * @param page The page.
 * @returns True while the drawer has the attribute `hidden`.
 */
async function drawerHidden(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelector('.drawer')?.hasAttribute('hidden') === true);
}

/**
 * Tells if the credits dialog is open.
 *
 * @param page The page.
 * @returns True while the dialog is open.
 */
async function creditsOpen(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.querySelector('dialog.credits-dialog')?.hasAttribute('open') === true,
  );
}

/**
 * Opens the sheet of a phone again after a selection closed it (design 2.8). The selection gives
 * the focus to the drawer button.
 *
 * @param c The checker.
 * @param phone True for the phone size. A desktop keeps the drawer open.
 */
async function reopenSheet(c: Checker, phone: boolean): Promise<void> {
  if (phone) {
    await c.tabTo(named('Open the drawer'));
    await c.press(['Enter'], 400);
  }
}

/**
 * Opens the page at a size, and waits until the samples of the default demo are ready.
 *
 * @param browser The browser.
 * @param url The URL of the page.
 * @param width The width in CSS pixels.
 * @param height The height in CSS pixels.
 * @returns The page and the errors of its console.
 */
async function openPage(
  browser: Browser,
  url: string,
  width: number,
  height: number,
): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(url);
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  return { page, errors };
}

/**
 * Checks the button "Select music" of the first screen (design 2.8). The wide window opens the
 * drawer at the demo list at start, so the button hides until Escape closes the drawer. Then
 * Enter on the button opens the drawer at the demo list, and the row of the current demo gets the
 * focus.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The checks.
 */
async function checkSelectPiece(browser: Browser, base: string): Promise<KeyCheck[]> {
  const { page } = await openPage(browser, base, 1440, 900);
  const c = new Checker(page, '1440 × 900');
  try {
    const hiddenAtStart = !(await page.isVisible('.first-screen .select-piece'));
    // The focus is not in the drawer, so it stays on the page, and Tab starts at the top.
    await c.press(['Escape'], 400);
    const tabs = await c.tabTo(named('Select music'));
    await c.press(['Enter'], 400);
    const opened = !(await drawerHidden(page));
    const focus = await c.focused();
    // The link to GitHub in the title and the play button come first (design 2.8).
    c.record(
      'Select music (first screen)',
      `Escape, Tab x${tabs}, Enter`,
      `hidden beside the demo list: ${hiddenAtStart}; the drawer opens: ${opened}; focus on "${focus}"`,
      hiddenAtStart && tabs === 3 && opened && focus.startsWith(DEFAULT_TITLE),
    );
  } finally {
    await page.close();
  }
  return c.checks;
}

/**
 * Checks the controls of the bar and of the first screen, and the keys of the page.
 *
 * @param c The checker.
 * @param page The page.
 * @param phone True for the phone size, with no speed menu and no volume slider in the bar.
 */
async function checkBar(c: Checker, page: Page, phone: boolean): Promise<void> {
  const first = await c.tabTo(named('Play'));
  const inFirstScreen = await page.evaluate(
    () => document.activeElement?.closest('.first-screen') !== null,
  );
  await c.press(['Enter'], 1500);
  const playing = (await c.attribute('.bar button[aria-label]', 'aria-label')) === 'Pause';
  // The first screen hides, and its focus goes to the play button of the bar (design 2.8).
  const focusAfter = await c.focused();
  c.record(
    'Play (first screen)',
    `Tab x${first}, Enter`,
    `first stop of Tab: ${inFirstScreen}; play starts: ${playing}; focus on "${focusAfter}"`,
    first === 1 && inFirstScreen && playing && focusAfter === 'Pause',
  );

  const toBar = focusAfter === 'Pause' ? 0 : await c.tabTo(named('Pause'));
  await c.press(['Space'], 300);
  const paused = (await c.focused()) === 'Play';
  await c.press(['Enter'], 1500);
  const again = (await c.focused()) === 'Pause';
  c.record(
    'Play and pause (bar)',
    `Tab x${toBar}, Space, Enter`,
    `Space pauses: ${paused}; Enter plays: ${again}`,
    toBar >= 0 && paused && again,
  );

  await c.tabTo(named('Seek'));
  const before = Number(await c.value('.seek'));
  await c.press(['ArrowRight', 'ArrowRight', 'ArrowRight']);
  const after = Number(await c.value('.seek'));
  await c.press(['Home']);
  const home = Number(await c.value('.seek'));
  await c.press(['End'], 400);
  const end = await c.value('.seek');
  const max = await c.attribute('.seek', 'max');
  await c.press(['Home'], 400);
  c.record(
    'Seek',
    'Tab, Right x3, Home, End, Home',
    `${before} s, Right x3 ${after} s, Home ${home} s, End ${end} of ${max} s`,
    after >= before + 2 && home === 0 && end === max,
  );

  if (!phone) {
    await checkPlayback(c, page, 'bar');
  }

  await c.tabTo(named('Mute'));
  await c.press(['Space']);
  const muted = await c.attribute('.bar button[aria-pressed]', 'aria-pressed');
  await c.press(['Enter']);
  const unmuted = await c.attribute('.bar button[aria-pressed]', 'aria-pressed');
  c.record(
    'Mute',
    'Tab, Space, Enter',
    `aria-pressed ${muted}, then ${unmuted}`,
    muted === 'true' && unmuted === 'false',
  );

  // The tooltip shows 400 ms after a keyboard focus, and Escape hides it (design 2.8).
  await page.waitForTimeout(600);
  const tooltip = (): Promise<string> =>
    page.evaluate(() => {
      const element = document.querySelector('.tooltip');
      return element instanceof HTMLElement && !element.hidden ? (element.textContent ?? '') : '';
    });
  const tip = await tooltip();
  await c.press(['Escape']);
  const tipAfter = await tooltip();
  const stays = await c.focused();
  c.record(
    'Tooltip of a control with the focus',
    'Tab to Mute, wait 0.6 s, Escape',
    `tooltip "${tip}"; Escape hides it: ${tipAfter === ''}; focus stays on "${stays}"`,
    tip === 'Mute (M)' && tipAfter === '' && stays === 'Mute',
  );

  // The speed menu and the volume slider of the bar have tooltips with no key. On a phone, they
  // are in the drawer.
  if (!phone) {
    await c.tabTo(named('Volume'));
    await page.waitForTimeout(600);
    const volumeTip = await tooltip();
    await c.tabTo(named('Speed'), true);
    await page.waitForTimeout(600);
    const speedTip = await tooltip();
    c.record(
      'Tooltips of the speed menu and the volume slider',
      'Tab to Volume, wait 0.6 s, Shift+Tab to Speed, wait 0.6 s',
      `tooltips "${volumeTip}" and "${speedTip}"`,
      volumeTip === 'Volume' && speedTip === 'Speed',
    );
  }

  // "Reset view" of the desktop check gave Free mode, so the start state can be either one.
  await c.tabTo(named('Cinematic camera'));
  const camera = (): Promise<string> => c.attribute('.bar .camera', 'aria-pressed');
  const cameraBefore = await camera();
  await c.press(['Space']);
  const cameraSpace = await camera();
  await c.press(['Enter']);
  const cameraEnter = await camera();
  c.record(
    'Cinematic camera',
    'Tab, Space, Enter',
    `aria-pressed ${cameraBefore}, then ${cameraSpace}, then ${cameraEnter}`,
    cameraSpace !== cameraBefore && cameraEnter === cameraBefore,
  );

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  const label = (): Promise<string> => c.attribute('.bar button[aria-label]', 'aria-label');
  const start = await label();
  await c.press(['Space'], 1500);
  const second = await label();
  await c.press(['Space'], 1500);
  const third = await label();
  if (third === 'Play') {
    await c.press(['Space'], 1500);
  }
  const songBefore = Number(await c.value('.seek'));
  await c.press(['ArrowRight', 'ArrowRight'], 400);
  const forward = Number(await c.value('.seek'));
  await c.press(['ArrowLeft'], 400);
  const back = Number(await c.value('.seek'));
  await c.press(['Home'], 300);
  const homed = Number(await c.value('.seek'));
  const cameraKeyBefore = await c.attribute('.bar .camera', 'aria-pressed');
  await c.press(['c']);
  const cameraKey = await c.attribute('.bar .camera', 'aria-pressed');
  await c.press(['C']);
  const cameraKeyAgain = await c.attribute('.bar .camera', 'aria-pressed');
  c.record(
    'Key C (focus on the page)',
    'c, C',
    `cinematic camera ${cameraKeyBefore}, then ${cameraKey}, then ${cameraKeyAgain}`,
    cameraKey !== cameraKeyBefore && cameraKeyAgain === cameraKeyBefore,
  );
  const mute = (): Promise<string> => c.attribute('.bar button[aria-pressed]', 'aria-pressed');
  await c.press(['m']);
  const muteKey = await mute();
  await c.press(['M']);
  const muteKeyAgain = await mute();
  const fullScreen = (): Promise<boolean> =>
    page.evaluate(() => document.fullscreenElement !== null);
  await c.press(['f'], 600);
  const fullKey = await fullScreen();
  await c.press(['F'], 600);
  const fullKeyAgain = await fullScreen();
  c.record(
    'Keys M and F (focus on the page)',
    'm, M, f, F',
    `mute ${muteKey}, then ${muteKeyAgain}; full screen ${fullKey}, then ${fullKeyAgain}`,
    muteKey === 'true' && muteKeyAgain === 'false' && fullKey && !fullKeyAgain,
  );
  c.record(
    'Keys of the page (focus on the page)',
    'Space x2, Right x2, Left, Home',
    `Space: "${start}" to "${second}" to "${third}"; ${songBefore} s, Right x2 ${forward} s, Left ${back} s, Home ${homed} s`,
    start !== second &&
      second !== third &&
      forward >= songBefore + 9 &&
      back <= forward - 4 &&
      homed <= 1,
  );
}

/**
 * Checks the speed menu, the volume slider, "Reset view", and full screen: in the bar on a
 * desktop, and in the "Playback" group of the settings on a phone. "Reset view" also turns off
 * the cinematic camera (design 2.5).
 *
 * @param c The checker.
 * @param page The page.
 * @param place `bar` or `settings`, for the table.
 */
async function checkPlayback(c: Checker, page: Page, place: string): Promise<void> {
  const where = place === 'bar' ? '' : ' (Playback group)';
  const speedTabs = await c.tabTo(named('Speed'));
  const speedBefore = await c.value('select.speed');
  // On macOS, the arrow keys open the native menu of a select, which headless Chromium does not
  // show. The type-ahead of a closed select selects an option on each system.
  // The type-ahead joins the keys of about 1 s into one search text.
  await c.press(['0'], 1200);
  const half = await c.value('select.speed');
  await c.press(['1'], 1200);
  const speedAfter = await c.value('select.speed');
  c.record(
    `Speed${where}`,
    'Tab, 0, 1 (type-ahead)',
    `${speedBefore}×, 0 gives ${half}×, 1 gives ${speedAfter}×`,
    speedTabs > 0 && half === '0.5' && speedAfter === '1',
  );

  await c.tabTo(named('Volume'));
  await c.press(['ArrowLeft', 'ArrowLeft']);
  const left = await c.value('.volume');
  await c.press(['Home']);
  const home = await c.value('.volume');
  const silent = await c.attribute('button[aria-label="Mute"]', 'aria-pressed');
  await c.press(['End']);
  const end = await c.value('.volume');
  c.record(
    `Volume${where}`,
    'Tab, Left x2, Home, End',
    `100 to ${left}, Home ${home} (mute shows ${silent}), End ${end}`,
    left === '98' && home === '0' && silent === 'true' && end === '100',
  );

  await c.tabTo(named('Reset view'));
  await c.press(['Enter']);
  const resetFocused = (await c.focused()) === 'Reset view';
  const cinematic = await c.attribute('.bar .camera', 'aria-pressed');
  c.record(
    `Reset view${where}`,
    'Tab, Enter',
    `the view resets, the cinematic camera is ${cinematic === 'true' ? 'on' : 'off'}`,
    resetFocused && cinematic === 'false',
  );

  const canFullScreen = await page.evaluate(() => document.fullscreenEnabled);
  if (canFullScreen) {
    await c.tabTo(named('Full screen'));
    await c.press(['Enter'], 600);
    const entered = await page.evaluate(() => document.fullscreenElement !== null);
    const label = await c.focused();
    await page.evaluate(() => document.exitFullscreen().catch(() => undefined));
    await page.waitForTimeout(400);
    c.record(
      `Full screen${where}`,
      'Tab, Enter',
      `full screen: ${entered}, label "${label}"`,
      entered && label === 'Exit full screen',
    );
  }
}

/**
 * Checks the link to GitHub after the logo (design 2.8): it is the first stop of Tab, and Enter
 * opens the repository in a new tab. The check answers the request to GitHub itself, so that it
 * needs no network.
 *
 * @param c The checker.
 * @param page The page, with the focus on no control.
 */
async function checkRepositoryLink(c: Checker, page: Page): Promise<void> {
  await page.context().route(REPOSITORY_URL, async (route) => {
    await route.fulfill({ contentType: 'text/plain', body: 'Zoophony' });
  });
  const tabs = await c.tabTo(named(REPOSITORY_NAME));
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    page.keyboard.press('Enter'),
  ]);
  await tab.waitForLoadState();
  const url = tab.url();
  await tab.close();
  const focus = await c.focused();
  c.record(
    'Link to GitHub',
    `Tab x${tabs}, Enter`,
    `opens ${url} in a new tab; focus stays on "${focus}"`,
    tabs === 1 && url === REPOSITORY_URL && focus === REPOSITORY_NAME,
  );
}

/**
 * Checks the drawer at start (design 2.8): a wide window opens it at the tab "Music", and a
 * phone keeps it closed. Escape then closes an open drawer, so that the next checks start from
 * a closed drawer.
 *
 * @param c The checker.
 * @param page The page.
 * @param phone True for the phone size.
 */
async function checkDrawerAtStart(c: Checker, page: Page, phone: boolean): Promise<void> {
  const open = !(await drawerHidden(page));
  const tab = await c.attribute('[role="tab"][aria-selected="true"]', 'id');
  await c.press(['Escape'], 400);
  const closed = await drawerHidden(page);
  c.record(
    'Drawer at start',
    'Escape',
    `open: ${open}; current tab: ${tab}; Escape closes: ${closed}`,
    open === !phone && tab === 'tab-demos' && closed,
  );
}

/**
 * Checks the drawer: the drawer button, Escape, the tabs, the demo list, the file button, the
 * seat list, the settings, the link "Credits" with its dialog, and a message.
 *
 * @param c The checker.
 * @param page The page.
 * @param phone True for the phone size, with the "Playback" group in the settings.
 */
async function checkDrawer(c: Checker, page: Page, phone: boolean): Promise<void> {
  const toButton = await c.tabTo(named('Open the drawer'));
  await c.press(['Enter']);
  const open = await c.attribute('.bar button[aria-expanded]', 'aria-expanded');
  await c.tabTo((label) => label.startsWith(DEFAULT_TITLE));
  await c.press(['Escape']);
  const closed = await page.evaluate(() =>
    document.querySelector('.drawer')?.hasAttribute('hidden'),
  );
  const back = await c.focused();
  c.record(
    'Drawer button and Escape',
    `Tab x${toButton}, Enter, Tab, Escape`,
    `opens: ${open}; Escape closes: ${closed}; focus back on "${back}"`,
    open === 'true' && closed === true && back === 'Open the drawer',
  );

  await c.press(['Space']);
  // The tab "Music" and the close button come first, and the file button ends the demo list
  // (design 2.8).
  const order: string[] = [];
  while (order.length < 80 && order.at(-1) !== 'Open a MIDI file') {
    await page.keyboard.press('Tab');
    order.push(await c.focused());
  }
  const shown =
    order.length > 10
      ? [...order.slice(0, 9), `(${order.length - 10} more)`, ...order.slice(-1)]
      : order;
  c.record(
    'Focus order into the drawer',
    `Space on the drawer button, Tab x${order.length}`,
    shown.join(' > '),
    order[0] === 'Music' &&
      order[1] === 'Close the drawer' &&
      order[2]?.startsWith(DEFAULT_TITLE) === true &&
      order.at(-1) === 'Open a MIDI file',
  );

  // The close button of the drawer gives the focus to the drawer button (design 2.8).
  const toClose = await c.tabTo(named('Close the drawer'), true);
  await c.press(['Enter'], 400);
  const closedByButton = await drawerHidden(page);
  const afterCloseButton = await c.focused();
  c.record(
    'Close the drawer (button)',
    `Shift+Tab x${toClose}, Enter`,
    `closes: ${closedByButton}; focus on "${afterCloseButton}"`,
    closedByButton && afterCloseButton === 'Open the drawer',
  );
  await c.press(['Enter'], 400);

  await c.tabTo((label) => label.startsWith('Andante in C'));
  await c.press(['Enter'], 300);
  await page.waitForSelector('canvas[data-demo="mozart-k315"]', { timeout: 30_000 });
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const hash = await page.evaluate(() => location.hash);
  const playsNew = (await c.attribute('.bar button[aria-label]', 'aria-label')) === 'Pause';
  const sheetAfterDemo = await drawerHidden(page);
  const focusAfterDemo = await c.focused();
  c.record(
    'Demo row "Andante in C, K. 315"',
    'Tab to the row, Enter',
    `loads the demo, hash ${hash}, starts when ready: ${playsNew}; the drawer closes: ` +
      `${sheetAfterDemo}; focus on "${focusAfterDemo}"`,
    hash === '#demo=mozart-k315' &&
      playsNew &&
      // A phone closes the sheet after a selection, and a desktop keeps the drawer (PH1).
      sheetAfterDemo === phone &&
      (!phone || focusAfterDemo === 'Open the drawer'),
  );
  await reopenSheet(c, phone);

  const notMidi = { name: 'not-midi.mid', mimeType: 'audio/midi', buffer: Buffer.from('hello') };
  await chooseFile(c, page, 'Enter', notMidi);
  await page.waitForSelector('.message:not([hidden])', { timeout: 10_000 });
  const message = (await page.textContent('.message span')) ?? '';
  c.record(
    'Open a MIDI file (a file that is not MIDI)',
    'Tab, Enter, select the file',
    `message "${message}"`,
    message === 'This file is not a valid MIDI file.',
  );

  await c.tabTo(named('Close the message'), true);
  await c.press(['Escape']);
  const escaped = await messageHidden(page);
  const drawerStays = await page.evaluate(
    () => document.querySelector('.drawer')?.hasAttribute('hidden') === false,
  );
  const afterEscape = await c.focused();
  c.record(
    'Escape in the message',
    'Shift+Tab to the close button, Escape',
    `closes: ${escaped}; the drawer stays open: ${drawerStays}; focus on "${afterEscape}"`,
    escaped && drawerStays && (afterEscape === 'Play' || afterEscape === 'Pause'),
  );

  await chooseFile(c, page, 'Enter', notMidi);
  await page.waitForSelector('.message:not([hidden])', { timeout: 10_000 });
  await c.tabTo(named('Close the message'), true);
  await c.press(['Enter']);
  const closed2 = await messageHidden(page);
  const afterClose = await c.focused();
  c.record(
    'Close the message',
    'Shift+Tab to the button, Enter',
    `closes: ${closed2}; focus on "${afterClose}"`,
    closed2 && (afterClose === 'Play' || afterClose === 'Pause'),
  );

  await chooseFile(c, page, 'Space', {
    name: 'one-note.mid',
    mimeType: 'audio/midi',
    buffer: ONE_NOTE_FILE,
  });
  await page.waitForSelector('canvas[data-demo="file"]', { timeout: 30_000 });
  const title = (await page.textContent('.title h2')) ?? '';
  c.record(
    'Open a MIDI file (a valid file)',
    'Tab, Space, select the file',
    `plays the file "${title}"`,
    title === 'one-note',
  );

  // The file of one note has one seat. The checks of the seats use the K. 315 demo again.
  await reopenSheet(c, phone);
  await c.tabTo((label) => label.startsWith('Andante in C'), !phone);
  await c.press(['Enter'], 300);
  await page.waitForSelector('canvas[data-demo="mozart-k315"]', { timeout: 30_000 });
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  await reopenSheet(c, phone);
  // The right arrow on a tab selects the next tab, and it does not seek (design 2.4, 2.8).
  await c.tabTo(named('Music'), !phone);
  const seekBefore = Number(await c.value('.seek'));
  await c.press(['ArrowRight']);
  const seekAfter = Number(await c.value('.seek'));
  const seatsTab = await c.attribute('#tab-seats', 'aria-selected');
  const onSeats = await c.focused();
  const rows = await page.locator('.seat:visible').count();
  c.record(
    'Tab "Seats"',
    'Tab to "Music", Right',
    `aria-selected ${seatsTab}; focus on "${onSeats}"; ${rows} seat rows; seek moves ` +
      `${(seekAfter - seekBefore).toFixed(1)} s`,
    seatsTab === 'true' && onSeats === 'Seats' && rows > 0 && Math.abs(seekAfter - seekBefore) < 3,
  );

  await c.tabTo(named('Mute Cellos'));
  await c.press(['Space']);
  const cellos = await c.attribute('button[aria-label="Mute Cellos"]', 'aria-pressed');
  const dim = await page.evaluate(() =>
    document
      .querySelector('button[aria-label="Mute Cellos"]')
      ?.closest('.seat')
      ?.classList.contains('silent'),
  );
  await c.tabTo(named('Solo Oboes'));
  await c.press(['Enter']);
  const solo = await c.attribute('button[aria-label="Solo Oboes"]', 'aria-pressed');
  await c.press(['Enter']);
  await c.tabTo(named('Mute Cellos'), true);
  await c.press(['Enter']);
  const unmuted = await c.attribute('button[aria-label="Mute Cellos"]', 'aria-pressed');
  c.record(
    'Seat toggles M and S',
    'Tab, Space (Mute Cellos), Tab, Enter x2 (Solo Oboes), Shift+Tab, Enter',
    `mute ${cellos} (row dim: ${dim}), solo ${solo}, mute again ${unmuted}`,
    cellos === 'true' && dim === true && solo === 'true' && unmuted === 'false',
  );

  // A new piece replaces the seat rows. The focus on a row goes to the tab "Seats".
  await page.evaluate(() => {
    location.hash = '#demo=mozart-k525';
  });
  await page.waitForSelector('canvas[data-demo="mozart-k525"]', { timeout: 30_000 });
  const afterPiece = await c.focused();
  c.record(
    'Focus on a seat toggle, then a new piece',
    'Shift+Tab to Mute Cellos, a new hash',
    `focus on "${afterPiece}"`,
    afterPiece === 'Seats',
  );

  await c.press(['ArrowRight']);
  const settingsTab = await c.attribute('#tab-settings', 'aria-selected');
  c.record(
    'Tab "Settings"',
    'Right',
    `aria-selected ${settingsTab}; focus on "${await c.focused()}"`,
    settingsTab === 'true',
  );

  if (phone) {
    await checkPlayback(c, page, 'settings');
  }

  await c.tabTo(named('One per part'));
  await c.press(['Enter'], 400);
  const perPart = await c.attribute(
    '.segmented[aria-label="Section size"] button[aria-pressed="true"]',
    'aria-pressed',
  );
  const perPartText = await page.textContent(
    '.segmented[aria-label="Section size"] button[aria-pressed="true"]',
  );
  await c.tabTo(named('Low'));
  await c.press(['Space'], 300);
  const low = await page.textContent(
    '.segmented[aria-label="Quality"] button[aria-pressed="true"]',
  );
  c.record(
    'Settings: Section size and Quality',
    'Tab, Enter (One per part), Tab, Space (Low)',
    `section size "${perPartText}", quality "${low}"`,
    perPart === 'true' && perPartText === 'One per part' && low === 'Low',
  );

  // The link "Credits" ends the tab "Settings" and opens the credits dialog (design 2.8).
  const toCredits = await c.tabTo(named('Credits'));
  const popup = await c.attribute('.credits-line button', 'aria-haspopup');
  await c.press(['Enter'], 300);
  const opened = await creditsOpen(page);
  const inDialog = await c.focused();
  c.record(
    'Credits link',
    `Tab x${toCredits}, Enter`,
    `aria-haspopup ${popup}; the dialog opens: ${opened}; focus on "${inDialog}"`,
    popup === 'dialog' && opened && inDialog === 'Close the credits',
  );

  await c.tabTo(named('Third-party licenses'));
  const [tab] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Enter')]);
  await tab.waitForLoadState();
  const licenses = tab.url();
  const text = (await tab.textContent('body')) ?? '';
  await tab.close();
  c.record(
    'Third-party licenses (in the credits dialog)',
    'Tab, Enter',
    `opens ${licenses.replace(/^https?:\/\/[^/]+/u, '')} in a new tab`,
    licenses.endsWith('/third-party-licenses.txt') && text.includes('GeneralUser GS'),
  );

  // Escape closes only the dialog, and the keys of the page do nothing behind it (design 2.4).
  const barState = async (): Promise<string> =>
    [
      await c.attribute('.bar button[aria-label]', 'aria-label'),
      await c.attribute('.bar button[aria-label="Mute"]', 'aria-pressed'),
      await c.attribute('.bar .camera', 'aria-pressed'),
    ].join(', ');
  const before = await barState();
  await c.press(['m', 'c'], 200);
  const still = (await barState()) === before;
  await c.press(['Escape'], 300);
  const closedByEscape = !(await creditsOpen(page));
  const drawerOpen = !(await drawerHidden(page));
  const afterEscapeKey = await c.focused();
  c.record(
    'Escape in the credits dialog',
    'M, C, Escape',
    `M and C do nothing: ${still}; the dialog closes: ${closedByEscape}; the drawer stays ` +
      `open: ${drawerOpen}; focus on "${afterEscapeKey}"`,
    still && closedByEscape && drawerOpen && afterEscapeKey === 'Credits',
  );

  await c.press(['Enter'], 300);
  await c.press(['Enter'], 300);
  const closedByButton2 = !(await creditsOpen(page));
  const afterCloseCredits = await c.focused();
  c.record(
    'Close the credits (button)',
    'Enter on the link, Enter on the close button',
    `the dialog closes: ${closedByButton2}; focus on "${afterCloseCredits}"`,
    closedByButton2 && afterCloseCredits === 'Credits',
  );

  const handle = await page.evaluate(() => {
    const element = document.querySelector('.handle');
    return element instanceof HTMLElement && element.tabIndex < 0;
  });
  if (phone) {
    c.record('Drag handle', 'Tab', `not in the focus order: ${handle}`, handle);
  }
}

/**
 * Checks the "Try again" button of a failed load: the page cannot load the samples first, then
 * it can.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @param size The size, for the table.
 * @param width The width in CSS pixels.
 * @param height The height in CSS pixels.
 * @returns The results.
 */
async function checkRetry(
  browser: Browser,
  base: string,
  size: string,
  width: number,
  height: number,
): Promise<KeyCheck[]> {
  // A route of the context also stops the requests of the decode Worker.
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const c = new Checker(page, size);
  await context.route('**/sf/**', (route) => route.abort());
  await page.goto(base);
  await page.waitForSelector('.message:not([hidden])', { timeout: 60_000 });
  const message = (await page.textContent('.message span')) ?? '';
  await context.unroute('**/sf/**');
  const tabs = await c.tabTo(named('Try again'));
  await c.press(['Enter']);
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const plays = (await c.attribute('.bar button[aria-label]', 'aria-label')) === 'Pause';
  c.record(
    'Try again (failed load)',
    `Tab x${tabs}, Enter`,
    `message "${message}"; the samples load and the piece plays: ${plays}`,
    message.startsWith('The instruments did not load.') && plays,
  );
  await context.close();
  return c.checks;
}

/** The times that a finger stays on the hidden bar in a tap, in milliseconds. */
const TAP_HOLDS_MS = [20, 60, 120] as const;

/**
 * Taps the middle of an element at a part of its width, also when the element is hidden. The
 * finger stays down for a time, as a real tap does. `page.touchscreen.tap()` sends the start and
 * the end of the touch at the same time, so the tap goes through the CDP touch events.
 *
 * @param page The page with touch.
 * @param cdp The CDP session of the page.
 * @param selector The CSS selector of the element.
 * @param share The part of the width from the left edge, from 0 to 1.
 * @param holdMs The time between the start and the end of the touch, in milliseconds.
 */
async function tapAt(
  page: Page,
  cdp: CDPSession,
  selector: string,
  share: number,
  holdMs: number,
): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`The page has no box for "${selector}".`);
  }
  const point = { x: box.x + box.width * share, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Checks that a tap on the hidden bar only shows the bar (design 2.3): on a phone with touch, a
 * tap on the hidden seek bar does not seek, and a tap on the hidden pause button does not pause.
 * Each tap holds the finger down for each time of {@link TAP_HOLDS_MS}.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The results.
 */
async function checkHiddenBarTap(browser: Browser, base: string): Promise<KeyCheck[]> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const c = new Checker(page, '390 × 844, touch');
  const playLabel = (): Promise<string> => c.attribute('.bar button[aria-label]', 'aria-label');
  const barHidden = async (): Promise<boolean> =>
    (await c.attribute('.bar', 'class')).includes('is-hidden');
  await page.goto(base);
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  await page.tap(FIRST_PLAY);
  for (const holdMs of TAP_HOLDS_MS) {
    await page.waitForSelector('.bar.is-hidden', { timeout: 15_000 });
    const before = Number(await c.value('.seek'));
    await tapAt(page, cdp, '.seek', 0.8, holdMs);
    await page.waitForTimeout(300);
    const after = Number(await c.value('.seek'));
    const shown = !(await barHidden());
    c.record(
      `Tap on the hidden seek bar (${holdMs} ms)`,
      `touch at 80% of the seek bar for ${holdMs} ms`,
      `${before} s to ${after} s; the bar shows: ${shown}`,
      after <= before + 2 && shown,
    );
    // After a failed tap, the next taps start again from the start of the song with no focus.
    await page.evaluate(
      (seeked) => {
        const seek = document.querySelector('.seek');
        if (seeked && seek instanceof HTMLInputElement) {
          seek.value = '0';
          seek.dispatchEvent(new Event('input'));
        }
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      },
      after > before + 2,
    );

    await page.waitForSelector('.bar.is-hidden', { timeout: 15_000 });
    await tapAt(page, cdp, '.bar button', 0.5, holdMs);
    await page.waitForTimeout(300);
    const label = await playLabel();
    const shownAgain = !(await barHidden());
    // The next tap on the shown bar reaches the control.
    await tapAt(page, cdp, '.bar button', 0.5, holdMs);
    await page.waitForTimeout(300);
    const next = await playLabel();
    c.record(
      `Tap on the hidden pause button (${holdMs} ms)`,
      `touch on the pause button for ${holdMs} ms, two times`,
      `label "${label}"; the bar shows: ${shownAgain}; the next tap gives "${next}"`,
      label === 'Pause' && shownAgain && next === 'Play',
    );
    if ((await playLabel()) === 'Play') {
      await page.tap('.bar button');
    }
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }

  // Each control that shows in the bar and in the drawer has the touch size of 2.8.
  await page.tap('.bar button[aria-label="Open the drawer"]');
  await page.tap('.collapse');
  // The drawer slides in for 200 ms (design 2.8). A measure during the slide gave sizes a little
  // below 44 px in one run.
  await page.waitForTimeout(400);
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll(':is(.bar, .drawer) :is(button, input, select, a)')]
      .filter((control) => control.getClientRects().length > 0)
      .map((control) => {
        const box = control.getBoundingClientRect();
        const name = control.getAttribute('aria-label') ?? control.textContent ?? '';
        return { name, width: box.width, height: box.height };
      }),
  );
  const small = controls
    .filter((box) => box.width < 44 || box.height < 44)
    .map((box) => `${box.name} ${box.width.toFixed(1)} × ${box.height.toFixed(1)}`);
  c.record(
    'Touch size of each control',
    'tap on the drawer button, tap on the collapse button',
    small.length === 0 ? `all ${controls.length} controls are 44 px or more` : small.join('; '),
    small.length === 0,
  );

  // The link to GitHub keeps its small box in the logo line, and a tap in a square of 44 px
  // around its mark hits it (design 2.8).
  const githubMisses = await page.evaluate(() => {
    const link = document.querySelector('.title .github');
    if (!link) {
      return ['no link'];
    }

    const box = link.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const points = [-21, 0, 21].flatMap((dx) => [-21, 0, 21].map((dy) => [x + dx, y + dy]));
    return points
      .filter(([px = 0, py = 0]) => !link.contains(document.elementFromPoint(px, py)))
      .map(([px = 0, py = 0]) => `${px.toFixed(0)}, ${py.toFixed(0)}`);
  });
  c.record(
    'Hit area of the link to GitHub',
    '',
    githubMisses.length === 0
      ? 'a square of 44 px around the mark hits the link'
      : `misses at ${githubMisses.join('; ')}`,
    githubMisses.length === 0,
  );

  // The credit links are in the credits dialog. A tap on the link "Credits" opens it, and its
  // controls also have the touch size.
  await page.locator('.drawer-footer button').scrollIntoViewIfNeeded();
  await page.tap('.drawer-footer button');
  await page.waitForTimeout(400);
  const dialogControls = await page.evaluate(() =>
    [...document.querySelectorAll('dialog.credits-dialog :is(button, a)')].map((control) => {
      const box = control.getBoundingClientRect();
      const name = control.getAttribute('aria-label') ?? control.textContent ?? '';
      return { name, width: box.width, height: box.height };
    }),
  );
  const smallInDialog = dialogControls
    .filter((box) => box.width < 44 || box.height < 44)
    .map((box) => `${box.name} ${box.width.toFixed(1)} × ${box.height.toFixed(1)}`);
  c.record(
    'Touch size of each control of the credits dialog',
    'tap on the link "Credits"',
    smallInDialog.length === 0
      ? `all ${dialogControls.length} controls are 44 px or more`
      : smallInDialog.join('; '),
    dialogControls.length > 0 && smallInDialog.length === 0,
  );

  // A credit link of the touch size keeps the line height of its paragraph: the paragraph has the
  // same height as with plain inline links.
  const gaps = await page.evaluate(() => {
    const paragraphs = [...document.querySelectorAll('.credits p')].filter((p) =>
      p.querySelector('a'),
    );
    const heights = (): number[] => paragraphs.map((p) => p.getBoundingClientRect().height);
    const touch = heights();
    const plain = document.createElement('style');
    plain.textContent = '.credits a { display: inline !important; margin: 0 !important; }';
    document.head.append(plain);
    const inline = heights();
    plain.remove();
    return touch
      .map((height, i) => ({ height, inline: inline[i] ?? 0 }))
      .filter((box) => Math.abs(box.height - box.inline) > 1)
      .map((box) => `${box.height.toFixed(1)} px in place of ${box.inline.toFixed(1)} px`);
  });
  c.record(
    'Line height of the credits with links',
    '',
    gaps.length === 0 ? 'each paragraph keeps its line height' : gaps.join('; '),
    gaps.length === 0,
  );

  // A tap on each row of the box of a credit link hits the link, also in the lower part, where
  // the next paragraph comes later in the paint order.
  const covered = await page.evaluate(() =>
    [...document.querySelectorAll('.credits a')].flatMap((link) => {
      link.scrollIntoView({ block: 'center' });
      const box = link.getBoundingClientRect();
      const x = box.left + box.width / 2;
      let missed = 0;
      for (let y = Math.ceil(box.top); y < box.bottom; y++) {
        if (!link.contains(document.elementFromPoint(x, y))) {
          missed++;
        }
      }
      const rows = Math.ceil(box.bottom) - Math.ceil(box.top);
      return missed === 0 ? [] : [`${link.textContent ?? ''}: ${missed} of ${rows} rows miss`];
    }),
  );
  const links = await page.locator('.credits a').count();
  c.record(
    'Hit target of each credit link',
    '',
    covered.length === 0 ? `all ${links} links get each row of their box` : covered.join('; '),
    links > 0 && covered.length === 0,
  );
  await context.close();
  return c.checks;
}

/**
 * Checks that only a keyboard focus keeps the bar on the screen during play (design 2.3): after a
 * mouse click on Pause and then on Play, the bar hides after 3 s with no pointer motion. After a
 * Tab to the play button, the bar stays.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The results.
 */
async function checkPointerFocus(browser: Browser, base: string): Promise<KeyCheck[]> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const c = new Checker(page, '1440 × 900');
  const barHidden = async (): Promise<boolean> =>
    (await c.attribute('.bar', 'class')).includes('is-hidden');
  await page.goto(base);
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  // The bar stays while the drawer is open, and a wide window opens it at start (design 2.8).
  await page.click('.drawer .close-drawer');
  await page.click(FIRST_PLAY);
  await page.waitForTimeout(1000);
  await page.click('.bar button');
  await page.waitForTimeout(300);
  await page.click('.bar button');
  await page.waitForTimeout(300);
  const focus = await c.focused();
  await page.mouse.move(720, 300);
  await page.waitForTimeout(4000);
  const hides = await barHidden();
  c.record(
    'Mouse focus in the bar',
    'click on Pause, click on Play, 4 s with no motion',
    `focus on "${focus}"; the bar hides: ${hides}`,
    focus === 'Pause' && hides,
  );

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  const tabs = await c.tabTo(named('Pause'));
  await page.waitForTimeout(4000);
  const stays = !(await barHidden());
  c.record(
    'Keyboard focus in the bar',
    `Tab x${tabs} to Pause, 4 s with no motion`,
    `the bar shows: ${stays}`,
    tabs > 0 && stays,
  );
  await context.close();
  return c.checks;
}

/**
 * Checks that the play button of the first screen does not move when the load of the samples
 * ends and the load text clears.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The results.
 */
async function checkFirstScreenPlace(browser: Browser, base: string): Promise<KeyCheck[]> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const c = new Checker(page, '1440 × 900');
  // A slow load keeps the load text on the screen: each request waits 300 ms more than the last.
  let requests = 0;
  await context.route('**/sf/**', async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, requests * 300));
    await route.continue();
  });
  const top = async (): Promise<number> =>
    (await page.locator(FIRST_PLAY).boundingBox())?.y ?? Number.NaN;
  await page.goto(base);
  // The top of the button in the same frame as the load text.
  const loading = await (
    await page.waitForFunction(
      () => {
        const status = document.querySelector('.first-screen .status');
        const button = document.querySelector('.first-screen .play');
        return status?.textContent && button ? button.getBoundingClientRect().y : null;
      },
      null,
      { timeout: 60_000 },
    )
  ).jsonValue();
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  await page.waitForTimeout(300);
  const ready = await top();
  c.record(
    'Play button of the first screen',
    '',
    `top ${loading} px while the samples load, ${ready} px when they are ready`,
    loading === ready,
  );
  await context.close();
  return c.checks;
}

/**
 * Checks a demo file that does not load (design 2.2, 2.8): at start, the page shows the message
 * with "Try again", the title of the demo, and the play button of the first screen. "Try again"
 * loads and plays the demo. A failed selection keeps the current piece and the URL hash, and
 * "Try again" then loads the selected demo and writes its hash.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The results.
 */
async function checkDemoFailure(browser: Browser, base: string): Promise<KeyCheck[]> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const c = new Checker(page, '1440 × 900');
  const demos = '**/demos/**';
  const state = (): Promise<string> =>
    page.evaluate(() => {
      const message = document.querySelector('.message');
      const shown = message instanceof HTMLElement && !message.hidden;
      const retry = document.querySelector('.message .retry');
      const play = document.querySelector('.first-screen .play');
      return [
        `message "${shown ? (message.querySelector('span')?.textContent ?? '') : ''}"`,
        `retry ${retry instanceof HTMLElement && !retry.hidden}`,
        `title "${document.querySelector('.title h2')?.textContent ?? ''}"`,
        `first play ${play instanceof HTMLElement && play.offsetParent !== null}`,
        `hash "${location.hash}"`,
      ].join('; ');
    });
  const failure = `message "${FILE_FAILURE_TEXT}"`;
  await context.route(demos, (route) => route.abort());
  await page.goto(base);
  await page.waitForSelector('.message:not([hidden])', { timeout: 60_000 });
  const atStart = await state();
  await context.unroute(demos);
  const tabs = await c.tabTo(named('Try again'));
  await c.press(['Enter']);
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const plays = (await c.attribute('.bar button[aria-label]', 'aria-label')) === 'Pause';
  c.record(
    'Demo file that does not load (start)',
    `Tab x${tabs} to Try again, Enter`,
    `${atStart}; Try again plays the demo: ${plays}`,
    atStart.startsWith(
      `${failure}; retry true; title "D'un matin de printemps"; first play true`,
    ) && plays,
  );

  const hashBefore = await page.evaluate(() => location.hash);
  await context.route(demos, (route) => route.abort());
  // A wide window opens the drawer at start (design 2.8).
  await c.tabTo((label) => label.includes('Ode to Joy'));
  await c.press(['Enter']);
  await page.waitForSelector('.message:not([hidden])', { timeout: 30_000 });
  const selected = await state();
  await context.unroute(demos);
  await c.tabTo(named('Try again'), true);
  await c.press(['Enter']);
  await page.waitForSelector('canvas[data-demo="beethoven-9"]', { timeout: 30_000 });
  const hashAfter = await page.evaluate(() => location.hash);
  c.record(
    'Demo file that does not load (selection)',
    'Enter on the Ode to Joy row, Shift+Tab to Try again, Enter',
    `${selected}; after Try again, hash "${hashAfter}"`,
    selected ===
      `${failure}; retry true; title "D'un matin de printemps"; first play false; hash "${hashBefore}"` &&
      hashAfter === '#demo=beethoven-9',
  );
  await context.close();
  return c.checks;
}

/**
 * Checks "Try again" after a failed selection and a later failure of the samples. The samples of
 * the default demo load slowly, a selection of the Ode to Joy fails, and then the samples of the
 * default demo fail. "Try again" of the second message loads the samples of the default demo
 * again, and does not select the Ode to Joy.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The results.
 */
async function checkRetryAfterFailedSelection(browser: Browser, base: string): Promise<KeyCheck[]> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const c = new Checker(page, '1440 × 900');
  // The requests of the samples wait until the check lets them fail.
  const held: Route[] = [];
  let failSamples = false;
  await context.route('**/sf/**', async (route) => {
    if (failSamples) {
      await route.abort();
    } else {
      held.push(route);
    }
  });
  await page.goto(base);
  await page.waitForSelector('canvas[data-demo="boulanger-matin"]', { timeout: 60_000 });
  await context.route('**/demos/**', (route) => route.abort());
  // A wide window opens the drawer at start (design 2.8).
  await page.click('button.demo:has-text("Ode to Joy")');
  await page.waitForSelector('.message:not([hidden])', { timeout: 30_000 });
  const first = (await page.textContent('.message span')) ?? '';
  failSamples = true;
  await Promise.all(held.map((route) => route.abort()));
  await page.waitForFunction(
    () => document.querySelector('.message span')?.textContent?.startsWith('The instruments'),
    null,
    { timeout: 30_000 },
  );
  await context.unrouteAll();
  await page.click('.message .retry');
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  const demo = await c.attribute('canvas', 'data-demo');
  c.record(
    'Try again after a failed selection and a failed load',
    'select the Ode to Joy (fails), the samples fail, click Try again',
    `first message "${first}"; Try again loads "${demo}"`,
    first.startsWith('The demo did not load.') && demo === 'boulanger-matin',
  );
  await context.close();
  return c.checks;
}

/**
 * Runs the keyboard check at one size.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @param width The width in CSS pixels.
 * @param height The height in CSS pixels.
 * @returns The results.
 */
async function checkSize(
  browser: Browser,
  base: string,
  width: number,
  height: number,
): Promise<KeyCheck[]> {
  const size = `${width} × ${height}`;
  const phone = width < 700;
  const { page, errors } = await openPage(browser, base, width, height);
  const c = new Checker(page, size);
  await checkDrawerAtStart(c, page, phone);
  await checkRepositoryLink(c, page);
  await checkBar(c, page, phone);
  await checkDrawer(c, page, phone);
  c.record(
    'Console',
    '',
    errors.length === 0 ? 'no errors' : errors.join('; '),
    errors.length === 0,
  );
  await page.close();
  return [...c.checks, ...(await checkRetry(browser, base, size, width, height))];
}

async function main(): Promise<void> {
  const root = join(import.meta.dirname, '..');
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    console.error('No build in dist/. Run pnpm build first.');
    process.exitCode = 1;
    return;
  }
  const server = await preview({ root, preview: { port: 4181, strictPort: false, open: false } });
  const base = server.resolvedUrls?.local[0] ?? 'http://localhost:4181/';
  const browser = await chromium.launch({ args: chromiumArgs(process.platform) });
  try {
    const checks = [
      ...(await checkSize(browser, base, 1440, 900)),
      ...(await checkSize(browser, base, 390, 844)),
      ...(await checkHiddenBarTap(browser, base)),
      ...(await checkPointerFocus(browser, base)),
      ...(await checkDemoFailure(browser, base)),
      ...(await checkRetryAfterFailedSelection(browser, base)),
      ...(await checkFirstScreenPlace(browser, base)),
      ...(await checkSelectPiece(browser, base)),
    ];
    console.log(checkTable(checks));
    const failed = failedChecks(checks);
    for (const line of failed) {
      console.error(line);
    }
    console.log(failed.length === 0 ? 'Keyboard check: pass' : 'Keyboard check: fail');
    process.exitCode = failed.length === 0 ? 0 : 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

if (import.meta.main) {
  await main();
}
