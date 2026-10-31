import type { DemoId } from '../app/demos.ts';
import type { SeatFlag } from '../app/seat-flags.ts';
import type { FrameRateSetting, QualitySetting } from '../app/settings.ts';
import type { SectionSize } from '../score/types.ts';
import { CLOSE_CREDITS_LABEL, CREDITS_TEXT, licensesUrl } from '../app/credits.ts';
import { REPOSITORY_LABEL } from '../app/page-title.ts';
import { PHONE_LAYOUT_QUERY } from '../app/phone-layout.ts';
import { isWideLayout } from '../app/wide-layout.ts';
import { Bar } from './bar.ts';
import type { BarActions } from './bar.ts';
import { Credits } from './credits.ts';
import { DemoList } from './demo-list.ts';
import { createButton, createElement } from './dom.ts';
import { Drawer } from './drawer.ts';
import { DropOverlay } from './drop-overlay.ts';
import { FilePicker } from './file-picker.ts';
import { FirstScreen } from './first-screen.ts';
import { MessageBox } from './message-box.ts';
import { ModalDialog } from './modal-dialog.ts';
import { SeatList } from './seat-list.ts';
import { Settings } from './settings.ts';
import { Title } from './title.ts';
import { Tooltips } from './tooltip.ts';

/** The time of the fade of the stage before a build, in milliseconds, as in `ui.css`. */
const STAGE_FADE_MS = 150;

/** The actions of all controls of the UI. */
interface UiActions extends BarActions {
  /** A click on the play button of the first screen. */
  readonly onFirstPlay: () => void;
  /** A click on a row of the demo list. */
  readonly onSelectDemo: (id: DemoId) => void;
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
  /** The link "Credits" at the end of the tab "Settings", which opens the credits dialog. */
  readonly creditsLink: HTMLButtonElement;
  readonly dropOverlay: DropOverlay;
  readonly tooltips: Tooltips;
  readonly #phone: MediaQueryList;
  /** The number of builds that cover the stage now. */
  #covers = 0;

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
    this.firstScreen = new FirstScreen(
      actions.onFirstPlay,
      () => {
        this.openDemoList();
      },
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
    this.demoList = new DemoList(actions.onSelectDemo);
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
    this.creditsLink = creditsLink;
    const creditsLine = createElement('div', 'credits-line');
    creditsLine.append(creditsLink);
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
    parent.append(
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
   * Closes the sheet of the phone layout after a selection in it, so that the new piece shows
   * (design 2.8). The drawer of a wider screen stays open, so that the user can select again. The
   * drawer button gets the focus that the sheet held, as after the Escape key.
   */
  closeSheetAfterSelection(): void {
    if (!this.#phone.matches || !this.drawer.open) {
      return;
    }
    const refocus = this.drawer.focused;
    this.drawer.setOpen(false);
    if (refocus) {
      this.bar.focusDrawerButton();
    }
  }
}
