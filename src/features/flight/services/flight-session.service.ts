import { createFlightHud } from './flight-hud.adapter.ts';
import { nearestFlightZone } from './flight-navigation.service.ts';
import { connectFlightControls } from './flight-input.adapter.ts';
import { createFlightEffects } from '../presentation/flight-effects.ts';
import { readProgress, writeProgress } from '../../../adapters/browser/flight-progress.service.ts';
import { readKit, clearKit } from '../../../adapters/browser/kit-storage.service.ts';
import type { FlightInput, AirSample, Vector3 } from '../../../domains/flight/models.ts';
import type { RenderedFlight } from '../presentation/flight-view.ts';
import type { GameAddress, RunResult, BotResult, WorldResult, ResolvedSky, GoodLiftHost, FlightControls } from '../../good-lift/good-lift.models.ts';
import type { FlightPanel } from '../flight.models.ts';
import type { createGoodLift } from '../../good-lift/services/good-lift-session.service.ts';
import type { createTrainingSession } from '../../../domains/good-lift/training-session.ts';
import type { LessonId } from '../../../domains/good-lift/trick-lessons.ts';
import { createFlightAudio, type AudioVoice } from './flight-audio.adapter.ts';
import { createFlightCamera } from './flight-camera.adapter.ts';
import { createFlightScene } from '../../../adapters/rendering/flight-scene.adapter.ts';
import { FLIGHT_MARKUP } from '../presentation/flight-markup.ts';
import * as THREE from 'three';
import { WORLD, ZONES, STONES, THERMALS, START, GATEWAY, centerX, heightAt, surfaceAt } from '../../../adapters/rendering/terrain.ts';
import { PROJECT_PROPS, loadModel, prefetchModel } from '../../../adapters/rendering/scenery.ts';
import { ACHIEVEMENTS, GAME_STORE, beltFor, emptyProgress } from '../../../domains/progression/achievements.ts';
import { scoreLanding, createLandingLeg } from '../../../domains/flight/landing.ts';
import { FJORD_THERMALS, sampleFjordAir, fjordWindAt } from '../../../domains/flight/atmosphere.ts';
import { createFlightView } from '../presentation/flight-view.ts';
import { createFlightCues } from '../presentation/flight-cues.ts';
import { createFlightOverlay } from '../presentation/flight-overlay.ts';
import { createSkyPreparation } from './sky-preparation.ts';
import { createFlightCoach } from '../../../domains/coaching/flight-coach.ts';
import { createCoachIntent } from '../../../domains/coaching/coach-intent.ts';
import { createLiftGuide } from '../../../domains/coaching/lift-guide.ts';
import { createCoachView } from '../presentation/coach-view.ts';
import { createBrakeDrag } from '../../../domains/flight/brake-drag.ts';
import { createBrakeInput } from '../../../domains/flight/brake-input.ts';
import { brakeByte, summarizeControls } from '../../../domains/flight/brake-controls.ts';
import { interruptsLift, resolveCoachMessage } from '../../../domains/coaching/coach-routing.ts';
import { createPlateNotice, createWindNotice } from '../presentation/wind-feedback.ts';
import { crossesGateway } from '../../../domains/flight/gateway.ts';
import { FLIGHT, createFlight, releaseFlight, settleFlight, stepFlight } from '../../../domains/flight/flight.ts';
import { stallEffects, brakeMeter } from '../presentation/stall-effects.ts';
import { createSwingWatch } from '../../../domains/coaching/swing-watch.ts';
import { swingGauge } from '../presentation/swing-gauge.ts';
import { holdHint } from '../presentation/hints.ts';
import { fjordHint } from '../presentation/fjord-hints.ts';
import { createLost } from '../presentation/lost.ts';
import { createWindStreaks } from '../../../adapters/rendering/wind-streaks.ts';
import { createVario } from '../presentation/vario.ts';
import { createThermalAir, showThermalAir } from '../presentation/thermal-air.ts';
import { sameGame } from '../../../domains/good-lift/good-lift-address.ts';
import { normalizeKit } from '../../../domains/progression/wing-kit.ts';
import '../game.css';

type Zone = (typeof ZONES)[number];
const { clamp } = THREE.MathUtils;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const STEP = 1 / 60;

// How many times faster the flight runs while flying itself to a place.
const HASTE = 3;

// The arch is the door into Good Lift. Within `near` metres of it and closing on it faster than
// `closing` m/s, the game beyond starts to load, with the `models` it draws, so the warp through it
// has them in hand. Launch is 127 m from the arch and the way to the hall passes 80 m from it, so
// an ordinary flight over the fjord fetches none of it.
const PORTAL = Object.freeze({ near: 70, closing: 3, models: Object.freeze(['raven', 'clouds', 'kettlebell']) });
// What the arch opens: today's Daily Sky.
const DAILY = Object.freeze({ kind: 'daily', sky: null, vs: null, bad: null });
const TRAINING = Object.freeze({ kind: 'training', sky: null, vs: null, bad: null } as const);

/**
 * Builds the fjord inside `stage` and starts drawing it as an idle backdrop: the glider circles and
 * nothing listens for input. `fly()` hands control to the visitor; `idle()` takes it back.
 *
 * hooks.onPanel({ id, path } | null)  a landing opened or closed its panel
 * hooks.onProgress(progress)          achievements or visited places changed
 * hooks.onExit()                      the visitor asked to leave the flight
 * hooks.onLost(stage)                 a beat of the missing-page emergency (see lost.js)
 * hooks.onResult(result | null)       a run of Good Lift ended, or its result was put away
 * hooks.onPortal()                    the glider flew through the arch: the page warps into Good
 *                                     Lift and prepares its one ready screen
 * hooks.onFjord()                     the visitor asked to leave Good Lift for the fjord: the page
 *                                     changes the address and calls fly()
 * hooks.onMusic(on)                   Good Lift's music was switched on or off, from anywhere
 * hooks.onBots(bots)                  the bots landed on the sky a meet sheet shows: its medals,
 *                                     TST for its board and any feat that earned (good-lift.js
 *                                     askBots); apart from onResult, so the sheet keeps its focus
 * hooks.onWorld(world)                the world board answered for the Daily Sky a meet sheet shows:
 *                                     its best runs, where this browser stands and what became of
 *                                     the run sent (good-lift.js shareWorld); apart from onResult too
 */
export interface FlightHooks {
  onExit?(): void; onProgress?(progress: ReturnType<typeof readProgress>): void;
  onLost?(stage: string): void; onResult?(result: RunResult | null): void;
  onMusic?(on: boolean): void; onBots?(bots: BotResult): void; onWorld?(world: WorldResult): void;
  onPortal?(address?: GameAddress): void; onFjord?(): void; onPanel?(panel: FlightPanel | null): void;
}
export function createGame(stage: HTMLElement, hooks: FlightHooks = {}) {
  stage.insertAdjacentHTML('beforeend', FLIGHT_MARKUP);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = stage.querySelector<T>(selector);
    if (!element) throw new Error(`Flight view is missing ${selector}`);
    return element;
  };
  const hud = (name: string) => $(`[data-hud="${name}"]`);
  const listeners = new AbortController();
  const overlayFocus = createFlightOverlay(stage, listeners.signal);
  function on<K extends keyof (WindowEventMap & DocumentEventMap)>(target: EventTarget, type: K, handler: (event: (WindowEventMap & DocumentEventMap)[K]) => void) {
    target.addEventListener(type, handler as EventListener, { signal: listeners.signal });
  }

  // ---------------------------------------------------------------- scene

  const { renderer, scene, camera, terrain, sky, places, thermals, glider, gateway, composer, patch } = createFlightScene($<HTMLCanvasElement>('.fj-scene'));
  // What the visitor flies in (wing-kit.js), worn from the first frame, so the hero wears it too.
  // Only Good Lift changes the kit kept (its kit tab through setKit, and the end of a run), keeping
  // only what has been earned; fjord.wear tries one on without keeping it. The run reads the chalk
  // from here.
  let kit = readKit();
  function wear(next: Partial<ReturnType<typeof readKit>> | null | undefined) {
    kit = normalizeKit(next);
    glider.setKit(kit);
    return { ...kit };
  }
  wear(kit);
  // The game beyond the arch (good-lift.js), loaded and made the first time a run is wanted, and
  // `portal` set while the flight holds still for it: through the arch, or while it loads.
  let run: ReturnType<typeof createGoodLift> | null = null;
  function requireRun() { if (!run) throw new Error('No Good Lift run is loaded'); return run; }
  let runLoading: Promise<ReturnType<typeof createGoodLift> | null> | null = null;
  let runModuleFailed = false;
  let training: ReturnType<typeof createTrainingSession> | null = null;
  let trainingLoading: Promise<void> | null = null;
  let returnGame: GameAddress = DAILY;
  let portal = false;
  // The Good Lift address being played (good-lift-address.js), and the sky it came to: what R
  // flies again, though practice draws a new one every requireRun().
  let game: GameAddress | null = null;
  let gameSky: ResolvedSky | null = null;
  // The sky the run being flown is really on: `gameSky`, unless a seed pinned from the console
  // overrides it, when it is flown as a named sky (no day's Daily Sky, no board, no daily log).
  let flownSky: ResolvedSky | null = null;
  // Whether the game beyond the arch would not load when fetched ahead of the arch, so the flight
  // does not ask again every step; and whether the glider is closing on the arch right now.
  let prefetchFailed = false;
  let archNear = false;
  const inGame = () => mode === 'cloudbase' || mode === 'cloudbase-ended' || mode === 'training' || portal;

  let useBloom = true;

  // The lens widens for a moment in a warp and stays a little wide while boosting.
  const lens = { base: 60, was: 60, now: 60, warp: 0, rising: false };

  // The scene fills its stage: the hero while idle, the whole window in flight.
  const view = { width: 1, height: 1, centred: false };
  function resize() {
    // Where the page gives the scene a frame of its own, it asks for the glider dead centre.
    view.centred = getComputedStyle(stage).getPropertyValue('--centred').trim() === '1';
    view.width = Math.max(1, stage.clientWidth);
    view.height = Math.max(1, stage.clientHeight);
    renderer.setSize(view.width, view.height, false);
    composer.setSize(view.width, view.height);
    const scale = renderer.getPixelRatio();
    patch.uniforms.uTexel.value.set(1 / (view.width * scale), 1 / (view.height * scale));
    camera.aspect = view.width / view.height;
    lens.base = camera.aspect < 1 ? 75 : 60; // a wider lens keeps the wing in frame on a phone held upright
    camera.fov = lens.now = lens.base + lens.now - lens.was;
    lens.was = lens.base;
    camera.updateProjectionMatrix();
  }
  const sizeWatch = new ResizeObserver(resize);
  sizeWatch.observe(stage);
  resize();

  // ---------------------------------------------------------------- state

  // The glider's flight, stepped by flight.js. It keeps this vector, which the scene draws with.
  const g = createFlight(new THREE.Vector3(START.x, START.y, START.z));
  g.yaw = START.yaw;
  settleFlight(g);
  const flightView = createFlightView(g);
  let renderedFlight: RenderedFlight | null = null;
  // What the pilot asks of the wing and the air it is in, filled afresh at every step.
  const controls: FlightControls = { turn: 0, brake: false, deepBrake: false, bar: false, ears: false, locked: false, steered: false, climb: null };
  // What the wing's swings are doing over the fjord (swing-watch.js); a run keeps its own.
  const fjordWatch = createSwingWatch();
  const air: AirSample & { lift: number; sink: number; windX: number; windY: number; windZ: number; calm: boolean; rough: number; clearance: number } = { lift: 0, sink: 0, windX: 0, windY: 0, windZ: 0, calm: false, rough: 0, clearance: Infinity };
  const vario = createVario();
  const thermalAir = createThermalAir();
  const thermalAirEl = $('.fj-thermal-air');
  vario.reset(g.vy);
  const windNotice = createWindNotice();
  const plateNotice = createPlateNotice();
  const input: FlightInput & { controlMode: 'brakes'; leftBrake: number; rightBrake: number; bar: boolean; ears: boolean } = { controlMode: 'brakes', leftBrake: 0, rightBrake: 0, bar: false, ears: false };
  const brakeDrag = createBrakeDrag();
  const brakeInput = createBrakeInput();
  brakeInput.state.device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
  stage.dataset.flightDevice = brakeInput.state.device;
  let flightControls: ReturnType<typeof connectFlightControls> | null = null;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const flightCues = createFlightCues({ element: $('.fj-flight-cues'), stage, camera, reducedMotion: () => motionPreference.matches });
  const dragTip = $('.fj-drag-tip');
  let hasDragged = false;
  let skipFlightClick = false;
  function releaseDrag({ confirm = false } = {}) {
    const id = brakeDrag.state.pointerId;
    // A moved or interrupted gesture cannot also select a pillar when its synthetic click arrives.
    if (brakeDrag.state.active && (brakeDrag.state.moved || !confirm)) skipFlightClick = true;
    brakeDrag.reset();
    input.leftBrake = input.rightBrake = 0;
    stage.classList.remove('brake-dragging');
    const canvas = $('.fj-scene');
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  let mode = 'intro'; // intro | flying | cloudbase | cloudbase-ended | landed | launching | lost
  const isAirborne = () => mode === 'flying' || mode === 'cloudbase' || mode === 'training';
  const landingLeg = createLandingLeg();
  const previousPosition = new THREE.Vector3();
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let revealShown = false;
  let cloudResult: RunResult | null = null;
  let mapOpen = false;
  let keysOpen = false;
  let resetConfirmOpen = false;
  let overlayChanged = false;
  // A run's briefing is up, the flight waiting at the gate until the pilot is ready (good-lift.js),
  // and the key that ended it, which does nothing until it is let go.
  let briefing = false;
  let swallowed: string | null = null;
  let auto: { label: string; place: string; x: number; h: number; id: string; z: number; side: number; off: number; r: number; }|null = null; // the place the glider is flying itself to, if any
  let hot: { label: string; place: string; x: number; h: number; id: string; z: number; side: number; off: number; r: number; }|null = null; // the place under the pointer
  let panel: FlightPanel | null = null;
  let climbStart = null;
  let outOfBounds = false;
  let time = 0;
  let airtime = 0;
  // How many times faster than the clock the flight is really running this frame.
  let haste = 1;
  // What a run is doing to the wing, the picture and the camera right now, eased frame by frame
  // toward what the run asks for (`want`, written by good-lift.js along with `floor`, the height of
  // its fog). None of it may outlive the requireRun().
  // A stall does its own things to the wing (`stall`, from stall-effects.js): `foldLeft` and
  // `foldRight` are each half of the wing as shown, from a strike or a stall, and `fold` the more
  // folded of the two. `stalled` is whether the stall has been heard, `deep` seconds the brake has
  // been deep, and `meter` what the brake meter shows (`meterShown`, what was last written to the page).
  // `stop` is the wall seconds a good lift still holds the flight still for (written by the run).
  // `tuck` is how far the wing is shown tucked under, and `heave` the side of the wing over a core
  // lifted as the moment to turn in comes (-1 left to 1 right, written by the run and dying away).
  const effects = createFlightEffects();

  const veilEl = $('.fj-veil');
  const strikeEl = $('.fj-strike');
  const hintEl = $('.fj-hint');
  // For looking at a run from the console: a seed to fly again, and the flight held still.
  let pinnedSeed: number|null = null;
  let held = false;
  const overlayOpen = () => mapOpen || keysOpen;
  const trainingOutcome = () => mode === 'training' && !!training && training.state.status !== 'flying';
  const flightPaused = () => overlayOpen() || held || portal || briefing || trainingOutcome();
  function syncFlightOverlay(restore = true) {
    overlayChanged = true;
    const kind = briefing ? 'briefing' : keysOpen ? 'menu' : mapOpen ? 'map' : !portal && trainingOutcome() ? 'training' : '';
    $('.fj-training-result').hidden = kind !== 'training';
    stage.classList.toggle('flight-paused', !!kind);
    if (kind) {
      run?.clearComboFeedback();
      stage.dataset.overlay = kind;
      overlayFocus.activate(kind === 'training' ? $('.fj-training-result') : briefing ? $('.fj-brief') : keysOpen ? $('.fj-keys') : resetConfirmOpen ? $('.fj-reset-confirm') : $('.fj-map'));
    } else {
      delete stage.dataset.overlay;
      overlayFocus.deactivate(restore);
    }
  }

  const progress = readProgress();
  progress.visited.forEach((id) => places.setVisited(id));
  function persist() {
    writeProgress(progress);
    hooks.onProgress?.({ ...progress });
  }

  function unlock(id: string) {
    if (progress.unlocked.includes(id)) return;
    const before = beltFor(progress);
    progress.unlocked.push(id);
    persist();
    const achievement = ACHIEVEMENTS.find((a) => a.id === id)!;
    toast(
      `<small>achievement ${progress.unlocked.length}/${ACHIEVEMENTS.length}</small><b>${achievement.name}</b>` +
        `<span>${achievement.text}</span><small>belt: ${before} → ${beltFor(progress)}</small>`,
    );
  }

  function clearInput() {
    releaseDrag();
    flightControls?.reset();
    brakeInput.reset();
  }

  function clearCloudResult() {
    cloudResult = null;
    hooks.onResult?.(null);
    stage.classList.remove('cloudbase-ended');
  }

  function syncCloudbaseEntry() {
    for (const button of stage.querySelectorAll<HTMLElement>('[data-do="cloudbase"]')) button.hidden = !progress.cloudbase.discovered || mode === 'cloudbase' || mode === 'training';
    for (const button of stage.querySelectorAll<HTMLElement>('[data-do="quit-cloudbase"]')) button.hidden = mode !== 'cloudbase';
    for (const button of stage.querySelectorAll<HTMLElement>('[data-do="training"]')) {
      button.hidden = mode === 'training'; button.textContent = mode === 'cloudbase' ? 'End run & open training' : 'Training';
    }
    for (const button of stage.querySelectorAll<HTMLElement>('[data-do="back-to-game"], .fj-menu-footer [data-do="training-choose"]')) button.hidden = mode !== 'training';
    // In Good Lift the places are out of reach, and the way to them is back to the fjord.
    const running = mode === 'cloudbase' || mode === 'cloudbase-ended' || mode === 'training';
    for (const button of stage.querySelectorAll<HTMLElement>('[data-do="fjord"]')) button.hidden = !running;
    for (const button of stage.querySelectorAll<HTMLElement>('.fj-map-list [data-place]')) button.hidden = running;
    $('.fj-keys-run').hidden = !progress.cloudbase.discovered;
  }

  // Opens the wing, clears the picture and forgets what the last run taught. Every way out of a
  // run comes through here, so a strike or a cloud can never follow the glider anywhere else.
  function clearRunEffects() {
    effects.fold = effects.veil = effects.veilShown = effects.shake = 0;
    effects.foldLeft = effects.foldRight = effects.luff = 0;
    effects.tuck = effects.heave = 0;
    effects.want.fold = effects.want.veil = effects.want.shake = effects.want.gaze = 0;
    effects.floor = -Infinity;
    effects.stop = 0;
    effects.stalled = false; effects.heard.frontal = false;
    releaseFlight(g);
    veilEl.style.opacity = '0';
    strikeEl.classList.remove('on');
    if (flightAudio.audio) flightAudio.audio.next = {};
  }

  // Something has struck the wing: flash the picture (the run makes the noise).
  function flashStrike() {
    if (calm) return;
    strikeEl.classList.remove('on');
    void strikeEl.offsetWidth; // reading the layout lets a flash that is still fading start again
    strikeEl.classList.add('on');
  }

  // The pilot is ready: the briefed run flies from here, its title card going as it does.
  function endBriefing() {
    if (!briefing) return;
    briefing = false;
    clearInput();
    syncFlightOverlay(false);
  }

  function finishCloudbase(reason: string, show = true, record = show) {
    briefing = false;
    syncFlightOverlay(false);
    // The run engine already stops its clock when fog catches; UI finalization still follows.
    if (mode !== 'cloudbase') return null;
    // Fog, touchdown and the time limit judge the carried bar; leaving forfeits it.
    const result = requireRun().finish(reason, flownSky, record);
    progress.cloudbase.bestAltitude = Math.max(progress.cloudbase.bestAltitude, result.peak);
    persist();
    clearRunEffects();
    thermals.group.visible = true;
    stage.classList.remove('cloudbase');
    mode = 'cloudbase-ended';
    resetCoach();
    settleFlight(g, 0);
    clearInput();
    if (show) {
      cloudResult = result;
      hooks.onResult?.(result);
      stage.classList.add('cloudbase-ended');
      $('.fj-hud dl').hidden = true;
    }
    syncCloudbaseEntry();
    return result;
  }

  // Loads and makes the game beyond the arch, once.
  function loadRun() {
    runLoading ??= import('../../good-lift/services/good-lift-session.service.ts').then(({ createGoodLift }) => {
      runModuleFailed = false;
      if (disposed) return null;
      run ??= createGoodLift(host);
      return run;
    }, error => {
      // Browsers retain a failed ES-module load for this document; retry requires a fresh page.
      runModuleFailed = true;
      throw error;
    });
    return runLoading;
  }

  function loadTraining() {
    trainingLoading ??= import('../../good-lift/services/good-lift-session.service.ts').then(({ createGoodLiftTraining }) => {
      runModuleFailed = false;
      if (!disposed) training ??= createGoodLiftTraining({ g, controls, air });
    }, error => { runModuleFailed = true; throw error; });
    return trainingLoading;
  }

  const skyPreparation = createSkyPreparation(async (address, isCurrent) => {
    try {
      if (address.kind === 'training') {
        await loadTraining();
        return isCurrent() && !disposed ? { kind: 'training', seed: 0, day: 0 } : null;
      }
      await loadRun();
      if (!isCurrent() || disposed) return null;
      return sameGame(address, game) && gameSky && gameSky.kind !== 'practice'
        ? gameSky : await requireRun().resolveSky(address);
    } catch (error) {
      if (!run) runLoading = null;
      throw error;
    }
  });

  // Preparation loads and verifies the sky without beginning a world, creating sound, awarding
  // achievements or writing progress. React owns the one ready dialog, including portal entry.
  function prepareSky(address: GameAddress) {
    if (disposed) return Promise.resolve(null);
    if (mode === 'cloudbase' && sameGame(address, game)) return Promise.resolve(null);
    if (mode === 'cloudbase') finishCloudbase('quit', false, address.kind === 'training');
    if (mode === 'training') training?.leave();
    if (game && game.kind !== 'training') returnGame = game;
    portal = true;
    clearInput();
    closeMap();
    showKeys(false);
    clearCloudResult();
    return skyPreparation.prepare(address);
  }

  function cancelPreparedSky() {
    skyPreparation.cancel();
    run?.cancelReplays();
    portal = false;
    clearInput();
  }

  // This operation stays synchronous: Fly's trusted gesture unlocks sound before the run's music
  // joins it. A consumed request cannot be started twice or revived by a late async response.
  function startPreparedSky(activationKey?: string, expected?: ResolvedSky, lesson: LessonId = 'pitch'): boolean {
    if (disposed) return false;
    const prepared = skyPreparation.consume(expected);
    if (!prepared) return false;
    startAudio();
    if (prepared.address.kind === 'training') {
      if (!training) return false;
      run?.leave();
      clearCloudResult(); clearRunEffects(); clearInput();
      game = prepared.address; gameSky = prepared.sky; flownSky = null;
      setAuto(null); setHot(null); closePanel();
      $('.fj-hud').hidden = false; $('.fj-hud dl').hidden = false;
      stage.classList.add('playing', 'training');
      stage.classList.remove('cloudbase', 'cloudbase-ended');
      mode = 'training'; briefing = portal = false;
      training.begin(lesson);
      flightView.capture(); vario.reset(g.vy); resetCoach();
      thermals.group.visible = false;
      syncCloudbaseEntry(); snapCamera(); syncFlightOverlay(false);
      swallowed = activationKey ?? null;
      return true;
    }
    training?.leave(); stage.classList.remove('training');
    if (mode === 'cloudbase') finishCloudbase('quit', false);
    if (mode === 'lost') idle();
    if (mode === 'intro') takeControl();
    game = prepared.address;
    gameSky = prepared.sky;
    clearTimeout(fadeTimer);
    $('.fj-fade').classList.remove('on');
    closeMap();
    showKeys(false);
    setAuto(null);
    setHot(null);
    launchFrom(GATEWAY.x, 80, GATEWAY.z, Math.PI / 2);
    clearInput();
    cameraRig.reveal = null;
    if (!progress.cloudbase.discovered) {
      progress.cloudbase.discovered = true;
      persist();
    }
    clearRunEffects();
    // The day's sky, and a named one, are flown again; practice is a new sky every requireRun(). The seed a
    // console pins overrides them all.
    flownSky = pinnedSeed == null || pinnedSeed === gameSky.seed ? gameSky : { kind: 'sky', seed: pinnedSeed, day: 0 };
    // The sound first: the run's music joins it as the run begins.
    startAudio();
    requireRun().begin(flownSky.seed, flownSky);
    vario.reset(g.vy);
    resetCoach();
    briefing = false;
    portal = false;
    mode = 'cloudbase';
    stage.classList.add('cloudbase');
    thermals.group.visible = false;
    $('.fj-hud dl').hidden = false;
    syncCloudbaseEntry();
    startAudio();
    snapCamera();
    syncFlightOverlay(false);
    swallowed = activationKey ?? null;
    return true;
  }

  // Through the arch, or [ Good Lift ] from the menu or the map: the flight holds still and takes no
  // keys while the page warps into Good Lift and prepares its ready screen. With no page to ask, the
  // day's sky starts here.
  function enterPortal() {
    if (portal) return;
    portal = true;
    clearInput();
    setAuto(null);
    if (hooks.onPortal) hooks.onPortal();
    else playGame(DAILY);
  }

  // Within PORTAL.near metres of the arch and closing on it, Good Lift starts to load (once: if it
  // will not come, the crossing asks again, and the page can deal with it there).
  function prefetchRun(dt: number) {
    const was = Math.hypot(previousPosition.x - GATEWAY.x, previousPosition.z - GATEWAY.z);
    const now = Math.hypot(g.pos.x - GATEWAY.x, g.pos.z - GATEWAY.z);
    archNear = now < PORTAL.near && (was - now) / dt > PORTAL.closing;
    if (!archNear || runLoading || prefetchFailed) return;
    loadRun().catch(() => {
      runLoading = null;
      prefetchFailed = true;
    });
    for (const name of PORTAL.models) prefetchModel(name);
  }

  /**
   * Starts Good Lift on the sky `address` asks for (good-lift-address.js), settled at the gate, or
   * carries on if that sky is already being flown. Settles once the run is under way, and fails if
   * the game beyond the arch could not be loaded.
   */
  function playGame(address: GameAddress) {
    if (mode === 'cloudbase' && sameGame(address, game)) return Promise.resolve(true);
    // Legacy programmatic/debug callers and Retry are explicit actions too. Unlock now, before
    // an asynchronous practice seed or challenge verification, then start without another dialog.
    startAudio();
    return prepareSky(address).then(sky => sky ? startPreparedSky(undefined, sky) : false);
  }

  // R, and [ again ]: the same sky once more (a new one in practice). Outside the game, the way in
  // is through the portal, as the arch would take you.
  function retryCloudbase() {
    if (mode === 'training') return restartTraining();
    if (mode === 'cloudbase') finishCloudbase('quit', false);
    if (!game) return enterPortal();
    return playGame(game);
  }

  // Out of Good Lift and back over the fjord, from the launch: the game's music stops with it.
  function backToFjord() {
    cancelPreparedSky();
    finishCloudbase('quit', false);
    run?.leave();
    training?.leave(); stage.classList.remove('training');
    game = gameSky = flownSky = null;
    portal = false;
    closeMap();
    showKeys(false);
    setAuto(null);
    clearCloudResult();
    launchFrom(START.x, START.y, START.z, START.yaw);
    snapCamera();
    syncCloudbaseEntry();
  }

  // Asks the page to leave Good Lift for the fjord: it changes the address and calls fly().
  function leaveGame() {
    if (hooks.onFjord) hooks.onFjord();
    else backToFjord();
  }

  function exitFlight() {
    training?.leave();
    finishCloudbase('quit', false);
    hooks.onExit?.();
  }

  function openTraining() {
    if (game && game.kind !== 'training') returnGame = game;
    finishCloudbase('quit', false, true);
    showKeys(false); closeMap(); clearInput();
    portal = true;
    if (hooks.onPortal) hooks.onPortal(TRAINING);
    else void playGame(TRAINING);
  }

  function backToGame() {
    portal = true; training?.leave(); clearInput(); showKeys(false); closeMap();
    if (hooks.onPortal) hooks.onPortal(returnGame);
    else void playGame(returnGame);
  }

  function restartTraining(next = false) {
    if (mode !== 'training' || !training) return;
    clearInput(); resetCoach(); clearRunEffects();
    if (next) training.next(); else training.retry();
    flightView.capture(); vario.reset(g.vy); syncFlightOverlay(false);
  }

  function simulateTraining(dt: number) {
    if (!training) return;
    training.step(dt, input);
    stepCoach(dt);
    if (training.state.status !== 'flying') {
      clearInput(); coachView.reset();
      const complete = training.state.status === 'complete';
      $('#fj-training-title').textContent = complete ? 'Lesson complete' : 'Try that again';
      $('[data-training-detail]').textContent = complete ? 'Move completed and banked. Take another turn, or try a different trick.' :
        training.state.failure === 'clearance' ? 'More height needed. Retry starts you high with a settled wing.' : 'The attempt ended before banking. Retry with a settled wing.';
      $('[data-do="training-retry"]').textContent = complete ? 'Repeat lesson' : 'Try again';
      $('[data-do="training-next"]').hidden = !complete;
      syncFlightOverlay(false);
    }
  }

  // ---------------------------------------------------------------- flight

  function nearestZone(onlyUnvisited: boolean) { return nearestFlightZone(g.pos, ZONES, progress.visited, onlyUnvisited); }

  function simulate(dt: number) {
    airtime += dt;
    previousPosition.copy(g.pos);
    if (mode === 'cloudbase') return simulateRun(dt);
    if (mode === 'training') return simulateTraining(dt);
    const manual = summarizeControls(input);
    let turn = manual.turn;
    if (auto) {
      const want = Math.atan2(auto.x - g.pos.x, -(auto.z - g.pos.z));
      turn = clamp(wrapAngle(want - g.yaw) * 2.5, -1, 1);
    }
    outOfBounds = Math.abs(g.pos.x) > WORLD.halfX - 50 || g.pos.z < WORLD.north + 45 || g.pos.z > WORLD.south - 45;
    if (outOfBounds) {
      // Past the edge of the map the wind steers you back toward the fjord.
      const tz = clamp(g.pos.z, WORLD.north + 140, WORLD.south - 140);
      turn = clamp(wrapAngle(Math.atan2(centerX(tz) - g.pos.x, -(tz - g.pos.z)) - g.yaw) * 2, -1, 1);
    }

    // One atmosphere supplies the wing, particles, windsocks and instruments in both modes.
    const agl = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    sampleFjordAir(g.pos, airtime, air);
    air.clearance = agl;
    air.calm = false;
    g.lift = air.lift;
    g.liftSide = 0;

    controls.turn = turn;
    controls.brake = manual.brake && !auto;
    controls.deepBrake = manual.deepBrake && !auto;
    controls.bar = manual.bar && !auto;
    controls.ears = manual.ears && !auto;
    controls.steered = outOfBounds || !!auto;
    controls.locked = false;
    controls.climb = null;
    controls.controlMode = input.controlMode === 'brakes' && !controls.steered ? 'brakes' : 'legacy';
    controls.leftBrake = controls.controlMode === 'brakes' ? brakeByte(input.leftBrake) / 255 : 0;
    controls.rightBrake = controls.controlMode === 'brakes' ? brakeByte(input.rightBrake) / 255 : 0;
    if (auto) {
      // Flying itself, the glider holds a glide path that ends just above the ring, and stays
      // clear of any ground between here and there.
      const dist = Math.hypot(auto.x - g.pos.x, auto.z - g.pos.z);
      let path = auto.h + 4 + dist / 9;
      if (dist > auto.r * 2) {
        for (const ahead of [20, 45, 70]) {
          path = Math.max(path, surfaceAt(g.pos.x + Math.sin(g.yaw) * ahead, g.pos.z - Math.cos(g.yaw) * ahead) + 22);
        }
      }
      controls.climb = clamp((path - g.pos.y) * 0.9, -6, 6);
    }
    stepFlight(g, controls, air, dt);
    fjordWatch.step(dt, g, false, controls);
    afterStep(dt, false);

    const ground = surfaceAt(g.pos.x, g.pos.z);
    const here = ZONES.find((zone) => Math.hypot(g.pos.x - zone.x, g.pos.z - zone.z) < zone.r);
    if (here && g.pos.y - ground < 9) land(here);
    else if (g.pos.y - ground <= 1.4) land(null);
    else if (mode === 'flying' && !auto) {
      if (crossesGateway(previousPosition, g.pos, GATEWAY)) enterPortal();
      else prefetchRun(dt);
    } else archNear = false;
  }

  // One step of a run: the keys go to the shared step (run-step.js), which flies the wing and the
  // sky together exactly as the tests and the replays do; the game only answers what happened.
  function simulateRun(dt: number) {
    const ended = requireRun().step(dt, input);
    outOfBounds = requireRun().last.outside;
    afterStep(dt, requireRun().last.collapsed);
    if (ended === 'landed') {
      // Down on the ground the run is over, wherever it touched, and no place opens for it. The
      // sheet is read first, from the wing as the run left it (a replay never moves it: setting it
      // down first could raise its peak by a metre), and only then is the glider set on the ground.
      finishCloudbase('landed');
      g.pos.y = surfaceAt(g.pos.x, g.pos.z) + 1.4;
    } else if (ended) finishCloudbase(ended);
  }

  // What every kind of flying does after the wing has moved: the stall heard once and counted,
  // how long the brake has been deep, the achievements earned in the air and the rune stones.
  // `collapsed` says a raven strike had the wing, which ends a stall with no sound of refilling.
  function afterStep(dt: number, collapsed: boolean) {
    // A big swing caught and brought calm snaps the lines taut, over the fjord as in a run; a swing
    // through its bottom fast, fore and aft or in a wingover, rushes past.
    const watch = mode === 'cloudbase' ? run?.world.watch.state : fjordWatch.state;
    // A folded wing's pumps that counted, a strike's (a run's) and a front collapse's alike, and
    // whether it is folded still.
    const pumps = (mode === 'cloudbase' ? run?.world.pump.n ?? 0 : 0);
    const folded = g.tuck > 0 || (mode === 'cloudbase' && (run?.world.sky.state.pilot.collapse ?? 0) > 0);
    const frontal = g.tuck > 0;
    if (frontal && !effects.heard.frontal) play('frontal-fold', 0.4, slump, 0, 0.35);
    if (!frontal && effects.heard.frontal) playRefill(0);
    effects.heard.frontal = frontal;
    if (watch) {
      if (watch !== effects.heard.watch) effects.heard = { watch, catches: watch.catches, timed: watch.timed, pitch: g.pitch, roll: g.roll, pumps, folded, frontal, pumped: 0, loops: undefined };
      // Each pump that counted ticks by the wing, and the wing opening once it has been pumped rings,
      // as it opens.
      if (pumps > effects.heard.pumps) {
        effects.good.until = time + 0.6;
        effects.good.word = `${pumps}/${requireRun().pumpLimit}`;
      }
      if (effects.heard.folded && !folded && effects.heard.pumped > 0) {
        effects.good.until = time + 0.6;
        effects.good.word = 'OPEN';
        play('good', 0.1, chime, 0);
      }
      effects.heard.pumped = folded ? Math.max(effects.heard.pumped, pumps) : 0;
      effects.heard.folded = folded;
      effects.heard.pumps = pumps;
      if (watch.catches > effects.heard.catches) {
        play('catch', 0.3, snap);
        effects.good.until = time + 0.9;
        effects.good.word = 'CAUGHT';
      } else if (watch.timed > effects.heard.timed) {
        // The hands on time: a swap at a wingover's top, a press or a let-go at a pitched swing's peak.
        play('good', 0.1, chime, watch.timedKind === 3 ? -0.4 * watch.topSide : 0);
        effects.good.until = time + 0.45;
        effects.good.word = watch.quality === 2 ? 'PRECISE' : 'CLEAN';
      }
      effects.heard.catches = watch.catches;
      effects.heard.timed = watch.timed;
    }
    if (g.pitch * effects.heard.pitch < 0 && Math.abs(g.pitchRate) > 0.9) play('swoosh', 0.35, swoosh, Math.min(1, Math.abs(g.pitchRate) / 2.5));
    // A loop rushes through its bottom, each time round, loud.
    if (g.loops > (effects.heard.loops ?? g.loops)) play('swoosh', 0.35, swoosh, 1);
    effects.heard.loops = g.loops;
    if (g.roll * effects.heard.roll < 0 && Math.abs(g.rollRate) > 1.2) play('swoosh', 0.35, swoosh, Math.min(1, Math.abs(g.rollRate) / 3));
    effects.heard.pitch = g.pitch;
    effects.heard.roll = g.roll;
    if (g.stall > 0 && !effects.stalled) {
      effects.stalled = true;
      playStall();
    } else if (g.stall === 0 && effects.stalled) {
      effects.stalled = false;
      if (!collapsed && !frontal) playRefill(0);
    }

    if (g.lift > 1 && g.vy > 0) {
      climbStart ??= g.pos.y;
      if (g.pos.y - climbStart >= 60) unlock('thermal');
    } else if (g.lift < 0.2) {
      climbStart = null;
    }
    if (g.pos.y > 330) unlock('valkyrie');

    for (const [i, stone] of STONES.entries()) {
      if (progress.stones.includes(i)) continue;
      if (Math.hypot(g.pos.x - stone.x, g.pos.z - stone.z) < 26 && g.pos.y - stone.y < 80) {
        progress.stones.push(i);
        persist();
        toast(`<small>experience.log · ${stone.years}</small><b>${stone.role}</b><span>${stone.company}</span>`);
        if (progress.stones.length === STONES.length) unlock('runes');
      }
    }
    stepCoach(dt);
  }

  function land(zone: { label: string; place: string; x: number; h: number; id: string; z: number; side: number; off: number; r: number; }|null) {
    let landing = null;
    if (zone && landingLeg.eligible) {
      const distance = Math.hypot(g.pos.x - zone.x, g.pos.z - zone.z);
      const result = scoreLanding({ distance, radius: zone.r, sinkRate: Math.max(0, -g.vy) });
      const bestDistance = Math.min(progress.landingBests[zone.id] ?? Infinity, distance);
      progress.landingBests[zone.id] = bestDistance;
      landing = { ...result, bestDistance, expiresAt: Date.now() + 5000 };
      if (distance <= 1) unlock('bullseye');
      if (ZONES.every(({ id }) => progress.landingBests[id] <= 1)) unlock('four-for-four');
    }
    mode = 'landed';
    resetCoach();
    stage.classList.remove('cloudbase-ended');
    setAuto(null);
    settleFlight(g, 0);
    effects.stalled = false; effects.heard.frontal = false;
    g.pos.y = surfaceAt(g.pos.x, g.pos.z) + 1.4;
    // A key still held from the approach is not a brake, or a turn, on the next flight.
    clearInput();
    if (zone) {
      if (!progress.visited.includes(zone.id)) progress.visited.push(zone.id);
      places.setVisited(zone.id);
      unlock('touchdown');
      if (progress.visited.length === ZONES.length) unlock('tour');
      openPanel(zone.id, `~/fjord/${zone.place.replace(' ', '-')}`, landing);
    } else if (heightAt(g.pos.x, g.pos.z) <= 0.3) {
      unlock('aegir');
      openPanel('water', '~/fjord');
    } else {
      unlock('goat');
      openPanel('slope', '~/fjord/hillside');
    }
    persist();
  }

  function fadeThen(change: { (): void; (): void; (): void; (): void; }) {
    clearTimeout(fadeTimer);
    $('.fj-fade').classList.add('on');
    fadeTimer = setTimeout(() => {
      if (disposed) return;
      change();
      snapCamera();
      $('.fj-fade').classList.remove('on');
    }, 320);
  }

  function launchFrom(x: number, y: number, z: number, yaw: number, assisted = false) {
    clearInput();
    hasDragged = false;
    closePanel();
    clearCloudResult();
    landingLeg.begin(assisted);
    cameraRig.reveal = null;
    g.pos.set(x, y, z);
    g.yaw = yaw;
    settleFlight(g);
    vario.reset(g.vy);
    fjordWatch.reset();
    resetCoach();
    effects.heard.catches = 0;
    climbStart = null;
    effects.gaze = 0;
    // A new flight starts with fresh controls and nothing of the last stall still showing.
    effects.fjordHint.line = '';
    effects.fjordHint.since = 0;
    effects.stalled = false; effects.heard.frontal = false;
    mode = 'flying';
  }

  // Sends the glider to a place by itself, at boosted speed. Steering takes control back.
  function setAuto(zone: Zone | null) {
    auto = zone;
    if (zone) { clearInput(); resetCoach(); }
    // Flying itself, the glider has no use for a brake or a stall left over from the pilot.
    if (zone) releaseFlight(g);
    for (const { zone: each, el } of zoneLabels) el.classList.toggle('target', each === auto);
  }

  function autoFly(zone: { label: string; place: string; x: number; h: number; id: string; z: number; side: number; off: number; r: number; }|null|undefined) {
    // In Good Lift the places are out of reach: the way back to them is back to the fjord.
    if (!zone || (!isAirborne() && mode !== 'landed') || inGame()) return;
    clearCloudResult();
    landingLeg.assist();
    closeMap();
    setAuto(zone);
    if (mode === 'landed') takeOff();
  }

  function takeOff() {
    if (mode !== 'landed') return;
    clearInput();
    mode = 'launching';
    fadeThen(() => {
      // Lift straight up from where you stand and face the next place worth visiting.
      const next = (nearestZone(true) ?? nearestZone(false))!;
      const far = next.dist > 40 ? next.zone : { x: centerX(g.pos.z - 80), z: g.pos.z - 80 };
      const yaw = Math.atan2(far.x - g.pos.x, -(far.z - g.pos.z));
      launchFrom(g.pos.x, surfaceAt(g.pos.x, g.pos.z) + 75, g.pos.z, yaw, !!auto);
    });
  }

  function teleportTo(zone: { label: string; place: string; x: number; h: number; id: string; z: number; side: number; off: number; r: number; }) {
    if (!zone || inGame()) return;
    clearInput();
    closePanel();
    closeMap();
    setAuto(null);
    releaseFlight(g);
    mode = 'launching';
    fadeThen(() => {
      // Arrive on final approach from the water: left alone, the glide ends inside the ring.
      const from = new THREE.Vector2(centerX(zone.z + 40) - zone.x, 40).setLength(110);
      launchFrom(zone.x + from.x, zone.h + 19, zone.z + from.y, Math.atan2(-from.x, from.y), true);
    });
  }

  function respawn() {
    if (mode === 'intro') return;
    if (mode === 'training') return restartTraining();
    if (mode === 'cloudbase' || mode === 'cloudbase-ended' || cloudResult) return retryCloudbase();
    clearInput();
    setAuto(null);
    releaseFlight(g);
    mode = 'launching';
    fadeThen(() => launchFrom(START.x, START.y, START.z, START.yaw));
  }

  // ---------------------------------------------------------------- the missing page

  const lostScene = createLost({
    scene,
    camera,
    g,
    glider,
    view,
    harbour: places.harbour,
    fade: fadeThen,
    onStage(name: string) {
      if (name === 'tree') unlock('reserve');
      if (name === 'aboard') unlock('aegir');
      // Once the story has ended there is nothing left for the instruments to say.
      lostEnded = name === 'tree' || name === 'aboard';
      $('.fj-hud dl').hidden = lostEnded;
      hooks.onLost?.(name);
    },
  });
  let lostEnded = false;

  /** Plays the emergency a missing page turns into, from the top. */
  function lost() {
    if (mode !== 'intro') idle();
    mode = 'lost';
    $('.fj-hud').hidden = false;
    stage.classList.add('playing', 'lost');
    lostScene.begin();
  }

  function throwReserve() {
    if (mode !== 'lost') return;
    startAudio();
    lostScene.throwReserve();
  }

  /** Cuts the emergency short: back to the idle backdrop, with the page left to show its links. */
  function skipLost() {
    if (mode !== 'lost') return;
    idle();
    hooks.onLost?.('skipped');
  }

  // ---------------------------------------------------------------- camera

  const cameraRig = createFlightCamera({ g, camera, gateway: gateway.group, input, view, effects, surfaceAt,
    get mode() { return mode; }, get time() { return time; }, get calm() { return calm; },
    rendered: () => renderedFlight, isAirborne, aimLost: dt => lostScene.aim(dt) });
  const snapCamera = () => cameraRig.snap();
  const updateCamera = (dt: number) => cameraRig.update(dt);

  // As a backdrop the glider can be pulled about with the mouse: a drag near it holds it off to
  // one side, and a pointer passing by stirs it. Let go and it swings home. `x` and `y` are how far
  // it has been pulled across and up the screen, in metres, and `toX`, `toY` where a drag holds it.
  const TUG = { stiffness: 14, damping: 3.2, reachX: 13, reachY: 7, stir: 0.9, lean: 0.035 };
  const tug: { x: number; y: number; vx: number; vy: number; toX: number; toY: number; held: { x: number; y: number; scale: number } | null } = { x: 0, y: 0, vx: 0, vy: 0, toX: 0, toY: 0, held: null };
  const across = new THREE.Vector3();
  const upward = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const roll = new THREE.Quaternion();

  // Where the glider is in the window, how near the pointer is to it, and the metres one pixel covers there.
  function tugReach(event: { clientX: number; clientY: number; }) {
    const box = stage.getBoundingClientRect();
    const at = ahead.copy(glider.group.position).project(camera);
    const x = box.left + (at.x * 0.5 + 0.5) * box.width;
    const y = box.top + (0.5 - at.y * 0.5) * box.height;
    const far = camera.position.distanceTo(glider.group.position);
    return {
      near: Math.hypot(event.clientX - x, event.clientY - y) < Math.max(150, box.height * 0.26),
      scale: (2 * far * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / box.height,
    };
  }

  function letGo() {
    tug.held = null;
    tug.toX = tug.toY = 0;
    document.documentElement.classList.remove('tugging');
  }

  on(window, 'pointerdown', (event) => {
    if (mode !== 'intro' || event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('a, button, input, .window')) return;
    const { near, scale } = tugReach(event);
    if (!near) return;
    tug.held = { x: event.clientX - tug.x / scale, y: event.clientY + tug.y / scale, scale };
    document.documentElement.classList.add('tugging');
    event.preventDefault(); // a drag on the glider is not a text selection
  });
  on(window, 'pointermove', (event: { pointerType: string; clientX: number; clientY: number; movementX: number; movementY: number; }) => {
    if (mode !== 'intro' || event.pointerType !== 'mouse') return document.documentElement.classList.remove('tuggable');
    if (tug.held) {
      tug.toX = clamp((event.clientX - tug.held.x) * tug.held.scale, -TUG.reachX, TUG.reachX);
      tug.toY = clamp((tug.held.y - event.clientY) * tug.held.scale, -TUG.reachY, TUG.reachY);
      return undefined;
    }
    const { near, scale } = tugReach(event);
    document.documentElement.classList.toggle('tuggable', near);
    if (near) {
      // One fast sweep of the mouse must not fling the glider away, so each nudge is capped.
      tug.vx += clamp(event.movementX, -40, 40) * scale * TUG.stir;
      tug.vy -= clamp(event.movementY, -40, 40) * scale * TUG.stir;
    }
    return undefined;
  });
  on(window, 'pointerup', letGo);
  on(window, 'pointercancel', letGo);
  on(window, 'blur', letGo);

  // Moves the pull along by `dt` seconds and returns how far the wing leans into it.
  function tugStep(dt: number) {
    const step = Math.min(dt, 0.1);
    const slices = Math.ceil(step * 120);
    const h = step / slices;
    for (let i = 0; i < slices; i++) {
      tug.vx += (TUG.stiffness * (tug.toX - tug.x) - TUG.damping * tug.vx) * h;
      tug.vy += (TUG.stiffness * (tug.toY - tug.y) - TUG.damping * tug.vy) * h;
      tug.x += tug.vx * h;
      tug.y += tug.vy * h;
    }
    return THREE.MathUtils.clamp(tug.vx * TUG.lean, -0.45, 0.45);
  }

  // ---------------------------------------------------------------- hud

  const labels: { el: HTMLElement; at: THREE.Vector3; range: number }[] = [];

  function addLabel(x: number|undefined, y: number|undefined, z: number|undefined, range: number, html: string, tag = 'div') {
    const el = document.createElement(tag);
    el.className = 'fj-label';
    el.innerHTML = html;
    $('.fj-labels').append(el);
    labels.push({ el, at: new THREE.Vector3(x, y, z), range });
    return el;
  }
  // A place's label is a button: clicking it, or its pillar, sends the glider there.
  const zoneLabels = ZONES.map((zone) => {
    const el = addLabel(zone.x, zone.h + 34, zone.z, 600, `<b>${zone.label}</b><span></span><i></i>`, 'button');
    el.classList.add('fj-place');
    on(el, 'click', () => autoFly(zone));
    on(el, 'pointerenter', () => setHot(zone));
    on(el, 'pointerleave', () => setHot(null));
    return { zone, el };
  });
  for (const stone of STONES) {
    addLabel(stone.x, stone.y + stone.height + 4, stone.z, 170, `<b>${stone.role}</b><span>${stone.company} · ${stone.years}</span>`);
  }
  for (const prop of PROJECT_PROPS) addLabel(prop.x, prop.y, prop.z, 120, `<b>${prop.label}</b>`);

  const projected = new THREE.Vector3();
  const labelBounds = { left: 0, right: 0, top: 0, bottom: 0 };
  function placeLabels() {
    for (const { el, at, range } of labels) {
      const dist = at.distanceTo(camera.position);
      projected.copy(at).project(camera);
      const show = mode === 'flying' && !overlayOpen() && dist < range && projected.z < 1 && Math.abs(projected.x) < 1.05;
      el.style.display = show ? '' : 'none';
      if (!show) continue;
      const x = (projected.x * 0.5 + 0.5) * view.width;
      const y = (-projected.y * 0.5 + 0.5) * view.height;
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      Object.assign(labelBounds, { left: x - el.offsetWidth / 2, right: x + el.offsetWidth / 2, top: y - el.offsetHeight, bottom: y });
      el.style.visibility = flightCues.overlapsControl(labelBounds) ? 'hidden' : '';
    }
  }

  function setHot(zone: { label: string; place: string; x: number; h: number; id: string; z: number; side: number; off: number; r: number; }|null) {
    if (zone === hot) return;
    hot = zone;
    places.setHot(hot?.id ?? null);
    $('.fj-scene').style.cursor = hot ? 'pointer' : '';
    for (const { zone: each, el } of zoneLabels) el.classList.toggle('hot', each === hot);
  }

  // The place whose pillar of light passes under a point on screen, if any.
  const foot = new THREE.Vector3();
  const head = new THREE.Vector3();
  function pillarAt(clientX: number, clientY: number) {
    const box = stage.getBoundingClientRect();
    const px = clientX - box.left;
    const py = clientY - box.top;
    let best: Zone | null = null;
    let bestGap = 30;
    for (const zone of ZONES) {
      foot.set(zone.x, zone.h, zone.z).project(camera);
      head.set(zone.x, zone.h + 320, zone.z).project(camera);
      if (foot.z > 1 || head.z > 1) continue;
      const ax = (foot.x * 0.5 + 0.5) * view.width;
      const ay = (-foot.y * 0.5 + 0.5) * view.height;
      const bx = (head.x * 0.5 + 0.5) * view.width;
      const by = (-head.y * 0.5 + 0.5) * view.height;
      const along = clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1), 0, 1);
      const gap = Math.hypot(px - (ax + (bx - ax) * along), py - (ay + (by - ay) * along));
      if (gap < bestGap) [best, bestGap] = [zone, gap];
    }
    return best;
  }

  on($('.fj-scene'), 'pointermove', (event) => setHot(mode === 'flying' && !overlayOpen() && !brakeInput.state.source ? pillarAt(event.clientX, event.clientY) : null));
  on($('.fj-scene'), 'pointerleave', () => setHot(null));
  on($('.fj-scene'), 'click', (event) => {
    if (skipFlightClick) { skipFlightClick = false; return; }
    if (brakeInput.state.source) return;
    if (mode === 'flying' && !mapOpen && !keysOpen && !held && !portal) autoFly(pillarAt(event.clientX, event.clientY));
  });

  // On a touch screen the hints name the on-screen buttons instead of keys.
  const touch = matchMedia('(pointer: coarse)').matches;
  // Visitors who ask for less motion keep everything that tells them something and lose the rest.
  const calm = motionPreference.matches;
  // The wind made visible over the fjord: a gentle breeze, no gusts (a run draws its own).
  const streaks = createWindStreaks({ scene, calm });

  // What the game beyond the arch shares with the engine (see good-lift.js).
  const host: GoodLiftHost = {
    g, controls, air, scene, camera, loadModel, effects, touch, calm, hud, unlock, stage, view,
    base: import.meta.env.BASE_URL,
    onMusic: (on) => hooks.onMusic?.(on),
    onBots: (bots) => hooks.onBots?.(bots),
    onWorld: (world) => hooks.onWorld?.(world),
    onResultUpdate: (result) => {
      if (disposed || mode !== 'cloudbase-ended' || cloudResult?.at !== result.at || cloudResult.seed !== result.seed) return;
      cloudResult = result;
      if (!overlayOpen()) hooks.onResult?.({ ...result });
    },
    compact: () => touch || view.width <= 560,
    best: () => progress.cloudbase.bestAltitude,
    flash: flashStrike,
    sound: { play, panned, get audio() { return flightAudio.audio!; } },
    bright: () => !useBloom,
    kit: () => ({ ...kit }),
    wear,
  };
  const fjordMoment = { auto: '', arch: false, nearArch: false, outside: false, nearRing: false, unvisited: false, agl: 0, airtime: 0, touch: false };

  function hintText() {
    if (!isAirborne() || overlayOpen()) return '';
    const near = nearestZone(false)!;
    fjordMoment.auto = auto ? auto.label : '';
    fjordMoment.arch = !progress.cloudbase.discovered && airtime < 4 && landingLeg.eligible;
    fjordMoment.nearArch = archNear && !auto;
    fjordMoment.outside = outOfBounds;
    fjordMoment.nearRing = near.dist < near.zone.r * 2.5;
    fjordMoment.unvisited = !progress.visited.includes(near.zone.id);
    fjordMoment.agl = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    fjordMoment.airtime = airtime;
    fjordMoment.touch = touch;
    // Held on the frame clock, not the flight's: under boost the flight's runs three times as fast,
    // and a line has to stay up long enough to read in real time.
    return holdHint(effects.fjordHint, fjordHint(fjordMoment), time);
  }

  // Only simulation steps advance coach intent, targets and cue timing. Rendering reads the result.
  const gaugeHands = { brake: false, fold: 0, held: 0, pumps: 0 };
  const flightCoach = createFlightCoach();
  const liftGuide = createLiftGuide({
    get navigation() { return mode === 'cloudbase'; },
    recoveryPoint: () => mode === 'cloudbase' ? requireRun().coachEnvironment.recoveryPoint() : null,
    thermalFlow: () => mode === 'cloudbase' ? requireRun().coachEnvironment.thermalFlow() : null,
    openingProtected: () => mode === 'cloudbase' && requireRun().coachEnvironment.openingProtected(),
    sampleAir: (pos: Vector3, out: AirSample = {}) => mode === 'cloudbase'
      ? requireRun().coachEnvironment.sampleAir(pos, out) : sampleFjordAir(pos, airtime, out),
    heightAt: surfaceAt,
    sources: () => mode === 'cloudbase' ? requireRun().coachEnvironment.sources() : FJORD_THERMALS,
    inside: (pos: { x: number; z: number; }, margin = 0) => mode === 'cloudbase' ? requireRun().coachEnvironment.inside(pos, margin)
      : Math.abs(pos.x) <= WORLD.halfX - margin && pos.z >= WORLD.north + margin && pos.z <= WORLD.south - margin,
    fog: () => mode === 'cloudbase' ? requireRun().coachEnvironment.fog() : null,
    cloudDepth: (pos: Vector3) => mode === 'cloudbase' ? requireRun().coachEnvironment.cloudDepth(pos) : 0,
  });
  const coachView = createCoachView({ element: $('.fj-coach'), input: () => input, device: () => brakeInput.state.device,
    canAnnounce: () => stage.dataset.messageOwner === 'coach' && !overlayOpen() && !briefing });
  const coachIntent = createCoachIntent();
  let coachMessage: ReturnType<typeof coachIntent.resolve> = null;
  function resetCoach() {
    thermalAir.reset();
    flightCoach.reset(); liftGuide.reset(); windNotice.reset(); plateNotice.reset();
    run?.resetCoach();
    coachIntent.reset();
    coachMessage = null;
    coachView.reset();
    flightCues.reset();
  }
  function stepCoach(dt: number) {
    if (mode === 'training') { coachMessage = training?.message ?? null; return; }
    const watch = mode === 'cloudbase' ? run?.world.watch.state : fjordWatch.state;
    const eligible = isAirborne() && !auto && !controls.steered && !briefing && !!watch;
    if (!eligible) { resetCoach(); return; }
    const world = mode === 'cloudbase' ? requireRun().world : null;
    // Forecast the canonical demands actually flown and recorded on this step.
    const coachInput = world?.intent ?? input;
    Object.assign(gaugeHands, { brake: summarizeControls(coachInput).brake, fold: world?.sky.state.pilot.collapse ?? 0,
      held: world?.pump.held ?? 0, pumps: world?.pump.n ?? 0 });
    swingGauge(g, watch, true, dt, effects.gauge, gaugeHands);
    const clock = world?.sky.state.elapsed ?? airtime;
    const lift = liftGuide.step(dt, { g, air, clock, input: coachInput,
      suspended: interruptsLift(coachMessage) || gaugeHands.fold > 0 });
    const hazard = mode === 'cloudbase' ? requireRun().coachHazard : null;
    const warning = world ? requireRun().coachWarning : null;
    const coachFrame = { g, watch, style: run && world ? requireRun().style.state : null,
      gauge: effects.gauge, input: coachInput, air, clearance: g.pos.y - surfaceAt(g.pos.x, g.pos.z),
      collapse: gaugeHands.fold,
      fogClearance: world ? g.pos.y - world.sky.state.fogHeight : Infinity,
      hazard, warning, lift: world ? lift ?? liftGuide.route : lift, eligible,
      hazardActive: !!world && (world.sky.state.pilot.danger > 0 || world.sky.state.pilot.cloud > 0 ||
        world.sky.state.pilot.gustIn < 6 || world.bells!.state.warning >= 0) };
    const primary = world ? requireRun().stepCoach(dt, coachFrame) : flightCoach.step(dt, coachFrame);
    if (interruptsLift(primary)) liftGuide.reset();
    const available = !hazard && !warning && !!primary?.activity;
    const wind = windNotice.step(world?.sky.state.weather ?? null, clock, available);
    const plates = plateNotice.step(world ? requireRun().meet.state.trails : 0, clock, available && !wind && !primary?.transfer);
    const notice = wind ?? plates;
    coachMessage = coachIntent.resolve(resolveCoachMessage(primary, { warning, notice }, coachInput), coachInput, clock);
  }
  function updateCoach() {
    const eligible = isAirborne() && !overlayOpen() && !auto && !controls.steered && !briefing;
    const presented = presentedCoach();
    coachView.update(eligible ? presented : null);
    if (eligible) hintEl.hidden = mode === 'cloudbase' || mode === 'training' || !!presented;
    else hintEl.hidden = false;
    brakeMeter(g.brake, g.stallLoad, g.stall, effects.meter, g.ears, g);
    // Available on the first turn; thermalling qualification still belongs to lift-activity.js.
    thermalAirEl.hidden = !showThermalAir({ airborne: isAirborne(), manual: !auto && !controls.steered,
      circling: summarizeControls(input).left || summarizeControls(input).right || Math.abs(g.trackRate) > 0.015,
      lift: Math.max(air.thermal ?? 0, thermalAir.value), map: overlayOpen(), briefing, portal, instruction: presented });
  }

  // Ordinary matches keep their raw observers for navigation bookkeeping, without teaching UI.
  function presentedCoach() { return mode === 'cloudbase' || trainingOutcome() ? null : coachMessage; }

  const hudView = createFlightHud({ stage, g, input, air, vario, thermalAir, progress, zoneLabels, autoHaste: HASTE,
    get mode() { return mode; }, get auto() { return auto; }, get mapOpen() { return mapOpen; }, get keysOpen() { return keysOpen; },
    get briefing() { return briefing; }, get hasDragged() { return hasDragged; }, get portal() { return portal; }, get held() { return held || trainingOutcome(); }, get coachMessage() { return presentedCoach(); },
    trainingReadouts: () => mode === 'training' && training ? { lesson: training.state.lesson, points: training.style.state.total } : null,
    isAirborne, compact: () => host.compact(), runHud: quiet => requireRun().hud(quiet), runReadouts: () => run?.readouts ?? null,
    clearComboFeedback: () => run?.clearComboFeedback(), nearestZone, hintText, drawMap });
  const updateHud = () => hudView.update();


  function toast(html: string) {
    const el = document.createElement('div');
    el.className = 'fj-toast';
    el.innerHTML = html;
    $('.fj-toasts').append(el);
    setTimeout(() => el.remove(), 5200);
  }

  function openPanel(id: string, path: string, landing: FlightPanel['landing'] = null) {
    // `next` is the place still to see, offered as a one-click flight from the panel.
    const next = ZONES.find((zone) => zone.id !== id && !progress.visited.includes(zone.id));
    panel = { id, path, next: next ? { id: next.id, label: next.label } : null, landing };
    hooks.onPanel?.(panel);
    $('.fj-hud dl').hidden = true;
  }

  function closePanel() {
    panel = null;
    hooks.onPanel?.(null);
    $('.fj-hud dl').hidden = false;
  }

  // ---------------------------------------------------------------- map

  const mapCanvas = $<HTMLCanvasElement>('.fj-map-canvas');
  const mapCtx = mapCanvas.getContext('2d')!;
  const mapX = (x: number) => ((x + WORLD.halfX) / (WORLD.halfX * 2)) * mapCanvas.width;
  const mapY = (z: number) => ((z - WORLD.north) / (WORLD.south - WORLD.north)) * mapCanvas.height;

  const mapBase = (() => {
    const { width, height } = mapCanvas;
    const heights = new Float32Array(width * height);
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const x = (px / width) * WORLD.halfX * 2 - WORLD.halfX;
        const z = WORLD.north + (py / height) * (WORLD.south - WORLD.north);
        heights[py * width + px] = heightAt(x, z);
      }
    }
    const image = mapCtx.createImageData(width, height);
    for (let i = 0; i < heights.length; i++) {
      const h = heights[i];
      const contour = h > 0 && Math.floor(h / 30) !== Math.floor((heights[i + 1] ?? h) / 30);
      const t = clamp(h / 170, 0, 1);
      let rgb = h <= 0 ? [5, 13, 25] : [14 + t * 22, 36 + t * 48, 62 + t * 74];
      if (h > 125) rgb = [96, 142, 190];
      if (contour) rgb = rgb.map((channel) => channel * 1.35);
      image.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
    return image;
  })();

  function drawMap() {
    mapCtx.putImageData(mapBase, 0, 0);
    mapCtx.fillStyle = '#ff9d4a';
    // The fjord's thermals are switched off in a run, and a run's lift is for the ravens to show.
    for (const thermal of mode === 'cloudbase' ? [] : THERMALS) {
      mapCtx.beginPath();
      mapCtx.arc(mapX(thermal.x), mapY(thermal.z), 2.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    mapCtx.font = '11px ui-monospace, monospace';
    // In Good Lift the places are out of reach, so the map leaves them off.
    for (const zone of inGame() ? [] : ZONES) {
      const x = mapX(zone.x);
      const y = mapY(zone.z);
      mapCtx.save();
      mapCtx.translate(x, y);
      mapCtx.rotate(Math.PI / 4);
      mapCtx.fillStyle = progress.visited.includes(zone.id) ? '#2dd4ee' : '#ffffff';
      mapCtx.strokeStyle = '#060a13';
      mapCtx.lineWidth = 2;
      mapCtx.fillRect(-5, -5, 10, 10);
      mapCtx.strokeRect(-5, -5, 10, 10);
      mapCtx.restore();
      mapCtx.fillStyle = '#c9d6e5';
      mapCtx.textAlign = x > mapCanvas.width / 2 ? 'right' : 'left';
      mapCtx.fillText(zone.label, x + (x > mapCanvas.width / 2 ? -12 : 12), y + 4);
    }
    if (progress.cloudbase.discovered) {
      const x = mapX(GATEWAY.x);
      const y = mapY(GATEWAY.z);
      mapCtx.strokeStyle = '#5ee6ff';
      mapCtx.lineWidth = 3;
      mapCtx.beginPath();
      mapCtx.arc(x, y, 6, Math.PI, 0);
      mapCtx.lineTo(x + 6, y + 5);
      mapCtx.moveTo(x - 6, y);
      mapCtx.lineTo(x - 6, y + 5);
      mapCtx.stroke();
      mapCtx.fillStyle = '#5ee6ff';
      mapCtx.textAlign = 'left';
      mapCtx.fillText('Good Lift', x + 10, y + 3);
    }
    mapCtx.save();
    mapCtx.translate(mapX(g.pos.x), mapY(g.pos.z));
    mapCtx.rotate(g.yaw);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  // The menu and map pause the same flight and share a single modal focus boundary.
  function showKeys(open = !keysOpen, sync = true) {
    if (open && (briefing || mode === 'intro' || mode === 'lost')) return;
    if (open) {
      clearInput();
      setHot(null);
      closeMap(false);
      const summary = stage.querySelector<HTMLElement>('[data-pause-summary]');
      if (summary) {
        const climb = Math.abs(vario.value) < .05 ? 0 : vario.value;
        const bar = mode === 'cloudbase' ? ` · ${hud('bar').textContent}` : '';
        summary.textContent = `${Math.max(0, Math.floor(g.pos.y))} m · ${climb >= 0 ? '+' : '−'}${Math.abs(climb).toFixed(1)} m/s · ${Math.round(g.speed * 3.6)} km/h${bar}`;
      }
    }
    keysOpen = open;
    $('.fj-keys').hidden = !open;
    $('[data-do="keys"]').setAttribute('aria-expanded', String(open));
    if (sync) syncFlightOverlay();
  }

  // The map covers the landing panel while it is open, and hands it back when it closes.
  function openMap() {
    if (mode === 'training') { showKeys(true); return; }
    if (mode === 'intro' || mode === 'lost' || briefing) return;
    clearInput();
    setHot(null);
    showKeys(false, false);
    mapOpen = true;
    $('.fj-map').hidden = false;
    if (panel) hooks.onPanel?.(null);
    if (cloudResult) hooks.onResult?.(null);
    drawMap();
    syncFlightOverlay();
  }

  function closeMap(sync = true) {
    if (!mapOpen) return;
    mapOpen = false;
    resetConfirmOpen = false;
    const confirmation = stage.querySelector<HTMLElement>('.fj-reset-confirm');
    if (confirmation) confirmation.hidden = true;
    $('.fj-map').hidden = true;
    if (panel) hooks.onPanel?.(panel);
    if (cloudResult) hooks.onResult?.(cloudResult);
    if (sync) syncFlightOverlay();
  }

  function confirmReset(open: boolean) {
    if (!mapOpen) return;
    resetConfirmOpen = open;
    $('.fj-reset-confirm').hidden = !open;
    syncFlightOverlay();
    $(open ? '[data-do="reset-cancel"]' : '.fj-map [data-do="reset"]').focus({ preventScroll: true });
  }

  on(mapCanvas, 'click', (event: { clientX: number; clientY: number; }) => {
    const box = mapCanvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * mapCanvas.width;
    const y = ((event.clientY - box.top) / box.height) * mapCanvas.height;
    const hit = !inGame() && ZONES.find((zone) => Math.hypot(mapX(zone.x) - x, mapY(zone.z) - y) < 16);
    if (hit) teleportTo(hit);
    else if (progress.cloudbase.discovered && Math.hypot(mapX(GATEWAY.x) - x, mapY(GATEWAY.z) - y) < 16) retryCloudbase();
  });

  for (const zone of ZONES) {
    const button = document.createElement('button');
    button.textContent = `[ ${zone.label} ]`;
    button.dataset.place = zone.id;
    on(button, 'click', () => teleportTo(zone));
    $('.fj-map-list').append(button);
  }
  const cloudMapButton = document.createElement('button');
  cloudMapButton.dataset.do = 'cloudbase';
  cloudMapButton.textContent = '[ Good Lift ]';
  cloudMapButton.hidden = !progress.cloudbase.discovered;
  $('.fj-map-list').append(cloudMapButton);

  // ---------------------------------------------------------------- sound

  const flightAudio = createFlightAudio({ stage, g, effects, vario, isAirborne, get mode() { return mode; }, get paused() { return flightPaused(); }, runSounds: () => run?.sounds() });
  const { playStall, playRefill, slump, chime, snap, swoosh } = flightAudio;
  const startAudio = () => flightAudio.start();
  const updateAudio = () => flightAudio.update();
  const toggleSound = () => flightAudio.toggle();
  function play<Args extends unknown[]>(name: string, gap: number, voice: AudioVoice<Args>, ...args: Args) { return flightAudio.play(name, gap, voice, ...args); }
  function panned(ctx: AudioContext, pan: number) { return flightAudio.panned(ctx, pan); }

  // ---------------------------------------------------------------- taking and giving back control

  // True fullscreen covers the page's own overlays too, so it is asked of the stage's container.
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else (stage.parentElement ?? stage).requestFullscreen?.().catch(() => {});
  }

  /** Hands the glider to the visitor. With a place id, starts on final approach to that place. */
  function fly(zoneId?: string | null) {
    const zone = ZONES.find((candidate) => candidate.id === zoneId);
    if (mode === 'lost') idle();
    // Back from Good Lift: the flight starts again from the launch.
    if (game || mode === 'cloudbase' || mode === 'cloudbase-ended') backToFjord();
    if (mode === 'intro') {
      takeControl();
      launchFrom(START.x, START.y, START.z, START.yaw);
      if (!zone && !revealShown && !progress.cloudbase.discovered && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        revealShown = true;
        cameraRig.reveal = {
          age: 0,
          duration: 0.65,
          from: new THREE.Vector3(START.x - 45, START.y + 16, START.z + 16),
          at: new THREE.Vector3(START.x, START.y, START.z).lerp(new THREE.Vector3(GATEWAY.x, 80, GATEWAY.z), 0.55),
        };
      }
    }
    if (zone) teleportTo(zone);
    syncCloudbaseEntry();
  }

  // Out of the backdrop and into the visitor's hands: the readouts, the sound, a fresh clock.
  function takeControl() {
    $('.fj-hud').hidden = false;
    stage.classList.add('playing');
    startAudio();
    airtime = 0;
    unlock('airborne');
  }

  /** From a landing, flies itself to the next place not yet visited. */
  function flyToNext() {
    autoFly(ZONES.find((zone) => zone.id === panel?.next?.id));
  }

  /** Takes control back: the glider returns to circling as a backdrop. */
  function idle() {
    cancelPreparedSky();
    if (mode === 'intro') return;
    finishCloudbase('quit', false);
    training?.leave();
    clearTimeout(fadeTimer);
    $('.fj-fade').classList.remove('on');
    closeMap();
    showKeys(false);
    closePanel();
    setAuto(null);
    setHot(null);
    lostScene.reset();
    clearCloudResult();
    clearRunEffects();
    game = gameSky = flownSky = null;
    portal = false;
    effects.gaze = 0;
    cameraRig.reveal = null;
    mode = 'intro';
    resetCoach();
    g.pos.set(START.x, START.y, START.z);
    g.yaw = START.yaw;
    settleFlight(g);
    clearInput();
    $('.fj-hud').hidden = true;
    stage.classList.remove('playing', 'lost', 'cloudbase', 'cloudbase-ended', 'training');
    run?.leave(true);
    flightAudio.audio?.ctx.suspend();
    if (document.fullscreenElement) document.exitFullscreen();
  }

  // ---------------------------------------------------------------- input

  const flightCanvas = $('.fj-scene');
  flightControls = connectFlightControls({ canvas: flightCanvas, stage, handles: $('.fj-brake-handles'), input, drag: brakeDrag, controller: brakeInput, signal: listeners.signal,
    canStart: () => isAirborne() && !flightPaused(),
    beforeStart: () => { clearInput(); setAuto(null); setHot(null); skipFlightClick = false; },
    onActive: () => { hasDragged = true; dragTip.hidden = true; }, releaseMouse: releaseDrag });

  on(window, 'keydown', (event) => {
    if (mode === 'intro' || event.metaKey || event.ctrlKey || event.altKey) return;
    run?.nudgeMusic();
    // Good Lift's music has its own switch, only beyond the arch.
    if (event.code === 'KeyB' && !event.repeat && inGame()) run?.toggleMusic();
    // Through the arch, nothing is asked of the flight until Good Lift begins.
    if (portal) return;
    // Only an explicit Fly action, Enter or Space starts the briefed flight.
    if (briefing) {
      if (event.repeat) return;
      if (event.code === 'Escape') { event.preventDefault(); exitFlight(); }
      else if (['Enter', 'Space'].includes(event.code) && !(event.target instanceof Element && event.target.closest('[data-brief-action], [data-do="fly"], [data-do="brief-exit"]'))) {
        event.preventDefault();
        swallowed = event.code;
        endBriefing();
      }
      return;
    }
    if (event.code === swallowed) {
      event.preventDefault();
      return;
    }
    if (mode === 'lost') {
      // In the emergency there is one thing to do, and several keys that do it.
      if (event.code === 'KeyR' || event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!event.repeat) throwReserve();
      } else if (event.code === 'Escape') lostEnded ? hooks.onExit?.() : skipLost();
      else if (event.code === 'KeyL' && !event.repeat) toggleSound();
      return;
    }
    if (overlayOpen()) {
      if (event.repeat) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        if (resetConfirmOpen) confirmReset(false);
        else if (mapOpen) closeMap();
        else showKeys(false);
      } else if (event.code === 'KeyM') mapOpen ? closeMap() : openMap();
      else if (event.code === 'KeyH') showKeys();
      else if (event.code === 'KeyL') toggleSound();
      else if (event.code === 'KeyF') toggleFullscreen();
      return;
    }
    if (mode === 'cloudbase-ended') {
      if (event.code === 'Escape') leaveGame();
      else if (event.code === 'KeyR' && !event.repeat) retryCloudbase();
      else if (event.code === 'KeyM' && !event.repeat) openMap();
      else if (event.code === 'KeyL' && !event.repeat) toggleSound();
      return;
    }
    if (event.target instanceof Element && (event.target.closest('input, textarea, select, [contenteditable="true"]') ||
        event.target.closest('button, a') && ['Space', 'Enter'].includes(event.code))) return;
    if (flightControls?.keyDown(event)) return;
    if (event.repeat) return;
    if (event.code === 'KeyM') mapOpen ? closeMap() : openMap();
    else if (event.code === 'KeyH') showKeys();
    else if (event.code === 'KeyL') toggleSound();
    else if (event.code === 'KeyF') toggleFullscreen();
    else if (event.code === 'KeyR') respawn();
    else if (event.code === 'Escape') mapOpen ? closeMap() : keysOpen ? showKeys(false) : mode === 'training' ? showKeys(true) : mode === 'cloudbase' ? finishCloudbase('quit') : exitFlight();
    else if (['Enter', 'Space'].includes(event.code) && mode === 'landed') { event.preventDefault(); takeOff(); }
    else if (event.code === 'KeyN' && mode === 'landed') flyToNext();
  });

  on(window, 'keyup', (event) => {
    if (event.code === swallowed) swallowed = null;
    flightControls?.keyUp(event);
  });

  on(window, 'blur', () => {
    clearInput();
    swallowed = null;
  });
  on(window, 'pagehide', () => finishCloudbase('quit', false));
  on(stage, 'pointerdown', () => {
    run?.nudgeMusic();
  });
  on(stage, 'click', (event) => {
    if (!briefing || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('[data-brief-action]');
    if (button?.dataset.briefAction === 'fly') endBriefing();
    else if (button?.dataset.briefAction === 'exit') exitFlight();
  });
  // Out of sight, Good Lift's music waits for the page to come back.
  on(document, 'visibilitychange', () => {
    run?.hideMusic(document.hidden);
    if (document.hidden) { clearInput(); run?.clearComboFeedback(); }
  });

  const actions = {
    map: () => (mapOpen ? closeMap() : openMap()),
    keys: () => showKeys(),
    resume: () => { showKeys(false); if (!stage.hasAttribute('tabindex')) stage.tabIndex = -1; stage.focus({ preventScroll: true }); },
    fly: () => endBriefing(),
    'brief-exit': () => { if (briefing) exitFlight(); },
    sound: toggleSound,
    fullscreen: toggleFullscreen,
    exit: exitFlight,
    cloudbase: retryCloudbase,
    'quit-cloudbase': () => { showKeys(false); finishCloudbase('quit'); },
    training: openTraining,
    'training-choose': openTraining,
    'training-retry': () => restartTraining(),
    'training-next': () => restartTraining(true),
    'back-to-game': backToGame,
    fjord: () => { closeMap(); leaveGame(); },
    reset: () => confirmReset(true),
    'reset-cancel': () => confirmReset(false),
    'reset-confirm': () => {
      if (!mapOpen || !resetConfirmOpen) return;
      run?.cancelReplays();
      finishCloudbase('quit', false);
      Object.assign(progress, emptyProgress());
      writeProgress(emptyProgress());
      // Good Lift's own store goes too: its bests, feats, streak and board, and the kit they earned.
      try {
        localStorage.removeItem(GAME_STORE);
      } catch {
        // Storage can be blocked; there is then nothing kept to clear.
      }
      clearKit();
      run?.clearProgress();
      location.reload();
    },
  };
  // Through the arch the buttons wait for Good Lift as the keys do, but for sound and fullscreen.
  for (const button of stage.querySelectorAll<HTMLElement>('[data-do]')) {
    const { do: name } = button.dataset;
    on(button, 'click', () => (portal && name !== 'sound' && name !== 'fullscreen' ? undefined : actions[name as keyof typeof actions]()));
  }

  // ---------------------------------------------------------------- loop

  let last = performance.now();
  let backlog = 0;
  let hudClock = 0;
  let slowFrames = 0;
  let visible = true;
  let request = 0;

  function frame(now: number) {
    request = requestAnimationFrame(frame);
    const elapsed = overlayChanged ? 0 : Math.min(0.25, (now - last) / 1000);
    if (overlayChanged) backlog = 0;
    overlayChanged = false;
    last = now;
    // Scrolled out of view as a backdrop, there is nothing to draw.
    if (!visible && mode === 'intro') return;

    if (mode === 'lost') lostScene.update(elapsed, time + elapsed);

    // Fixed steps keep the flight model identical on slow and fast machines. Flying
    // itself to a place runs the flight several times faster than the clock. A Cloudbase run is
    // never hurried: at three times the speed a raven arrives with no warning at all.
    const paused = flightPaused();
    const flightElapsed = paused ? 0 : elapsed;
    haste = isAirborne() && !paused && auto ? HASTE : 1;
    time += elapsed;
    // A good lift holds the flight still for a heartbeat: no steps are fed while it lasts, and none
    // are made up afterwards. The step itself never changes.
    const stopped = effects.stop > 0;
    effects.stop = Math.max(0, effects.stop - flightElapsed);
    // Paused wall time is discarded, including the fractional step left at the opening edge.
    backlog = paused ? 0 : backlog + (stopped ? 0 : elapsed * haste);
    while (backlog >= STEP) {
      backlog -= STEP;
      if (isAirborne() && !flightPaused()) { flightView.capture(); simulate(STEP); }
    }

    // What the run is doing to the wing and the picture, eased by the real clock. Outside a run
    // the targets are all zero and nothing here writes to the wing, which the 404 scene also folds.
    const inRun = mode === 'cloudbase';
    if (inRun) requireRun().want();
    else effects.want.fold = effects.want.veil = effects.want.shake = effects.want.gaze = 0;
    stallEffects(mode, g, effects.stall, mode === 'cloudbase' || mode === 'training' ? g.stallLoad : 0);
    if (isAirborne()) {
      // A raven strike folds the whole wing; a stall folds a little of both halves, or one of them
      // hard. Each half goes fast and opens again more slowly. The 404 scene folds the wing by
      // itself (lost.js), and nothing here reaches it.
      const left = Math.max(effects.want.fold, effects.stall.left);
      const right = Math.max(effects.want.fold, effects.stall.right);
      effects.foldLeft += (left - effects.foldLeft) * Math.min(1, elapsed * (left > effects.foldLeft ? 18 : 4));
      effects.foldRight += (right - effects.foldRight) * Math.min(1, elapsed * (right > effects.foldRight ? 18 : 4));
      if (effects.foldLeft < 0.003) effects.foldLeft = 0;
      if (effects.foldRight < 0.003) effects.foldRight = 0;
      effects.luff += (effects.stall.luff - effects.luff) * Math.min(1, elapsed * 6);
      // Put right out once it is a trace, as the folds are: while it is above nought the wing works
      // out a flutter for every point of its cloth.
      if (effects.luff < 0.003 && effects.stall.luff === 0) effects.luff = 0;
      // A tuck folds the leading edge under at once and opens over a few tenths of a second.
      effects.tuck += (effects.stall.tuck - effects.tuck) * Math.min(1, elapsed * (effects.stall.tuck > effects.tuck ? 18 : 3));
      if (effects.tuck < 0.003 && effects.stall.tuck === 0) effects.tuck = 0;
    } else effects.foldLeft = effects.foldRight = effects.luff = effects.tuck = 0;
    // The lift of the wing over a core is a moment's: it dies away, and is put right out once a trace.
    effects.heave -= effects.heave * Math.min(1, elapsed * 3);
    if (Math.abs(effects.heave) < 0.001) effects.heave = 0;
    effects.fold = Math.max(effects.foldLeft, effects.foldRight);
    effects.shake = !isAirborne() || calm || paused ? 0 : Math.max(effects.want.shake, effects.stall.shake);
    if (inRun) {
      effects.veil += (effects.want.veil - effects.veil) * Math.min(1, elapsed * (effects.want.veil > effects.veil ? 6 : 2.5));
      // Below a trace the veil is put right out, so no see-through layer is left over the picture.
      const shown = effects.veil < 0.02 ? 0 : 0.88 * smoothstep(0, 1, effects.veil);
      if (shown !== effects.veilShown && (shown === 0 || Math.abs(shown - effects.veilShown) > 0.01)) {
        effects.veilShown = shown;
        veilEl.style.opacity = shown.toFixed(2);
      }
    }

    lens.warp = lens.rising ? Math.min(1, lens.warp + elapsed / 0.35) : Math.max(0, lens.warp - elapsed / 0.8);
    const wide = lens.base + 44 * lens.warp * lens.warp + (haste > 1 ? 12 : 0);
    lens.now += (wide - lens.now) * Math.min(1, elapsed * 10);
    if (Math.abs(camera.fov - lens.now) > 0.02) {
      camera.fov = lens.now;
      camera.updateProjectionMatrix();
    }

    glider.group.position.copy(g.pos);
    if (mode === 'intro') glider.group.position.y += Math.sin(time * 0.8) * 1.2;
    glider.group.rotation.set(0, -g.yaw, -g.bank);
    // As a backdrop the glider goes where the mouse has pulled it, leaning into the move the way
    // the screen shows it: across the picture, whichever way the camera happens to be facing.
    const lean = mode === 'intro' ? tugStep(elapsed) : 0;
    if (mode === 'intro') {
      across.setFromMatrixColumn(camera.matrixWorld, 0);
      upward.setFromMatrixColumn(camera.matrixWorld, 1);
      glider.group.position.addScaledVector(across, tug.x).addScaledVector(upward, tug.y);
      glider.group.quaternion.premultiply(roll.setFromAxisAngle(camera.getWorldDirection(ahead), lean));
    }
    const airborne = isAirborne();
    if (airborne) vario.step(g.vy, flightElapsed);
    else vario.reset(g.vy);
    if (airborne) thermalAir.step(air.thermal ?? 0, flightElapsed);
    else thermalAir.reset();
    const poseDetail = {
      dt: airborne ? flightElapsed : elapsed,
      time,
      bank: g.bank + lean,
      pace: airborne ? g.speed - FLIGHT.speed.trim : 0,
      turn: airborne ? g.turn : THREE.MathUtils.clamp(lean * 1.6, -1, 1),
      coordination: airborne ? g.coordination : 0,
      coordinatedLean: airborne ? g.coordinatedLean : 0,
      pilotLean: airborne ? g.pilotLean : 0,
      lift: airborne ? g.lift : mode === 'intro' ? tug.y : 0,
      liftSide: g.liftSide,
      landed: mode === 'landed',
      flying: airborne,
      brake: airborne ? g.brake : 0,
      controlMode: airborne ? g.controlMode : 'legacy',
      leftBrake: airborne ? g.leftBrake : 0,
      rightBrake: airborne ? g.rightBrake : 0,
      bar: airborne ? g.bar : 0,
      luff: effects.luff,
      stall: airborne && g.stall > 0 ? 1 : 0,
      foldLeft: effects.foldLeft,
      foldRight: effects.foldRight,
      // A gust rocking the wing is only motion; the flutter of a coming stall says something, and stays.
      rough: airborne && !calm ? air.rough : 0,
      ears: airborne ? g.ears : 0,
      tuck: effects.tuck,
      // The wing's own swing over the pilot, back to overhead on the ground.
      swing: airborne ? g.pitch : 0,
      // Gentler for whoever asks for less motion, and still there.
      heave: calm ? effects.heave * 0.5 : effects.heave,
    };
    renderedFlight = airborne ? flightView.sample(paused ? 1 : backlog / STEP) : null;
    if (airborne) glider.posePhysical(renderedFlight!, poseDetail);
    else glider.pose(poseDetail);
    updateCoach();
    hudView.presentMessages();
    updateCamera(paused ? 0 : elapsed);
    hudView.layoutMessages();
    flightCues.update({ pose: renderedFlight, dt: elapsed, message: presentedCoach(), input,
      facts: { blocked: !isAirborne() || flightPaused() || document.hidden ||
          !!auto || controls.steered || controls.locked || controls.climb != null,
        noseYaw: g.yaw, forwardAirspeed: g.forwardAirspeed, wingPhase: g.wingPhase, stall: g.stall,
        collapse: Math.max(g.tuck, mode === 'cloudbase' ? run?.sky.state.pilot.collapse ?? 0 : 0),
        inverted: !!g.loop || Math.abs(g.bank) >= Math.PI / 2 || g.pilot.pos.y > g.canopy.pos.y,
        recovering: presentedCoach()?.state === 'recover' } });

    terrain.update(time);
    sky.update(inRun ? requireRun().sky.state.elapsed : airborne ? airtime : time, { mode, camera, altitude: g.pos.y,
      seed: run?.sky.state.seed ?? 1, fog: inRun ? requireRun().sky.state.fogHeight : undefined,
      reducedMotion: calm, lowDetail: !useBloom, dt: elapsed });
    places.update(time, inRun ? requireRun().sky.windAt : fjordWindAt, calm);
    thermals.update(time);
    gateway.update(time);
    // Over the fjord a sparse breeze that moves nothing, as the windsocks show it; a run draws all
    // of its own wind. Paused with the flight, and drawn brighter once the glow has been dropped.
    if (inRun) requireRun().draw(flightElapsed, overlayOpen() || briefing);
    streaks.update(flightElapsed, g.pos, camera.position, fjordWindAt, mode === 'flying' ? 0.65 : 0, 3, null, !useBloom);
    placeLabels();
    updateAudio();
    hudClock += elapsed;
    if (hudClock > 0.1 && mode !== 'intro') {
      hudClock = 0;
      updateHud();
    }

    // Drop the glow and the extra pixels on machines that cannot hold a playable frame rate.
    if (useBloom && isAirborne()) {
      slowFrames = elapsed > 1 / 28 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 90) {
        useBloom = false;
        renderer.setPixelRatio(1);
        resize();
      }
    }
    if (useBloom) composer.render();
    else renderer.render(scene, camera);
  }

  snapCamera();
  request = requestAnimationFrame(frame);

  // A handle for poking at the world from the console.
  // fjord.spy([x, y, z], [x, y, z]) parks the camera to inspect something; fjord.spy() releases it.
  const debugWindow = window as Window & { fjord?: object };
  debugWindow.fjord = {
    g,
    glider,
    progress,
    get mode() { return mode; },
    get cloudRun() { return run?.sky ?? null; },
    get cloudView() { return run?.view ?? null; },
    // The meet and Hrungnir's kettlebells of the run being flown, and their view.
    get meet() { return run?.meet ?? null; },
    get bells() { return run?.bells ?? null; },
    get meetView() { return run?.meetView ?? null; },
    // Feeling for the core: how fast the lift is climbing, and the surges felt so far; and the
    // moment to turn into one (run-entry.js), and the moments called so far.
    get surge() { return run?.surge.state ?? null; },
    // The wing's swings as watched (swing-watch.js), over the fjord or in the run, and a run's style.
    get watch() { return mode === 'training' ? training?.watch.state ?? null : mode === 'cloudbase' ? run?.world.watch.state ?? null : fjordWatch.state; },
    get style() { return mode === 'training' ? training?.style.state ?? null : run?.style.state ?? null; },
    get training() { return training?.state ?? null; },
    // A run's briefing: whether it is up, and the key that ends it, as a pilot ready to fly.
    get briefing() { return briefing; },
    get paused() { return flightPaused(); },
    endBrief: () => briefing && endBriefing(),
    get entry() { return run?.entry.state ?? null; },
    // What the run's hint was last chosen from: its facts, as the readouts last wrote them.
    get effects() {
      return {
        seed: run?.sky.state.seed ?? null, fold: effects.fold, foldLeft: effects.foldLeft, foldRight: effects.foldRight, luff: effects.luff,
        veil: effects.veil, gaze: effects.gaze, hook: run?.world.hook ?? 1, stalls: run?.world.stalls ?? 0, meter: { ...effects.meter }, haste, stop: effects.stop,
        tucks: run?.world.tucks ?? 0, pumps: run?.world.pump.n ?? 0, tuck: effects.tuck, heave: effects.heave,
        pitch: g.pitch, pitchRate: g.pitchRate, bank: g.bank, gauge: { ...effects.gauge },
      };
    },
    // fjord.seed(n) flies the same Cloudbase sky every run until fjord.seed() lets it go;
    // fjord.hold() stops the flight where it is, without the map in the way, and fjord.hold(false) resumes.
    seed: (value: number|null) => (pinnedSeed = value == null ? null : value >>> 0),
    hold: (on = true) => { held = on; if (on) clearInput(); return held; },
    get brakeDrag() { return { ...brakeDrag.state }; },
    get brakeInput() { return { ...brakeInput.state, leftPointerId: brakeInput.hands.left.pointerId, rightPointerId: brakeInput.hands.right.pointerId }; },
    get landingEligible() { return landingLeg.eligible; },
    input,
    get coach() { return { message: presentedCoach(), guide: liftGuide.message, lessons: mode === 'training' ? training?.state ?? null : null, activity: liftGuide.activity, turn: liftGuide.turn, transfer: liftGuide.transfer }; },
    // The flight's own clock, and what it was last handed: the pilot's controls and the air.
    get airtime() { return airtime; },
    controls,
    air,
    thermalAir,
    sky,
    get rendering() { return { bloom: useBloom, geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0 }; },
    bloom: (on = true) => { useBloom = !!on; slowFrames = 0; renderer.setPixelRatio(on ? Math.min(devicePixelRatio, 2) : 1); resize(); },
    // The streaks being drawn: the run's while one is flown, otherwise the fjord's.
    get streaks() { return mode === 'cloudbase' && run ? requireRun().streaks : streaks; },
    // Good Lift's music: switched on, playing now, which track, and whether the browser refused it.
    get music() { return run?.musicState ?? null; },
    // The kit worn now, and fjord.wear({ wing, harness, helmet, chalk }) to try any of it on for a look:
    // earned or not, and never written down (the kit tab is the way to keep a choice), until the
    // next run ends and puts the kit kept back on. The run's chalk puffs, to start one by hand:
    // fjord.chalk.puff(x, y, z).
    get kit() { return { ...kit }; },
    wear: (next: Partial<ReturnType<typeof readKit>>) => {
      const worn = wear({ ...kit, ...next });
      run?.chalk.wear(worn.chalk);
      return worn;
    },
    get chalk() { return run?.chalk ?? null; },
    // The run's lightning (fjord.lightning.fire() strikes now, from a cloud in view if there is one,
    // and .state says when and where the last struck) and its glide ring (fjord.glide.state: its
    // word, the flock it judged, its radius and how strongly it is drawn).
    get lightning() { return run?.lightning ?? null; },
    get glide() { return run?.glide ?? null; },
    fjordBreeze: fjordWindAt,
    camera,
    ZONES,
    STONES,
    THERMALS,
    teleportTo,
    launchFrom,
    autoFly,
    takeOff,
    respawn,
    retryCloudbase,
    backToFjord,
    backToGame,
    play: playGame,
    // The last run's log and sheet, and a log's text replayed here: QA checks one against the other.
    get lastRun() { return run?.lastRun ?? null; },
    // The meet sheet's bots: the sky they fly, how far they are, and what they last told a sheet.
    get bots() { return run?.bots ?? null; },
    // The world board: whether the build names one, and what it last told a sheet.
    get worldBoard() { return run?.worldBoard ?? null; },
    replay: (text: string) => run?.replay(text) ?? null,
    // The Good Lift address being played, and the sky it came to.
    get game() { return game; },
    get gameSky() { return flownSky ?? gameSky; },
    spy: (from?: [number, number, number], at?: [number, number, number]) => cameraRig.spy(from, at),
  };

  return {
    fly,
    play: playGame,
    prepareSky,
    startPreparedSky,
    backToGame,
    cancelPreparedSky,
    get skyNeedsReload() { return runModuleFailed; },
    /** The initials Good Lift's board writes this browser's runs under. */
    setInitials: (text: string) => run?.setInitials(text),
    /** Good Lift's music switched over, from the meet sheet: whether it is now on. */
    toggleMusic: () => run?.toggleMusic() ?? false,
    /** This browser's run taken off the world board the meet sheet shows: whether it went. */
    removeWorldRun: () => run?.removeWorldRun() ?? Promise.resolve(false),
    /**
     * The meet sheet's kit tab: `choice` is any of { wing, harness, helmet, chalk } (wing-kit.js). Good Lift
     * keeps only what has been earned and writes that down, and the glider wears it at once.
     * Returns the kit now worn.
     */
    setKit: (choice: Partial<ReturnType<typeof readKit>>) => (run ? requireRun().chooseKit(choice) : { ...kit }),
    /** The meet sheet, a component that comes with Good Lift: null until it has loaded. */
    get meetSheet() { return run?.MeetSheet ?? null; },
    /**
     * A challenge link's run to beat, read and replayed on its sky once Good Lift has loaded:
     * { who, total, peak, ... } or { error }.
     */
    challenge: (address: GameAddress) => loadRun().then(() => requireRun().challenge(address)),
    idle,
    lost,
    throwReserve,
    skipLost,
    takeOff,
    flyToNext,
    openMap,
    retryCloudbase,
    backToFjord,
    /**
     * The lens half of the page's warp: `true` widens it as the warp builds, `false` snaps it wide
     * and lets it settle, as if dropping out of the warp.
     */
    warp(rising: boolean) {
      lens.rising = rising;
      if (!rising) lens.warp = 1;
    },
    /** How far the hero has scrolled away, 0 to 1: the backdrop's camera climbs to match. */
    rise: (amount: number) => cameraRig.rise(amount),
    /** The page tells the game whether its stage is on screen, so an unseen backdrop costs nothing. */
    setVisible: (seen: boolean) => (visible = seen),
    dispose() {
      training?.leave();
      cancelPreparedSky();
      finishCloudbase('quit', false);
      disposed = true;
      clearTimeout(fadeTimer);
      cancelAnimationFrame(request);
      listeners.abort();
      sizeWatch.disconnect();
      flightAudio.dispose();
      run?.dispose();
      coachView.dispose?.();
      streaks.dispose();
      sky.dispose();
      for (const pass of composer.passes) pass.dispose?.();
      composer.dispose();
      renderer.dispose();
      document.documentElement.classList.remove('tuggable', 'tugging');
      delete debugWindow.fjord;
      stage.replaceChildren();
    },
  };
}
