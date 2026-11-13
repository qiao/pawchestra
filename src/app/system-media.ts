import type { TitleLines } from './file-rules.ts';

/** The actions that the system media controls ask for (design 2.4). */
export interface SystemMediaActions {
  /** A play key of a headset, the lock screen, or a media key. */
  readonly onPlay: () => void;
  /** A pause key. */
  readonly onPause: () => void;
  /**
   * A seek of the system controls.
   *
   * @param songSec The seek point, in song seconds.
   */
  readonly onSeek: (songSec: number) => void;
}

/** The transport of one frame, for the system controls and the screen lock. */
export interface SystemMediaFrame {
  /** True while the transport plays. */
  readonly playing: boolean;
  /** The song time that the bar shows, in seconds. */
  readonly songSec: number;
  /** The song length, in seconds. */
  readonly durationSec: number;
  /** The speed of the bar. */
  readonly rate: number;
}

/**
 * The largest difference between the song time and the time that the system calculates from the
 * last position, in seconds. A larger difference is a seek, and the system gets the new position.
 */
const POSITION_SLOP_SEC = 1;

/** The size of `public/share.jpg`, the picture of the piece for the system (design 7.4). */
const ARTWORK_SIZE = '1200x630';

/**
 * The piece and the transport for the system (design 2.4): the Media Session gives the title, the
 * composer, and the picture to the lock screen, to a headset, and to the media keys, with the
 * actions play, pause, and seek. During play, a screen Wake Lock keeps the screen on, because a
 * phone locks its screen during a long piece with no touch. The lock goes at a pause and at the
 * end. The browser removes it when the tab hides, so a visible tab asks for it again.
 */
export class SystemMedia {
  /** The Media Session of the browser, or `null` when the browser has none. */
  readonly #session: MediaSession | null;
  /** The Wake Lock of the browser, or `null` when the browser has none. */
  readonly #wakeLock: WakeLock | null;
  /** The URL of the picture of the piece. */
  readonly #artwork: string;
  /** The document of the page, for the visibility of the tab. */
  readonly #page: Document;
  /** The lock of the screen, or `null` while the screen can lock. */
  #lock: WakeLockSentinel | null = null;
  /** True while a request for the lock waits for its answer. */
  #locking = false;
  /** True while the transport plays, from the last frame. */
  #playing = false;
  /** The song time that the system got last, in seconds. */
  #position = 0;
  /** The wall time at which the system got {@link #position}, in seconds. */
  #positionAt = 0;
  /** The speed that the system got last. */
  #rate = 1;

  /**
   * Connects the actions of the system controls.
   *
   * @param browser The navigator of the page.
   * @param page The document of the page, for the visibility of the tab.
   * @param artwork The absolute URL of the picture of the piece.
   * @param actions The actions of the system controls.
   */
  constructor(browser: Navigator, page: Document, artwork: string, actions: SystemMediaActions) {
    this.#session = 'mediaSession' in browser ? browser.mediaSession : null;
    this.#wakeLock = 'wakeLock' in browser ? browser.wakeLock : null;
    this.#artwork = artwork;
    this.#page = page;
    const session = this.#session;
    if (session) {
      setHandler(session, 'play', actions.onPlay);
      setHandler(session, 'pause', actions.onPause);
      setHandler(session, 'seekto', (details) => {
        if (details.seekTime !== undefined) {
          actions.onSeek(details.seekTime);
        }
      });
    }
    page.addEventListener('visibilitychange', () => {
      if (page.visibilityState === 'visible') {
        this.#followLock();
      }
    });
  }

  /**
   * Gives the title and the composer of a new piece to the system, with the picture of the site.
   *
   * @param lines The title lines of the piece.
   */
  showPiece(lines: TitleLines): void {
    if (!this.#session || !('MediaMetadata' in globalThis)) {
      return;
    }
    this.#session.metadata = new MediaMetadata({
      title: lines.title,
      artist: lines.composer,
      album: 'Pawchestra',
      artwork: [{ src: this.#artwork, sizes: ARTWORK_SIZE, type: 'image/jpeg' }],
    });
  }

  /**
   * Follows the transport in each frame. A change of the play state or a seek gives the system the
   * new state and position. A play asks for the screen lock, and a pause or the end releases it.
   *
   * @param frame The transport of the frame.
   * @param wallSec The wall time of the frame, in seconds.
   */
  follow(frame: SystemMediaFrame, wallSec: number): void {
    const changed = frame.playing !== this.#playing || frame.rate !== this.#rate;
    const expected =
      this.#position + (this.#playing ? (wallSec - this.#positionAt) * this.#rate : 0);
    const sought = Math.abs(frame.songSec - expected) > POSITION_SLOP_SEC;
    if (!changed && !sought) {
      return;
    }

    this.#playing = frame.playing;
    this.#rate = frame.rate;
    this.#position = frame.songSec;
    this.#positionAt = wallSec;
    this.#showPosition(frame);
    if (changed) {
      this.#followLock();
    }
  }

  /**
   * Gives the play state and the position to the system.
   *
   * @param frame The transport of the frame.
   */
  #showPosition(frame: SystemMediaFrame): void {
    const session = this.#session;
    if (!session) {
      return;
    }
    session.playbackState = frame.playing ? 'playing' : 'paused';
    const duration = Math.max(0, frame.durationSec);
    try {
      session.setPositionState({
        duration,
        playbackRate: frame.rate,
        position: Math.min(Math.max(0, frame.songSec), duration),
      });
    } catch {
      // An old browser has no position state. The title and the actions still work.
    }
  }

  /**
   * Asks for the screen lock while the transport plays and the tab is visible, and releases it
   * otherwise. A refused request leaves the screen as it is.
   */
  #followLock(): void {
    const wakeLock = this.#wakeLock;
    if (!wakeLock) {
      return;
    }
    if (!this.#playing) {
      const lock = this.#lock;
      this.#lock = null;
      lock?.release().catch(() => undefined);
      return;
    }
    if (this.#locking || (this.#lock && !this.#lock.released)) {
      return;
    }
    if (this.#page.visibilityState !== 'visible') {
      return;
    }
    this.#locking = true;
    wakeLock
      .request('screen')
      .then((lock) => {
        this.#locking = false;
        this.#lock = lock;
        // A pause during the request releases the new lock at once.
        if (!this.#playing) {
          this.#followLock();
        }
      })
      .catch(() => {
        // The browser can refuse the lock, for example in power save mode.
        this.#locking = false;
      });
  }
}

/**
 * Sets the handler of one action of the Media Session. A browser that does not know the action
 * throws, and the other actions still work.
 *
 * @param session The Media Session.
 * @param action The action.
 * @param handler The handler.
 */
function setHandler(
  session: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler,
): void {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // The browser does not support this action.
  }
}
