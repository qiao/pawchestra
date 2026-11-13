import type { DemoId } from '../app/demos.ts';
import type { SeatFlag } from '../app/seat-flags.ts';
import type { FrameRateSetting, QualitySetting } from '../app/settings.ts';
import type { SectionSize } from '../score/types.ts';
import { CLOSE_CREDITS_LABEL, CREDITS_TEXT, licensesUrl } from '../app/credits.ts';
import { REPOSITORY_LABEL } from '../app/page-title.ts';
import { DRAG_HINT_TEXT, TURN_HINT_TEXT } from '../app/camera-mode.ts';
import { PHONE_LAYOUT_QUERY } from '../app/phone-layout.ts';
import { COPY_LINK_TEXT, shareLink, shareStatusText } from '../app/share-link.ts';
import { isWideLayout } from '../app/wide-layout.ts';
import { Bar } from './bar.ts';
import type { BarActions } from './bar.ts';
import { Credits } from './credits.ts';
import { DemoList } from './demo-list.ts';
import { createButton, createElement } from './dom.ts';
import { Drawer } from './drawer.ts';
import { DropOverlay } from './drop-overlay.ts';
import { EndCard } from './end-card.ts';
import { FilePicker } from './file-picker.ts';
import { FirstScreen } from './first-screen.ts';
import { MessageBox } from './message-box.ts';
import { ModalDialog } from './modal-dialog.ts';
import { SeatList } from './seat-list.ts';
import { Settings } from './settings.ts';
import { Title } from './title.ts';
import { TitleCard } from './title-card.ts';
import { Tooltips } from './tooltip.ts';

/** The time of the fade of the stage before a build, in milliseconds, as in `ui.css`. */
const STAGE_FADE_MS = 150;

/** The time that the label of a clicked player stays, in milliseconds (design 2.3). */
const PICK_LABEL_MS = 2000;

/** The time that the status of "Copy link" stays, in milliseconds (design 2.8). */
const LINK_STATUS_MS = 4000;

/** The actions of all controls of the UI. */
interface UiActions extends BarActions {
  /** A click on the play button of the first screen. */
  readonly onFirstPlay: () => void;
  /** A click on "Watch as a film" of the first screen: the piece starts in Cinematic mode. */
  readonly onWatchFilm: () => void;
  /** A click on a row of the demo list. */
  readonly onSelectDemo: (id: DemoId) => void;
  /** A click on the row of the last file of the user. */
  readonly onSelectFile: () => void;
  /** A click on "Next: {title}" of the end card. */
  readonly onNextDemo: () => void;
  /** A file that the user selected with the file button or dropped on the page. */
  readonly onFile: (file: File) => void;
  /** A click on the mute or the solo button of a seat. */
  readonly onSeatFlag: (seatIndex: number, flag: SeatFlag) => void;
  /** A click on a button of the setting "Section size". */
  readonly onSectionSize: (size: SectionSize) => void;
  /** A click on a button of the setting "Quality". */
  readonly onQuality: (quality: QualitySetting) => void;
  /** A click on a button of the setting "Frame rate". */
  readonly onFrameRate: (frameRate: FrameRateSetting) => void;
  /** A click on "Try again" in the message of a failure. */
  readonly onRetry: () => void;
  /** A click on the close button of the message, or the Escape key in it. */
  readonly onCloseMessage: () => void;
}

/**
 * The UI over the canvas (design 2.3, 2.8): the title, the first screen, the bar, the drawer with
 * the tabs "Music" (the demo list and the file button), "Seats" (the seat list), and "Settings"
 * (the settings and the link "Credits"), the credits dialog, the message, and the drop overlay. The DOM order gives the focus order of 2.8:
 * the title, the bar, then the drawer. The play button of the first screen comes before the bar,
 * and the buttons of a message come after it.
 */
export class Ui {
  readonly title: Title;
  /** The title card of Cinematic mode at the song start (design 2.8). */
  readonly titleCard = new TitleCard();
  /** The end card at the song end (design 2.8). */
  readonly endCard: EndCard;
  readonly firstScreen: FirstScreen;
  readonly bar: Bar;
  readonly message: MessageBox;
  readonly drawer: Drawer;
  readonly demoList: DemoList;
  readonly seatList: SeatList;
  readonly settings: Settings;
  readonly credits = new Credits(licensesUrl(import.meta.env.BASE_URL));
  /** The modal dialog that holds the credits (design 2.8). */
  readonly creditsDialog: ModalDialog;
  readonly dropOverlay: DropOverlay;
  readonly tooltips: Tooltips;
  /** The hint "Drag to look around" above the bar in Free mode (design 2.8). */
  readonly #dragHint = createElement('div', 'drag-hint', DRAG_HINT_TEXT);
  /** The label of the seat of a clicked player (design 2.3). */
  readonly #pickLabel = createElement('div', 'pick-label');
  #pickTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #phone: MediaQueryList;
  /** The number of builds that cover the stage now. */
  #covers = 0;
  /** The root element of the page, which holds the sizes of the letterbox bars. */
  readonly #root: HTMLElement;
  /** The element that holds the UI, which gets the class `is-ui-hidden`. */
  readonly #parent: HTMLElement;
  /** The height of the top and the bottom bars of the letterbox that the page shows, in CSS px. */
  #letterboxHeight = 0;
  /** The width of each side bar of the letterbox that the page shows, in CSS pixels. */
  #letterboxWidth = 0;

  /**
   * Creates the UI and adds it to a parent element.
   *
   * @param parent The element that gets the UI, after the canvas.
   * @param actions The actions of the controls.
   * @param volume The position of the volume slider at start, from 0 to 100.
   * @param canFullScreen False if the browser has no full screen for the page.
   * @param target The window that gets the drags of files, with the media query of the phone
   *   layout and the size of the wide layout.
   */
  constructor(
    parent: HTMLElement,
    actions: UiActions,
    volume: number,
    canFullScreen: boolean,
    target: Window,
  ) {
    this.#root = parent.ownerDocument.documentElement;
    this.#parent = parent;
    // The static title of index.html stays in its place (design 2.8, 7.2).
    this.title = new Title(parent.querySelector<HTMLElement>(':scope > header.title'));
    this.tooltips = new Tooltips(target);
    this.tooltips.attach(this.title.repositoryLink, () => REPOSITORY_LABEL);
    // The close button gives the focus to the drawer button, as the Escape key does (design 2.4).
    this.drawer = new Drawer(() => {
      this.drawer.setOpen(false);
      this.bar.focusDrawerButton();
    });
    this.bar = new Bar(actions, volume, canFullScreen, this.tooltips);
    this.endCard = new EndCard({ onPlayAgain: actions.onPlay, onNext: actions.onNextDemo });
    this.firstScreen = new FirstScreen(
      actions.onFirstPlay,
      () => {
        this.openDemoList();
      },
      actions.onWatchFilm,
      () => {
        this.bar.focusPlay();
      },
    );
    this.message = new MessageBox({
      onRetry: actions.onRetry,
      onClose: actions.onCloseMessage,
      focusAfterClose: () => {
        this.bar.focusPlay();
      },
    });
    this.demoList = new DemoList(actions.onSelectDemo, actions.onSelectFile);
    // The file button stands below the demo list, because it also selects a piece (design 2.8).
    this.drawer.addTab(
      'demos',
      'Music',
      this.demoList.element,
      new FilePicker(actions.onFile).element,
    );
    this.seatList = new SeatList(actions.onSeatFlag, this.tooltips, () => {
      this.drawer.focusTab('seats');
    });
    this.drawer.addTab('seats', 'Seats', this.seatList.element);
    this.settings = new Settings(actions.onSectionSize, actions.onQuality, actions.onFrameRate);
    // The link "Credits" is a button, because it opens a dialog and goes to no page (design 2.8).
    this.creditsDialog = new ModalDialog(
      'credits-dialog',
      CREDITS_TEXT,
      CLOSE_CREDITS_LABEL,
      this.credits.element,
    );
    const creditsLink = createButton('text-link', '');
    creditsLink.textContent = CREDITS_TEXT;
    creditsLink.setAttribute('aria-haspopup', 'dialog');
    creditsLink.addEventListener('click', () => {
      this.creditsDialog.show(creditsLink);
    });
    const creditsLine = createElement('div', 'credits-line');
    creditsLine.append(this.#createCopyLink(target), creditsLink);
    this.drawer.addTab('settings', 'Settings', this.settings.element, creditsLine);
    // A wide window opens the drawer at start, at the tab "Music" (design 2.8).
    if (isWideLayout(target.innerWidth, target.innerHeight)) {
      this.drawer.setOpen(true);
    }
    this.dropOverlay = new DropOverlay(target, actions.onFile);
    // On a phone, the "Playback" group of the settings holds four controls of the bar (2.8).
    const phone = target.matchMedia(PHONE_LAYOUT_QUERY);
    this.#phone = phone;
    const placePlayback = (): void => {
      this.bar.placePlayback(phone.matches ? this.settings.playback : null);
    };
    phone.addEventListener('change', placePlayback);
    placePlayback();
    // A move of the static title would paint its text again, as a later contentful paint.
    if (this.title.element.parentElement !== parent) {
      parent.append(this.title.element);
    }
    // The hint is for a pointer, and a keyboard does not drag, so a screen reader skips it.
    this.#dragHint.setAttribute('aria-hidden', 'true');
    this.#dragHint.hidden = true;
    // A screen reader also hears the seat of a click on a player.
    this.#pickLabel.setAttribute('role', 'status');
    this.#pickLabel.hidden = true;
    // `ui.css` shows the hint only in Cinematic mode on a touch screen in portrait (design 2.5).
    const turnHint = createElement('p', 'turn-hint', TURN_HINT_TEXT);
    turnHint.setAttribute('aria-hidden', 'true');
    parent.append(
      this.titleCard.element,
      this.#dragHint,
      this.#pickLabel,
      turnHint,
      this.endCard.element,
      this.firstScreen.element,
      this.bar.element,
      this.message.element,
      this.drawer.element,
      this.creditsDialog.element,
      this.dropOverlay.element,
      this.tooltips.element,
    );
  }

  /**
   * Creates the button "Copy link" and its status line (design 2.2, 2.8). A touch device opens the
   * share sheet of the system, and another device copies the link into the clipboard. The status
   * line is a polite live region, and it clears after {@link LINK_STATUS_MS}.
   *
   * @param target The window of the page.
   * @returns The button and its status line.
   */
  #createCopyLink(target: Window): HTMLElement {
    const button = createButton('text-link', '');
    button.textContent = COPY_LINK_TEXT;
    const status = createElement('span', 'link-status');
    status.setAttribute('aria-live', 'polite');
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener('click', () => {
      const touch = target.matchMedia('(pointer: coarse)').matches;
      shareLink(target.navigator, target.location.href, target.document.title, touch)
        .then((result) => {
          clearTimeout(timer);
          status.textContent = shareStatusText(result);
          timer = setTimeout(() => {
            status.textContent = '';
          }, LINK_STATUS_MS);
        })
        .catch(reportError);
    });
    const group = createElement('span', 'copy-link');
    group.append(button, status);
    return group;
  }

  /**
   * Fades the stage to the page background before the app builds a new scene, and waits until the
   * fade ends and a frame shows it (design 2.8). The build then stops the frames behind the cover.
   * With reduced motion, the stage hides at once.
   *
   * @returns A promise that resolves when the stage is covered.
   */
  coverStage(): Promise<void> {
    this.#covers += 1;
    document.body.classList.add('is-building');
    return new Promise((resolve) => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      }, STAGE_FADE_MS);
    });
  }

  /**
   * Shows the stage again after a build. The cover stays for two more frames, so that the first
   * render of the new scene, with its uploads to the GPU, also happens behind it.
   */
  uncoverStage(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.#covers = Math.max(0, this.#covers - 1);
        if (this.#covers === 0) {
          document.body.classList.remove('is-building');
        }
      });
    });
  }

  /**
   * Opens the drawer at the demo list, and gives the focus to the row of the current demo (design
   * 2.8). The button "Select music" of the first screen uses it.
   */
  openDemoList(): void {
    this.drawer.showTab('demos');
    this.drawer.setOpen(true);
    this.demoList.element.scrollTop = 0;
    this.demoList.focusCurrent();
  }

  /**
   * Shows the seat of a clicked player above the point of the click for 2 s (design 2.3), for
   * example "Violins 1, 4 rabbits".
   *
   * @param text The text.
   * @param point The point of the click on the page, in CSS pixels.
   */
  showPickLabel(text: string, point: { readonly x: number; readonly y: number }): void {
    const label = this.#pickLabel;
    label.textContent = text;
    label.style.left = `${Math.round(point.x)}px`;
    label.style.top = `${Math.round(point.y)}px`;
    label.hidden = false;
    clearTimeout(this.#pickTimer);
    this.#pickTimer = setTimeout(() => {
      label.hidden = true;
    }, PICK_LABEL_MS);
  }

  /**
   * Shows or hides the hint "Drag to look around" (design 2.8).
   *
   * @param shown True to show it.
   */
  showDragHint(shown: boolean): void {
    if (this.#dragHint.hidden === shown) {
      this.#dragHint.hidden = !shown;
    }
  }

  /** True while the pointer is over a control of the title or over the open drawer. */
  get panelHovered(): boolean {
    return this.title.hovered || this.drawer.hovered;
  }

  /** True while a control of the title or the drawer shows the focus of the keyboard. */
  get panelFocused(): boolean {
    return this.title.focusShown || this.drawer.focusShown;
  }

  /**
   * Shows or hides the panels: the open drawer and the tooltips (design 2.3). The title always
   * shows. The hidden panels keep their place, their state, and their place in the focus order, so
   * that the drawer comes back open, and a Tab shows them again. They ignore the pointer, so that
   * the first tap only shows them. They fade in 0.2 s, at once with reduced motion.
   *
   * @param shown True to show them.
   */
  showPanels(shown: boolean): void {
    if (this.#parent.classList.contains('is-ui-hidden') !== shown) {
      return;
    }
    this.#parent.classList.toggle('is-ui-hidden', !shown);
    if (!shown) {
      this.tooltips.hide();
    }
  }

  /**
   * Gives the CSS the sizes of the bars of the letterbox of Cinematic mode (design 2.3, 2.5):
   * `--letterbox`, the height of the top and the bottom bars, and `--letterbox-side`, the width of
   * each side bar. The title stands at the top-left corner of the frame. The bar of the controls
   * keeps its place. It writes the DOM only when a size changes by half a pixel or more.
   *
   * @param height The height of the top and the bottom bars, in CSS pixels: 0 for none.
   * @param width The width of each side bar, in CSS pixels: 0 for none.
   */
  showLetterbox(height: number, width: number): void {
    this.#letterboxHeight = this.#showPixels('--letterbox', this.#letterboxHeight, height);
    this.#letterboxWidth = this.#showPixels('--letterbox-side', this.#letterboxWidth, width);
  }

  /**
   * Writes a size into a CSS variable of the root, rounded to half a pixel, when the rounded size
   * differs from the shown size.
   *
   * @param name The name of the CSS variable.
   * @param shown The size that the page shows, in CSS pixels.
   * @param size The new size, in CSS pixels.
   * @returns The rounded size, which the page now shows.
   */
  #showPixels(name: string, shown: number, size: number): number {
    const rounded = Math.round(size * 2) / 2;
    if (rounded !== shown) {
      this.#root.style.setProperty(name, `${rounded}px`);
    }
    return rounded;
  }

  /**
   * Closes the sheet of the phone layout after a selection in it, so that the new piece shows
   * (design 2.8). The drawer of a wider screen stays open, so that the user can select again. The
   * drawer button gets the focus that the sheet held, as after the Escape key.
   */
  closeSheetAfterSelection(): void {
    if (this.#phone.matches) {
      this.closeDrawer();
    }
  }

  /**
   * Closes the drawer (design 2.4, 2.8). The drawer button gets the focus that the drawer held, so
   * that the focus does not fall back to the page.
   */
  closeDrawer(): void {
    const refocus = this.drawer.focused;
    this.drawer.setOpen(false);
    if (refocus) {
      this.bar.focusDrawerButton();
    }
  }

  /**
   * Closes the drawer at the change to Cinematic mode (design 2.3, 2.8). The drawer button gets
   * the focus only when the focus in the drawer came from the keyboard. A focus from a click goes
   * away, so that the bar hides during play, no tooltip stays on the film, and Space plays and
   * pauses.
   */
  closeDrawerForFilm(): void {
    const focused = this.drawer.focused;
    const keyboard = this.drawer.keyboardFocused;
    const active = document.activeElement;
    if (focused && !keyboard && active instanceof HTMLElement) {
      active.blur();
    }
    this.drawer.setOpen(false);
    if (keyboard) {
      this.bar.focusDrawerButton();
    }
  }
}
