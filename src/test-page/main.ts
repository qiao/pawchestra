import './style.css';

import { playWithSilentSwitch } from '../app/audio-session.ts';
import { DEFAULT_VOLUME, volumeGain } from '../app/bar-rules.ts';
import { loadStudioBodies } from '../app/body-loads.ts';
import { runSliced } from '../app/slices.ts';
import { STOPPED, seekPlayState, startPlay } from '../app/transport.ts';
import type { PlayState } from '../app/transport.ts';
import { probeWebgl2 } from '../app/webgl.ts';
import type { Player } from '../audio/player.ts';
import { boundsOf } from '../gallery/items.ts';
import { keyName } from '../gallery/notes.ts';
import { CONDUCTOR } from '../models/cast.ts';
import type { SceneLayout } from '../models/layout.ts';
import { ModelCache } from '../models/model-cache.ts';
import { SPECIES } from '../models/species.ts';
import { POSE_SEED, headOf, preparePosesSteps } from '../pose/plan.ts';
import type { PosePlan } from '../pose/plan.ts';
import { createScenePose, poseAt } from '../pose/pose-at.ts';
import type { ScenePoseBuffer } from '../pose/pose-at.ts';
import { watchPixelRatio } from '../scene/pixel-ratio.ts';
import { startTierOf } from '../scene/quality.ts';
import { StageScene } from '../scene/stage-scene.ts';
import type { PreparedLayout } from '../scene/stage-scene.ts';
import { buildScoreSteps } from '../score/score.ts';
import { stageMix } from '../score/stage-mix.ts';
import type { Steps } from '../score/steps.ts';
import type { Score } from '../score/types.ts';
import { BAR_COVER } from '../shots/frame.ts';
import type { FrameCover } from '../shots/frame.ts';
import type { CameraPose } from '../shots/types.ts';
import { SilentClock } from './clock.ts';
import type { SongClock } from './clock.ts';
import { phraseFile, phraseOf } from './phrases.ts';
import { GROUP_TITLES, roleOfHash, testRoles } from './roles.ts';
import type { RoleGroup, TestRole } from './roles.ts';
import { soloLayoutSteps } from './solo-layout.ts';
import { viewCamera } from './views.ts';
import type { ViewName, ViewSubject } from './views.ts';

/**
 * The loop seeks back to 0 this much before the end of the phrase, in song seconds. The processor
 * pauses at the song length (design 6.5), so the seek comes first.
 */
const LOOP_EARLY_SEC = 0.03;

/**
 * The parts of the page over the canvas. The frame of the app stands above its bar (design 2.8).
 * The test page has no bar, and its panel floats over the canvas, so the frame moves down by half
 * the bar to the middle of the page.
 */
const PAGE_COVER: FrameCover = { right: 0, lift: -BAR_COVER / 2 };

/**
 * The space above the head bone of a player that the stage scene gives to the near limit of Free
 * mode (`playersTop()` of `scene/stage-scene.ts`), in meters.
 */
const HEAD_ROOM = 0.5;

/** The role with no hash or with a hash that names no role. */
const DEFAULT_ROLE = 'rabbit-violin';

/** The speeds of the speed buttons. */
const SPEEDS: ReadonlySet<number> = new Set([0.25, 0.5, 1]);

/** A role with its score, its layout, its pose plan, and its 3D scene, ready to show. */
interface Piece {
  readonly role: TestRole;
  readonly score: Score;
  readonly layout: SceneLayout;
  readonly plan: PosePlan;
  readonly poses: ScenePoseBuffer;
  readonly prepared: PreparedLayout;
  /** The player and its stage for the camera presets. */
  readonly subject: ViewSubject;
}

/** The audio of the page: the `Player` of the app, which loads after the first click. */
interface Audio {
  readonly player: Player;
  /** The piece whose samples are ready in the `Player`, or `null` during a load. */
  ready: Piece | null;
  /**
   * Tells if a load failed because a later load replaced it (design 6.8).
   *
   * @param error The error of the load.
   * @returns True for a `LoadReplacedError`.
   */
  readonly replaced: (error: Error) => boolean;
}

/**
 * Finds an element of the page.
 *
 * @param selector The CSS selector.
 * @param type The class of the element.
 * @returns The element.
 * @throws Error if the page has no such element.
 */
function element<T extends Element>(selector: string, type: abstract new () => T): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) {
    throw new Error(`The test page has no element "${selector}".`);
  }
  return found;
}

/**
 * Builds the score of the test phrase of a role, its layout, its pose plan, and its 3D scene, in
 * steps (design 7.1, "Test page"). The score rules of the app read the phrase, so the sound and
 * the motion come from one `Score`.
 *
 * @param role The role.
 * @param stage The 3D scene of the page.
 * @returns The steps, which return the piece.
 * @throws Error if the score rules refuse the phrase, or if the layout has no player.
 */
function* pieceSteps(role: TestRole, stage: StageScene): Steps<Piece> {
  const result = yield* buildScoreSteps(phraseFile(role.instrument), 'one-per-part');
  if (!result.ok) {
    throw new Error(`The test phrase of ${role.id} is not valid: ${result.error}.`);
  }

  const { score } = result;
  const models = new ModelCache();
  const layout = yield* soloLayoutSteps(score, role, models);
  const plan = yield* preparePosesSteps(score, layout, POSE_SEED, models);
  const poses = createScenePose(plan);
  // The first call of the pose code is slower, so it runs in a step before the first frame.
  poseAt(plan, 0, 0, STOPPED.transport, [], poses);
  yield;
  const prepared = yield* stage.prepareSteps(layout, models);

  const [place] = layout.players;
  if (!place) {
    throw new Error(`The layout of ${role.id} has no player.`);
  }
  const { species, instrument, kettles, support } = place.cast;
  const model = models.get(species, instrument, kettles, support);
  const head = headOf(model, place)[1];
  const subject = {
    top: boundsOf([model.mesh]).max[1],
    turn: 0,
    stageSide: layout.stageSide,
    playersTop: head + HEAD_ROOM,
  };
  return { role, score, layout, plan, poses, prepared, subject };
}

/**
 * The test page (design 7.1, "Test page"): one animal of the cast plays the test phrase of its
 * role in a loop, on the stage of the app, with its sound after the first click.
 */
class TestPage {
  readonly #stage: StageScene;
  readonly #roles = testRoles();
  readonly #select = element('#role', HTMLSelectElement);
  readonly #play = element('#play', HTMLButtonElement);
  readonly #sound = element('#sound', HTMLButtonElement);
  readonly #time = element('#time', HTMLInputElement);
  readonly #timeValue = element('#time-value', HTMLOutputElement);
  readonly #link = element('#link', HTMLAnchorElement);
  readonly #notes = element('#notes', HTMLPreElement);
  readonly #status = element('#status', HTMLParagraphElement);
  /** The shown piece, or `null` before the first build. */
  #piece: Piece | null = null;
  /** The role of the last pick, which a build makes into a piece. */
  #picked: TestRole | null = null;
  /** The end of the last build, so that the builds run one after the other. */
  #lastBuild: Promise<unknown> = Promise.resolve();
  /** The play state of the pose (design 5.2). A pause holds the pose and keeps it. */
  #state: PlayState = STOPPED;
  /** True while the user has paused the loop. */
  #paused = false;
  /** The song clock before the samples are ready, and after a failed load. */
  #silent = new SilentClock();
  /** The audio, or `null` before the first click on the sound button. */
  #audio: Audio | null = null;
  #muted = false;
  #speed = 1;
  /** False from a loop seek until the song time is in the first half of the phrase again. */
  #loopArmed = true;
  /** True while the user drags the time slider. */
  #dragging = false;
  /** The camera of a preset for the next frame, or `null`. */
  #view: CameraPose | null = null;

  /**
   * Creates the page and its controls, and picks the role of the URL hash.
   *
   * @param stage The 3D scene of the page.
   */
  constructor(stage: StageScene) {
    this.#stage = stage;
    this.#fillList();
    this.#select.addEventListener('change', () => {
      this.#pickId(this.#select.value);
    });
    window.addEventListener('hashchange', () => {
      this.#pickId(location.hash);
    });
    this.#play.addEventListener('click', () => {
      this.#togglePause();
    });
    this.#sound.addEventListener('click', () => {
      this.#clickSound();
    });
    this.#time.addEventListener('input', () => {
      this.#dragging = true;
      this.#seek(Number(this.#time.value));
    });
    this.#time.addEventListener('change', () => {
      this.#dragging = false;
    });
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="speed"]')) {
      input.addEventListener('change', () => {
        this.#setSpeed(Number(input.value));
      });
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      button.addEventListener('click', () => {
        this.#showView(button.dataset['view'] ?? 'front');
      });
    }
    this.#pickId(location.hash);
  }

  /** Fills the list with one option for each role, in one group for each kind of role. */
  #fillList(): void {
    const groups = new Map<RoleGroup, HTMLOptGroupElement>();
    for (const role of this.#roles) {
      let group = groups.get(role.group);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = GROUP_TITLES[role.group];
        groups.set(role.group, group);
        this.#select.append(group);
      }
      group.append(new Option(role.label, role.id));
    }
  }

  /**
   * Picks the role of a name, or the default role for a name that names no role. The URL hash
   * then names the role, so that a reload or a shared link shows it again.
   *
   * @param id The name, with or without the `#`.
   */
  #pickId(id: string): void {
    const role =
      roleOfHash(this.#roles, id) ?? roleOfHash(this.#roles, DEFAULT_ROLE) ?? this.#roles[0];
    if (!role || role === this.#picked) {
      return;
    }

    this.#picked = role;
    this.#select.value = role.id;
    history.replaceState(null, '', `#${role.id}`);
    this.#link.href = `#${role.id}`;
    this.#link.textContent = `Link to this role: ${location.pathname}#${role.id}`;
    this.#notes.textContent = phraseOf(role.instrument)
      .map((note) => `${note.start.toFixed(3)} ${note.length.toFixed(3)} ${keyName(note.key)}`)
      .join('\n');
    this.#showStatus(`Building ${role.label}.`);
    const build = this.#lastBuild.then(async () => this.#build(role));
    this.#lastBuild = build.catch(() => undefined);
    build.catch((error: Error) => {
      console.error(error);
      this.#showStatus(`The role did not build: ${error.message}`);
    });
  }

  /**
   * Builds the piece of a role in slices of the main thread (design 7.2), shows it, and starts its
   * loop. Only the studio body of the species loads, with the body of the bear and of the species
   * of the seat, because the layout of the app builds their models first (`layoutSceneSteps()`).
   *
   * @param role The role.
   */
  async #build(role: TestRole): Promise<void> {
    if (role !== this.#picked) {
      return;
    }
    const species = [role.species, role.seatSpecies, CONDUCTOR.species];
    await loadStudioBodies([...new Set(species.map((id) => SPECIES[id].body))]);
    const stage = this.#stage;
    const piece = await runSliced(pieceSteps(role, stage), () => role === this.#picked);
    if (!piece) {
      stage.cancelBuild();
      return;
    }

    this.#audio?.player.pause();
    if (this.#audio) {
      this.#audio.ready = null;
    }
    stage.show(piece.prepared);
    this.#piece = piece;
    this.#time.max = String(piece.score.durationSec);
    this.#view = viewCamera('front', piece.subject);
    this.#startLoop(piece);
    this.#showStatus('');
    this.#loadAudio(piece);
  }

  /**
   * Starts the loop of a new piece from the song start with the count-in and the lift of the app
   * (design 5.2, 5.4), on the silent clock until the samples are ready.
   *
   * @param piece The new piece.
   */
  #startLoop(piece: Piece): void {
    const silent = new SilentClock();
    silent.setRate(this.#speed);
    const first = startPlay(
      STOPPED,
      0,
      piece.score.durationSec,
      piece.plan.beats,
      performance.now() / 1000,
      this.#speed,
    );
    this.#state = first.state;
    this.#silent = silent;
    this.#loopArmed = true;
    if (!this.#paused) {
      silent.play(first.countInSec);
    }
  }

  /**
   * Gives the clock of the song time: the `Player` when the samples of the piece are ready, else
   * the silent clock.
   *
   * @returns The clock.
   */
  #clock(): SongClock {
    const audio = this.#audio;
    return audio && audio.ready === this.#piece ? audio.player : this.#silent;
  }

  /** Pauses the loop, or plays it again. A pause holds the pose at its song time. */
  #togglePause(): void {
    this.#paused = !this.#paused;
    this.#play.textContent = this.#paused ? 'Play' : 'Pause';
    const clock = this.#clock();
    if (this.#paused) {
      clock.pause();
    } else {
      clock.play(0);
    }
  }

  /**
   * Moves the song time of the loop.
   *
   * @param songSec The new song time, in seconds.
   */
  #seek(songSec: number): void {
    this.#clock().seek(songSec);
    this.#state = seekPlayState(this.#state, songSec);
    this.#loopArmed = true;
  }

  /**
   * Changes the speed of the loop and of the sound.
   *
   * @param speed The song seconds for each wall clock second.
   */
  #setSpeed(speed: number): void {
    if (!SPEEDS.has(speed)) {
      return;
    }
    this.#speed = speed;
    this.#silent.setRate(speed);
    this.#audio?.player.setRate(speed);
  }

  /** Starts the sound on the first click, then turns the mute on or off. */
  #clickSound(): void {
    if (!this.#audio) {
      this.#startAudio().catch((error: Error) => {
        console.error(error);
        this.#showStatus('The sound did not start. The animal plays with no sound.');
      });
      return;
    }
    this.#muted = !this.#muted;
    this.#audio.player.setVolume(volumeGain(DEFAULT_VOLUME, this.#muted));
    this.#showSoundButton();
  }

  /** Shows the state of the sound on its button. */
  #showSoundButton(): void {
    if (!this.#audio) {
      this.#sound.textContent = 'Start the sound';
      this.#sound.removeAttribute('aria-pressed');
      return;
    }
    this.#sound.textContent = 'Mute';
    this.#sound.setAttribute('aria-pressed', String(this.#muted));
  }

  /**
   * Loads the audio module of the app (design 6.3), creates its `Player` in the click, and loads
   * the samples of the shown piece.
   */
  async #startAudio(): Promise<void> {
    const { LoadReplacedError, WorkletPlayer } = await import('../audio/player.ts');
    // On iOS, the music plays with the silent switch on (design 2.4).
    playWithSilentSwitch(navigator);
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
    const player = new WorkletPlayer(
      baseUrl,
      (error) => {
        console.error(error);
        this.#showStatus('The sound stopped. The animal plays with no sound.');
        if (this.#audio) {
          this.#audio.ready = null;
        }
      },
      'hall',
    );
    player.setRate(this.#speed);
    player.setVolume(volumeGain(DEFAULT_VOLUME, this.#muted));
    player.context.resume().catch(() => undefined);
    this.#audio = {
      player,
      ready: null,
      replaced: (error) => error instanceof LoadReplacedError,
    };
    this.#showSoundButton();
    if (this.#piece) {
      this.#loadAudio(this.#piece);
    }
  }

  /**
   * Loads the samples of a piece into the `Player`. When they are ready, the `Player` takes the
   * song time of the silent clock and plays on from it, so the motion does not jump.
   *
   * @param piece The piece.
   */
  #loadAudio(piece: Piece): void {
    const audio = this.#audio;
    if (!audio) {
      return;
    }
    this.#showStatus('Loading the sound files.');
    const score = { ...piece.score, mix: stageMix(piece.score, piece.layout), gainDb: 0 };
    audio.player
      .load(score, () => undefined)
      .then(() => {
        if (piece !== this.#piece) {
          return;
        }
        const songSec = this.#silent.now();
        audio.player.seek(Math.max(0, songSec));
        if (!this.#paused) {
          audio.player.play(Math.max(0, -songSec));
        }
        audio.ready = piece;
        this.#showStatus('');
      })
      .catch((error: Error) => {
        if (!audio.replaced(error)) {
          console.error(error);
          this.#showStatus('The sound files did not load. The animal plays with no sound.');
        }
      });
  }

  /**
   * Moves the camera to a preset in the next frame. The orbit controls then turn the camera
   * around the player.
   *
   * @param name The name of the preset.
   */
  #showView(name: string): void {
    const piece = this.#piece;
    if (!piece || !isViewName(name)) {
      return;
    }
    this.#view = viewCamera(name, piece.subject);
  }

  /**
   * Shows a text in the status line.
   *
   * @param text The text, or an empty text for none.
   */
  #showStatus(text: string): void {
    this.#status.textContent = text;
  }

  /**
   * Poses the player from the song time, loops the phrase, and renders the stage (design 5.1). A
   * preset camera shows for one frame as the camera of a shot, and Free mode keeps it.
   */
  frame(): void {
    const piece = this.#piece;
    if (!piece) {
      return;
    }

    const wallTime = performance.now() / 1000;
    const clock = this.#clock();
    const { durationSec } = piece.score;
    let songTime = clock.now();
    if (this.#loopArmed && !this.#paused && songTime >= durationSec - LOOP_EARLY_SEC) {
      // A play during play does nothing, and a play after the end of the song plays from 0.
      clock.seek(0);
      clock.play(0);
      this.#state = seekPlayState(this.#state, 0);
      this.#loopArmed = false;
      songTime = 0;
    } else if (songTime < durationSec / 2) {
      this.#loopArmed = true;
    }

    const { plan, poses } = piece;
    const transport = this.#state.transport;
    this.#stage.render(this.#view, PAGE_COVER, null, (needed) =>
      poseAt(plan, songTime, wallTime, transport, [], poses, needed),
    );
    this.#view = null;
    const shown = Math.min(Math.max(0, songTime), durationSec);
    if (!this.#dragging) {
      this.#time.value = String(shown);
    }
    this.#timeValue.value = `${shown.toFixed(2)} s`;
  }
}

/**
 * Finds if a text names a camera preset.
 *
 * @param text The text.
 * @returns True for a preset of {@link ViewName}.
 */
function isViewName(text: string): text is ViewName {
  return text === 'front' || text === 'side' || text === 'back' || text === 'close';
}

/** A screen at or below this width starts with the panel folded (`style.css`). */
const NARROW_SCREEN = '(max-width: 600px)';

/**
 * Lets the button at the top of the panel fold and unfold the controls. On a narrow screen, such
 * as a phone, the panel covers the animal, so it starts folded.
 */
function foldPanel(): void {
  const toggle = element('#panel-toggle', HTMLButtonElement);
  const body = element('#panel-body', HTMLDivElement);
  const show = (open: boolean): void => {
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide the controls' : 'Show the controls';
  };
  toggle.addEventListener('click', () => {
    show(toggle.getAttribute('aria-expanded') !== 'true');
  });
  show(!window.matchMedia(NARROW_SCREEN).matches);
}

/**
 * Makes the 3D scene of the stage with the settings of the app, and runs the frames of the page.
 *
 * @param canvas The canvas of the stage.
 */
function start(canvas: HTMLCanvasElement): void {
  const targetFormat = probeWebgl2(document.createElement('canvas'));
  if (targetFormat === null) {
    element('#status', HTMLParagraphElement).textContent = 'This browser has no WebGL2.';
    return;
  }
  const stage = new StageScene(canvas, {
    tier: startTierOf(window),
    devicePixelRatio: window.devicePixelRatio,
    targetFormat,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  const page = new TestPage(stage);
  const resize = (): void => {
    stage.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
  };
  window.addEventListener('resize', resize);
  watchPixelRatio(window, resize);
  resize();
  const frame = (): void => {
    page.frame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

foldPanel();
start(element('#stage', HTMLCanvasElement));
