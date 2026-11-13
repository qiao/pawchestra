import './style.css';

import { playWithSilentSwitch } from '../app/audio-session.ts';
import { DEFAULT_VOLUME, volumeGain } from '../app/bar-rules.ts';
import { loadStudioBodies } from '../app/body-loads.ts';
import { runSliced } from '../app/slices.ts';
import {
  STOPPED,
  changeAudibility,
  seekPlayState,
  setPlaying,
  startPlay,
} from '../app/transport.ts';
import type { PlayState } from '../app/transport.ts';
import { probeWebgl2 } from '../app/webgl.ts';
import type { Player } from '../audio/player.ts';
import { boundsOf } from '../gallery/items.ts';
import { keyName } from '../gallery/notes.ts';
import type { TestNote } from '../gallery/notes.ts';
import { CONDUCTOR } from '../models/cast.ts';
import { SMALLEST_STAGE, layoutSceneSteps } from '../models/layout-scene.ts';
import type { SceneLayout } from '../models/layout.ts';
import type { Vec3 } from '../models/tuples.ts';
import { ModelCache } from '../models/model-cache.ts';
import { SPECIES } from '../models/species.ts';
import { POSE_SEED, headOf, preparePosesSteps } from '../pose/plan.ts';
import type { PosePlan } from '../pose/plan.ts';
import { createScenePose, poseAt } from '../pose/pose-at.ts';
import type { ScenePoseBuffer } from '../pose/pose-at.ts';
import type { ScenePose, SeatAudibility, Transport } from '../pose/types.ts';
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
import { conductorPhrase } from './conductor-phrase.ts';
import { partsFile, phraseFile, phraseOf } from './phrases.ts';
import { roleOfHash, rolesBySpecies, testRoles } from './roles.ts';
import type { ConductorRole, PlayerRole, TestRole } from './roles.ts';
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

/** The flag of rest mode after the role in the URL hash: `#rabbit-violin&rest`. */
const REST_FLAG = 'rest';

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
  /**
   * The poses that the stage shows: all poses of the plan, or only the pose of the conductor when
   * the stage hides the players of the phrase.
   */
  readonly shown: ScenePose;
  /**
   * The flags of the poses that `poseAt()` calculates when the stage shows only the conductor: 0
   * for each player, then the flag of the conductor. `null` when the stage shows all poses.
   */
  readonly hidden: Uint8Array | null;
  /** The animal and its stage for the camera presets. */
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
 * Builds the score of a test file with the score rules of the app, in steps.
 *
 * @param file The bytes of the test file.
 * @param role The role, for the error text.
 * @returns The steps, which return the score.
 * @throws Error if the score rules refuse the file.
 */
function* scoreSteps(file: Uint8Array, role: TestRole): Steps<Score> {
  const result = yield* buildScoreSteps(file, 'one-per-part');
  if (!result.ok) {
    throw new Error(`The test phrase of ${role.id} is not valid: ${result.error}.`);
  }
  return result.score;
}

/**
 * Builds the score of the test phrase of a player role, its layout, its pose plan, and its 3D
 * scene, in steps (design 7.1, "Test page"). The score rules of the app read the phrase, so the
 * sound and the motion come from one `Score`.
 *
 * @param role The role.
 * @param stage The 3D scene of the page.
 * @returns The steps, which return the piece.
 * @throws Error if the score rules refuse the phrase, or if the layout has no player.
 */
function* playerPieceSteps(role: PlayerRole, stage: StageScene): Steps<Piece> {
  const score = yield* scoreSteps(phraseFile(role.instrument), role);
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
  return { role, score, layout, plan, poses, prepared, shown: poses, hidden: null, subject };
}

/**
 * Moves each place of a layout so that the podium center is at the stage center.
 *
 * @param layout The layout of an orchestra.
 * @returns The moved layout.
 */
function podiumAtCenter(layout: SceneLayout): SceneLayout {
  const [px, , pz] = layout.podium;
  const move = <T extends { readonly position: Vec3 }>(place: T): T => {
    const [x, y, z] = place.position;
    return { ...place, position: [x - px, y, z - pz] };
  };
  return {
    ...layout,
    podium: [0, layout.podium[1], 0],
    conductor: layout.conductor ? move(layout.conductor) : null,
    players: layout.players.map(move),
    stands: layout.stands.map(move),
  };
}

/**
 * Builds the piece of the conductor in steps (design 7.1, "Test page"): the score of the phrase of
 * the conductor (`conductorPhrase()`), the layout of the app with the podium at the stage center,
 * and the pose plan of all its animals. The stage shows only the podium and the conductor on the
 * smallest stage, so that the conductor is at the center of the views as a player is. The sound
 * plays all parts, and the cues turn to the places of the hidden players.
 *
 * @param role The role of the conductor.
 * @param stage The 3D scene of the page.
 * @returns The steps, which return the piece.
 * @throws Error if the score rules refuse the phrase, or if the layout has no conductor.
 */
function* conductorPieceSteps(role: ConductorRole, stage: StageScene): Steps<Piece> {
  const score = yield* scoreSteps(partsFile(conductorPhrase()), role);
  const models = new ModelCache();
  const layout = podiumAtCenter(yield* layoutSceneSteps(score, models));
  const { conductor } = layout;
  if (!conductor) {
    throw new Error(`The layout of ${role.id} has no conductor.`);
  }
  const plan = yield* preparePosesSteps(score, layout, POSE_SEED, models);
  const poses = createScenePose(plan);
  poseAt(plan, 0, 0, STOPPED.transport, [], poses);
  yield;
  const alone = { ...layout, stageSide: SMALLEST_STAGE, players: [], stands: [], risers: [] };
  const prepared = yield* stage.prepareSteps(alone, models);

  const model = models.get(CONDUCTOR.species, CONDUCTOR.instrument);
  const subject = {
    top: conductor.position[1] + boundsOf([model.mesh]).max[1],
    turn: Math.PI,
    stageSide: alone.stageSide,
    // The stage takes the top of its players for the near limit, and it shows no player.
    playersTop: 0,
  };
  const hidden = new Uint8Array(plan.players.length + 1);
  const shown = { players: [], conductor: poses.conductor };
  return { role, score, layout, plan, poses, prepared, shown, hidden, subject };
}

/**
 * Builds the piece of a role in steps (design 7.1, "Test page").
 *
 * @param role The role.
 * @param stage The 3D scene of the page.
 * @returns The steps, which return the piece.
 */
function pieceSteps(role: TestRole, stage: StageScene): Steps<Piece> {
  return role.group === 'conductor'
    ? conductorPieceSteps(role, stage)
    : playerPieceSteps(role, stage);
}

/**
 * Poses the animals of a piece for one frame (design 5.1). When the stage shows only the
 * conductor, the frame poses only the conductor.
 *
 * @param piece The piece.
 * @param songTime The song time, in seconds.
 * @param wallTime The wall clock time, in seconds.
 * @param transport The play state of the pose.
 * @param audibility The audibility of each seat: silent in rest mode.
 * @param needed The flags of the stage: one for each shown player, then one for the conductor.
 * @returns The poses that the stage shows.
 */
function posePiece(
  piece: Piece,
  songTime: number,
  wallTime: number,
  transport: Transport,
  audibility: readonly (SeatAudibility | undefined)[],
  needed: Uint8Array,
): ScenePose {
  const { plan, poses, hidden } = piece;
  if (!hidden) {
    return poseAt(plan, songTime, wallTime, transport, audibility, poses, needed);
  }
  hidden[plan.players.length] = needed[0] ?? 1;
  poseAt(plan, songTime, wallTime, transport, audibility, poses, hidden);
  return piece.shown;
}

/**
 * Gives the audibility of each seat of a score in a mode, with no move: a silent seat holds the
 * rest pose from the first frame.
 *
 * @param score The score.
 * @param rest True for rest mode.
 * @returns One entry for each seat, or no entry in play mode.
 */
function settledAudibility(score: Score, rest: boolean): (SeatAudibility | undefined)[] {
  return rest
    ? score.seats.map(() => changeAudibility(undefined, false, Number.NEGATIVE_INFINITY))
    : [];
}

/**
 * Gives the notes of the test phrase of a role as text: one line for each note, with the start
 * and the length in seconds, and the key. A line of the conductor also names the instrument.
 *
 * @param role The role.
 * @returns The text.
 */
function notesText(role: TestRole): string {
  const text = (note: TestNote): string =>
    `${note.start.toFixed(3)} ${note.length.toFixed(3)} ${keyName(note.key)}`;
  if (role.group !== 'conductor') {
    return phraseOf(role.instrument).map(text).join('\n');
  }
  return conductorPhrase()
    .flatMap((part) => part.notes.map((note) => `${part.instrument} ${text(note)}`))
    .join('\n');
}

/**
 * The test page (design 7.1, "Test page"): one animal of the cast plays the test phrase of its
 * role in a loop, on the stage of the app, with its sound after the first click.
 */
class TestPage {
  readonly #stage: StageScene;
  readonly #roles = testRoles();
  readonly #list = element('#role-list', HTMLDivElement);
  readonly #roleName = element('#role-name', HTMLParagraphElement);
  /** The button of each role in the list, by the name of the role. */
  readonly #roleButtons = new Map<string, HTMLButtonElement>();
  readonly #play = element('#play', HTMLButtonElement);
  readonly #sound = element('#sound', HTMLButtonElement);
  readonly #time = element('#time', HTMLInputElement);
  readonly #timeValue = element('#time-value', HTMLOutputElement);
  readonly #link = element('#link', HTMLAnchorElement);
  readonly #notes = element('#notes', HTMLPreElement);
  readonly #status = element('#status', HTMLParagraphElement);
  readonly #modes = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');
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
  /**
   * True in rest mode: each player holds the rest pose of a long rest, and the page makes no
   * sound. The conductor holds its rest pose of a pause.
   */
  #rest = false;
  /** The audibility of each seat of the shown piece: all seats silent in rest mode (design 5.5). */
  #audibility: (SeatAudibility | undefined)[] = [];
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
    window.addEventListener('hashchange', () => {
      this.#pickHash(location.hash);
    });
    for (const input of this.#modes) {
      input.addEventListener('change', () => {
        this.#setRest(input.value === REST_FLAG);
      });
    }
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
    this.#pickHash(location.hash);
  }

  /**
   * Fills the list of the roles: one group for each species, which a click on its title folds
   * and unfolds, with one button for each role. All groups start unfolded.
   */
  #fillList(): void {
    for (const { title, roles } of rolesBySpecies(this.#roles)) {
      const group = document.createElement('details');
      group.className = 'species';
      group.open = true;
      const summary = document.createElement('summary');
      summary.textContent = title;
      const items = document.createElement('ul');
      for (const role of roles) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = role.part;
        button.title = role.label;
        button.addEventListener('click', () => {
          this.#pickId(role.id);
        });
        this.#roleButtons.set(role.id, button);
        const item = document.createElement('li');
        item.append(button);
        items.append(item);
      }
      group.append(summary, items);
      this.#list.append(group);
    }
  }

  /**
   * Marks the button of the picked role in the list, and scrolls the list to it.
   *
   * @param role The picked role.
   */
  #markPicked(role: TestRole): void {
    for (const [id, button] of this.#roleButtons) {
      if (id === role.id) {
        button.setAttribute('aria-current', 'true');
        button.scrollIntoView({ block: 'nearest' });
      } else {
        button.removeAttribute('aria-current');
      }
    }
    this.#roleName.textContent = role.label;
  }

  /**
   * Picks the role and the mode of a URL hash, such as `#rabbit-violin&rest`.
   *
   * @param hash The hash, with or without the `#`.
   */
  #pickHash(hash: string): void {
    const [id = '', ...flags] = hash.replace(/^#/u, '').split('&');
    this.#setRest(flags.includes(REST_FLAG));
    this.#pickId(id);
  }

  /**
   * Gives the URL hash of a role in the current mode.
   *
   * @param role The role.
   * @returns The hash, with the `#`.
   */
  #hashOf(role: TestRole): string {
    return `#${role.id}${this.#rest ? `&${REST_FLAG}` : ''}`;
  }

  /**
   * Writes the role and the mode into the URL hash and into the link, so that a reload or a shared
   * link shows them again.
   *
   * @param role The role.
   */
  #showLink(role: TestRole): void {
    const hash = this.#hashOf(role);
    history.replaceState(null, '', hash);
    this.#link.href = hash;
    this.#link.textContent = `Link to this role: ${location.pathname}${hash}`;
  }

  /**
   * Changes to rest mode or to play mode (design 7.1). Each seat becomes silent or sounds again,
   * as a mute in the app does, so each player lowers or lifts its instrument (design 5.5). The
   * conductor has no seat, so the pose of the conductor pauses or plays, as a pause in the app
   * does (design 5.2).
   *
   * @param rest True for rest mode.
   */
  #setRest(rest: boolean): void {
    for (const input of this.#modes) {
      input.checked = input.value === (rest ? REST_FLAG : 'play');
    }
    if (rest === this.#rest) {
      return;
    }

    this.#rest = rest;
    this.#applyVolume();
    if (this.#picked) {
      this.#showLink(this.#picked);
    }
    const piece = this.#piece;
    if (!piece) {
      return;
    }
    const wallTime = performance.now() / 1000;
    const songTime = Math.max(0, this.#clock().now());
    this.#audibility = piece.score.seats.map((_, i) =>
      changeAudibility(this.#audibility[i], !rest, wallTime),
    );
    if (piece.role.group === 'conductor') {
      const state = setPlaying(this.#state, !rest, wallTime, songTime);
      // A play from rest mode starts in the phrase, so it has no count-in.
      this.#state = rest ? state : seekPlayState(state, songTime);
    }
  }

  /** Sets the volume of the sound: none when muted or in rest mode. */
  #applyVolume(): void {
    this.#audio?.player.setVolume(volumeGain(DEFAULT_VOLUME, this.#muted || this.#rest));
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
    this.#markPicked(role);
    this.#showLink(role);
    this.#notes.textContent = notesText(role);
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
    const species = [...role.bodies, CONDUCTOR.species];
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
    // In rest mode, the conductor holds the rest pose before the first play (design 5.2).
    this.#state = this.#rest && piece.role.group === 'conductor' ? STOPPED : first.state;
    this.#audibility = settledAudibility(piece.score, this.#rest);
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
    this.#applyVolume();
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
    player.setVolume(volumeGain(DEFAULT_VOLUME, this.#muted || this.#rest));
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

    const transport = this.#state.transport;
    const audibility = this.#audibility;
    this.#stage.render(this.#view, PAGE_COVER, null, (needed) =>
      posePiece(piece, songTime, wallTime, transport, audibility, needed),
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

/**
 * A screen at or below this width starts with the panel folded, and shows the list of the roles
 * as a drawer (`style.css`).
 */
const NARROW_SCREEN = '(max-width: 600px)';

/**
 * Lets the button at the top left of a narrow screen open and close the list of the roles as a
 * drawer. A pick of a role closes the drawer, so the animal shows. On a wide screen, the list
 * always shows at the left side, and the button does not show.
 */
function roleDrawer(): void {
  const toggle = element('#roles-toggle', HTMLButtonElement);
  const drawer = element('#roles', HTMLElement);
  const narrow = window.matchMedia(NARROW_SCREEN);
  const show = (open: boolean): void => {
    drawer.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide the roles' : 'Show the roles';
  };
  toggle.addEventListener('click', () => {
    show(toggle.getAttribute('aria-expanded') !== 'true');
  });
  element('#role-list', HTMLDivElement).addEventListener('click', (event) => {
    if (narrow.matches && event.target instanceof HTMLButtonElement) {
      show(false);
    }
  });
  show(false);
}

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
roleDrawer();
start(element('#stage', HTMLCanvasElement));
