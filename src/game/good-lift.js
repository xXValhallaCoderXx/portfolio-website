// Good Lift: the game beyond the arch. Everything a run needs that the fjord does not (the run's
// sky, ravens and storm clouds, its gusts, the meet and Hrungnir's kettlebells, its hints, readouts
// and sounds, its milestones) lives here and is loaded only when a pilot is about to fly it, so the
// page's hero never carries it. The engine in game.js hands over what the two share through `host`.
import { Vector3 } from 'three';
import { CLOUD_HUNT, CLOUD_MILESTONES, CLOUD_STRIKE, RUN_SKY, createCloudbaseRun } from './cloudbase-state.js';
import { ORDER, createCloudbase } from './cloudbase.js';
import { runEffects } from './run-effects.js';
import { cloudbaseHint } from './cloudbase-hints.js';
import { holdHint } from './hints.js';
import { createRunWorld, finishRun, startRun, stepBits } from './run-step.js';
import { createWindStreaks } from './wind-streaks.js';
import { MEET, createMeet } from './meet-state.js';
import { BELLS, BELL_PHASE, BELL_RESULT, createBells } from './bells.js';
import { createMeetView } from './meet-view.js';
import { resolveSky, seedFor, skyId } from './daily.js';
import { featsFor } from './meet-card.js';
import { DAY_MS, dailyNumber, dayOf, gameHref } from './good-lift-address.js';
import { readStore, recordRun, setInitials as nameRuns, updateStore } from './good-lift-store.js';
import { addRow, boardKey, rowsFor } from './board.js';
import { SIM_VERSION } from './sim-version.js';
import { createRecorder, decodeLog, encodeLog, inputBits } from './recorder.js';
import { replayLog } from './replay.js';
import { summariseRun } from './meet-sheet.js';
import { createMusic } from './music.js';
import { createSurge } from './run-surge.js';
import './good-lift.css';

// The meet sheet comes with the game, never with the page: the page draws it through the engine.
import GoodLiftResult from '../components/GoodLiftResult.jsx';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Whether a replay came to the very sheet the run itself did: the same ending, steps, total, peak
// and lights, lift for lift.
const sameSheet = (run, again) => !!again && !again.error && again.reason === run.reason && again.steps === run.steps &&
  again.total === run.total && again.peak === run.peak && again.lifts.length === run.lifts.length &&
  run.lifts.every((lift, i) => lift.red === again.lifts[i].red && lift.kg === again.lifts[i].kg && lift.good === again.lifts[i].good);

// Wall seconds a good lift holds the flight still for: a heartbeat, felt more than seen.
export const HIT_STOP = 0.07;
// The judges, in the order their lights stand: bit 0 of a lift's `red` is the first.
export const JUDGES = Object.freeze(['contact', 'control', 'airspace']);
// Seconds the lights stay up after a line, and between one pickup and the next for the next to
// ring a step higher.
const LIGHTS_FOR = 2.5;
const CHAIN = 2;
// The pentatonic steps a run of pickups climbs, in semitones.
const PENTA = [0, 2, 4, 7, 9];

// Kilograms as a meet writes them (182.5, 1,240) and metres with their thousands marked.
const kg = (value) => value.toLocaleString('en-GB', { maximumFractionDigits: 1 });
const metres = (value) => Math.round(value).toLocaleString('en-GB');

// What the run adds to the readouts: the bar's row, the judges' lights, the chevron and the glow
// along the bottom once Gjallarhorn has sounded.
const BAR_ROW = /* html */ '<dt class="fj-run">bar</dt><dd class="fj-run" data-hud="bar"></dd>';
const MARKUP = /* html */ `
  <div class="fj-horn" aria-hidden="true"></div>
  <div class="fj-chevron" aria-hidden="true" hidden></div>
  <div class="fj-title" aria-hidden="true" hidden>
    <small></small>
    <b data-text="GOOD LIFT">GOOD LIFT</b>
    <div class="fj-barbell"><i></i><i></i><em></em><i></i><i></i></div>
    <span></span>
  </div>`;
// The music's switch, beside the sounds' in the readouts and in the menu, shown only in the game.
const MUSIC_BUTTON = /* html */ '<button data-do="music" hidden>[ music: on ]</button>';
// Seconds the title card stays up as a run starts: the first of a visit in full, and shorter on
// every run after it, which gets no typed line.
const TITLE = Object.freeze({ full: 3.6, short: 2.2 });
// The lights head the column the notifications stack in, which the engine keeps clear of the
// readouts, so a milestone reached on a line never covers them.
// The call is also said, in a status line that is always there (a live region that appears with
// its words in it says nothing).
const LIGHTS = /* html */ `
  <div class="fj-lights" aria-hidden="true" hidden>
    <p><i style="--n: 0"></i><i style="--n: 1"></i><i style="--n: 2"></i></p>
    <b></b>
    <small></small>
  </div>
  <p class="fj-said" role="status"></p>`;

/**
 * Makes the run controller, once. `host` is what the engine shares:
 *
 *   g, controls, air        the glider, what is asked of it and the air it flies in: the very
 *                           objects the engine draws, so what the run flies is what is seen
 *   scene, camera           to draw in
 *   stage, view             the page element the game draws in, and its size ({ width, height })
 *   loadModel               scenery.js's loader (or a test's)
 *   effects                 the engine's effects: a run writes `want`, `floor` (the fog's height)
 *                           and `stop` (the hit-stop after a good lift)
 *   hud(name)               a readout cell
 *   compact()               whether the readouts are short of room
 *   best()                  the best height ever reached here, in metres
 *   unlock(id)              awards an achievement
 *   flash()                 the strike's flash over the picture
 *   sound                   { play, panned, audio }: the engine's one-off sounds and mixer
 *   touch, calm, bright()   a touch screen; reduced motion; whether the glow has been dropped
 *   base                    where the site is served from, for the music's files
 *   onMusic(on)             the music has been switched on or off, for the meet sheet's switch
 */
export function createGoodLift(host) {
  const { g, controls, air, scene, camera, effects, stage } = host;
  const sound = host.sound;
  const panned = (ctx, pan) => sound.panned(ctx, pan);
  const sky = createCloudbaseRun();
  const meet = createMeet();
  const bells = createBells();
  const world = createRunWorld({ sky, g, controls, air, bells, meet });
  // Feeling for the core: the lift surging as a circle closes on it (run-surge.js).
  const surge = createSurge();
  const view = createCloudbase({ scene, loadModel: host.loadModel });
  const meetView = createMeetView({ scene, loadModel: host.loadModel });
  // The run's own streaks, with its gust fronts, drawn after its fog.
  const streaks = createWindStreaks({ scene, order: ORDER.aboveFog, calm: host.calm, sky: RUN_SKY });
  // The run's controls, step by step: with its seed, all a run is. `whole` says the log holds every
  // step flown, none refused for want of room.
  const recorder = createRecorder();
  let whole = true;
  // Challenge links read and replayed, by their text: a replay takes some 30 ms, once is enough.
  const challenges = new Map();
  // The last run's log and sheet, for whoever wants to check it (QA replays it elsewhere).
  let lastRun = null;
  // What the hints and sounds have answered so far this run: strikes, and whether the last was a
  // kettlebell's; seconds turning against a flock and without lift; the hunted thermals ridden and
  // the one being ridden now; the meet's and the bells' counts; when the last close call came, the
  // horn and the run's first rep to depth, and whether this thermal's last rep missed its core; and
  // the pickups rung in a row and when the last of them was.
  const seen = {
    strikes: 0, bellHit: false, against: 0, searching: 0, rides: 0, riding: 0,
    thrown: 0, hits: 0, close: 0, count: 0, plates: 0, reps: 0, deep: 0, trails: 0, horn: false, shallow: false,
    closeAt: -Infinity, hornAt: -Infinity, deepAt: -Infinity, chain: 0, chainAt: -Infinity,
  };
  const held = { line: '', since: 0 };
  const moment = {};
  // How the last step left things, for the engine: whether a raven had the wing as it began, and
  // whether the glider is outside the sky.
  const last = { collapsed: false, outside: false };

  // The game's music, only beyond the arch: it starts as a run does, plays on between runs, and
  // stops as the pilot leaves for the fjord or the page (leave()). Its switch is its own (music.js).
  const music = createMusic({ base: host.base ?? '/' });

  // The run's own readouts, made once and taken away by dispose().
  const rows = stage.querySelector('.fj-hud dl');
  rows.insertAdjacentHTML('beforeend', BAR_ROW);
  stage.querySelector('.fj-toasts').insertAdjacentHTML('beforebegin', MARKUP);
  stage.querySelector('.fj-toasts').insertAdjacentHTML('afterbegin', LIGHTS);
  const barCell = host.hud('bar');
  const varioCell = host.hud('vario');
  const hornEl = stage.querySelector('.fj-horn');
  const lightsEl = stage.querySelector('.fj-lights');
  const lightEls = lightsEl.querySelectorAll('i');
  const callEl = lightsEl.querySelector('b');
  const detailEl = lightsEl.querySelector('small');
  const saidEl = stage.querySelector('.fj-said');
  const titleEl = stage.querySelector('.fj-title');
  const [titleSmall, titleBig, , titleLine] = titleEl.children;
  const chevronEl = stage.querySelector('.fj-chevron');
  for (const sound of stage.querySelectorAll('.fj-hud nav > [data-do="sound"], .fj-keys-more > [data-do="sound"]')) sound.insertAdjacentHTML('afterend', MUSIC_BUTTON);
  const musicButtons = [...stage.querySelectorAll('[data-do="music"]')];
  for (const button of musicButtons) button.addEventListener('click', () => toggleMusic());
  const ownEls = [...rows.querySelectorAll('.fj-run'), hornEl, lightsEl, saidEl, chevronEl, titleEl, ...musicButtons];
  let lightsTimer = 0;
  let saidTimer = 0;
  let titleTimer = 0;
  // Whether this visit has had its full title card yet.
  let titled = false;
  // When the run began, by the clock: the board ranks a tie by the earlier run.
  let startedAt = 0;
  const aimed = new Vector3();
  const chevron = { shown: false, x: NaN, y: NaN, turn: NaN };

  /**
   * Starts a run on the sky laid out from `seed`, settled at the gate, as every run starts. `sky`
   * is what that sky is ({ kind, day, target }, daily.js), for the title card.
   */
  function begin(seed, sky = null) {
    startRun(world, seed);
    recorder.reset();
    whole = true;
    startedAt = Date.now();
    seen.strikes = seen.against = seen.searching = seen.rides = seen.riding = 0;
    seen.thrown = seen.hits = seen.close = seen.count = seen.plates = seen.reps = seen.deep = seen.trails = seen.chain = 0;
    seen.bellHit = seen.horn = seen.shallow = false;
    seen.closeAt = seen.hornAt = seen.deepAt = seen.chainAt = -Infinity;
    surge.reset();
    varioCell.classList.remove('surge');
    barCell.classList.remove('depth');
    held.line = '';
    held.since = 0;
    last.collapsed = last.outside = false;
    view.begin();
    meetView.begin();
    hideLights();
    hornEl.classList.remove('on');
    showChevron(false);
    showTitle(seed, sky);
    // The music joins the engine's sound (made by now, a click having asked for it) and plays on
    // from run to run. On a phone the game keeps to its ambient sound, which the silent switch
    // silences: a media element playing would otherwise take every sound of the game past it
    // (Safari; one too old for navigator.audioSession still does). A page already out of sight, as
    // the game can finish loading after a tab switch, waits for the visitor to come back.
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    music.attach(sound.audio?.ctx);
    music.hide(document.hidden);
    music.start();
    labelMusic(true);
  }

  /** The pilot has left Good Lift, for the fjord or the page: its music stops (`now`, at once). */
  function leave(now = false) {
    music.stop(now);
    labelMusic(false);
  }

  // The music's switch: shown only in the game, and saying whether the music is on.
  function labelMusic(shown) {
    for (const button of musicButtons) {
      button.hidden = !shown;
      button.textContent = `[ music: ${music.on ? 'on' : 'off'} ]`;
    }
  }

  /** The music's switch, from the readouts, the menu, B or the meet sheet: whether it is now on. */
  function toggleMusic() {
    music.toggle();
    labelMusic(true);
    host.onMusic?.(music.on);
    return music.on;
  }

  // The card a run opens with: which sky it is, GOOD LIFT slammed in over a barbell, and (the first
  // time a visit) a typed line saying what to lift, or who there is to beat.
  function showTitle(seed, sky) {
    clearTimeout(titleTimer);
    const full = !titled;
    titled = true;
    const label = sky?.kind === 'daily'
      ? `Daily #${dailyNumber(sky.day)} · ${new Date(sky.day * DAY_MS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
      : `${sky?.kind === 'practice' ? 'practice · ' : ''}sky ${skyId(seed)}`;
    const rival = sky?.target && !sky.target.error ? sky.target : null;
    const line = rival
      ? `to beat: ${rival.who || 'a pilot'} · ${kg(rival.total)} kg · ${metres(rival.peak)} m`
      : 'opener at 250 m · three white lights';
    titleSmall.textContent = label;
    titleLine.textContent = full ? line : '';
    titleLine.style.setProperty('--chars', line.length);
    titleEl.className = `fj-title ${full ? 'full' : 'short'}`;
    titleEl.hidden = false;
    // Reading the layout lets the card start over when a run follows straight on from another.
    void titleEl.offsetWidth;
    titleEl.classList.add('on');
    titleTimer = setTimeout(() => {
      titleEl.hidden = true;
      titleEl.classList.remove('on');
    }, (full ? TITLE.full : TITLE.short) * 1000);
    clearTimeout(saidTimer);
    saidEl.textContent = '';
    saidTimer = setTimeout(() => (saidEl.textContent = `Good Lift. ${label}.${full ? ` ${rival ? line : 'The opener is at 250 metres.'}` : ''}`), 120);
  }

  /** One fixed step with the keys as `input`. Returns 'fog' or 'landed' if the run ended. */
  function step(dt, input) {
    // Four keys a step are recorded and flown through the one step every replay flies too, which
    // reads both ways at once as the speed bar: on a touch screen the only way to it. A run that
    // outlasts the log flies on unrecorded, and cannot then be raced or put on the board.
    const bits = inputBits(input);
    if (!recorder.push(bits)) whole = false;
    last.collapsed = sky.state.pilot.collapse > 0;
    const ended = stepBits(world, bits);
    last.outside = !sky.inside(g.pos);
    const { pilot, elapsed } = sky.state;
    const thrown = bells.state;
    if (pilot.strikes > seen.strikes) {
      seen.strikes = pilot.strikes;
      // A kettlebell's hit is counted by the bells in the very step its strike is called.
      seen.bellHit = thrown.hits > seen.hits;
      host.flash();
      playStrike(world.hook, !seen.bellHit);
    }
    seen.hits = thrown.hits;
    if (thrown.thrown > seen.thrown) {
      seen.thrown = thrown.thrown;
      hearThrow(thrown.bells[(thrown.thrown - 1) % thrown.bells.length]);
    }
    if (thrown.close > seen.close) {
      seen.close = thrown.close;
      seen.closeAt = elapsed;
      sound.play('close', 0.3, rush, sideOf(thrown.bells[(thrown.thrown - 1) % thrown.bells.length]));
      pickup(elapsed, 1);
    }
    answerMeet(meet.state, elapsed);
    // What the hints want to know, counted in the run's own time so the map pauses it too.
    seen.searching = g.lift < 1 ? seen.searching + dt : g.lift > 3 ? 0 : seen.searching;
    const flock = pilot.thermal > 0 ? sky.state.thermals[pilot.thermal] : null;
    seen.against = flock && Math.abs(g.yawRate) > 0.2 && Math.sign(g.yawRate) !== flock.dir ? seen.against + dt : 0;
    // A thermal that has moved is a new one to ride; coming back to the same one is not.
    const riding = flock ? pilot.thermal * 1e6 + Math.round(flock.x) * 1e3 + Math.round(flock.z) : seen.riding;
    if (riding !== seen.riding) {
      seen.riding = riding;
      seen.rides += 1;
      seen.shallow = false;
      surge.reset();
    }
    // The lift surging as a circle closes on the core is heard from the core's side, and flares
    // the vario for whoever has the sound off: the beat to straighten on.
    const flying = !!flock && pilot.collapse === 0 && g.stall === 0 && pilot.cloud === 0;
    if (surge.step(dt, g.lift, flock ? flock.strength : 1, g.yawRate, flying)) {
      sound.play('surge', 0.8, swell, clamp(g.liftSide * 2, -0.7, 0.7));
      flare(varioCell, 'surge');
    }
    awardMilestones(sky.state.peak);
    return ended;
  }

  // Answers what the meet did this step: a plate or a circle loaded, a trail laid, a line judged,
  // the horn sounded.
  function answerMeet(state, elapsed) {
    if (state.plates > seen.plates) {
      seen.plates = state.plates;
      pickup(elapsed, 1);
    }
    if (state.reps > seen.reps) {
      seen.reps = state.reps;
      // A rep to depth (its circle centred on the core) rings twice and stamps the bar. One off the
      // core is a plain rep, and the hints say how to centre the next.
      const deep = state.deep > seen.deep;
      seen.shallow = !deep;
      if (deep) {
        if (seen.deep === 0) seen.deepAt = elapsed;
        seen.deep = state.deep;
        flare(barCell, 'depth');
      }
      pickup(elapsed, deep ? 0.7 : 0.45, deep ? twice : ting);
    }
    if (state.trails > seen.trails) {
      seen.trails = state.trails;
      sound.play('trail', 1, sparkle);
    }
    if (state.count > seen.count) {
      seen.count = state.count;
      const lift = state.lifts[Math.min(state.count, state.lifts.length) - 1];
      // The bar judged as the run ends is the result's to show, not the flight's.
      if (lift.line > 0) {
        sound.play('judges', 0.5, judges, lift.red, lift.good);
        showLights(lift);
        if (lift.good && !host.calm) effects.stop = HIT_STOP;
      }
    }
    if (state.horn && !seen.horn) {
      seen.horn = true;
      seen.hornAt = elapsed;
      sound.play('horn', 10, horn);
      hornEl.classList.add('on');
    }
  }

  // A plate (or a circle) onto the bar: a ting that climbs the scale while pickups come thick.
  function pickup(elapsed, level, voice = ting) {
    seen.chain = elapsed - seen.chainAt < CHAIN ? Math.min(seen.chain + 1, 9) : 0;
    seen.chainAt = elapsed;
    sound.play('ting', 0.05, voice, seen.chain, 0.09 * level);
  }

  // Starts a readout's flare over, even while the last is still showing. It plays out by itself,
  // and ends looking as the readout always does, so the class can stay.
  function flare(cell, name) {
    cell.classList.remove(name);
    void cell.offsetWidth;
    cell.classList.add(name);
  }

  function awardMilestones(peak) {
    for (const milestone of CLOUD_MILESTONES) {
      if (peak >= milestone) host.unlock(`cloudbase-${milestone}`);
    }
  }

  /** What the run is doing to the wing, the picture and the camera: into `effects.want`. */
  function want() {
    const { pilot, fogHeight } = sky.state;
    runEffects('cloudbase', pilot, g.vy, g.pos.y - fogHeight, sky.depthAt(camera.position.x, camera.position.y, camera.position.z), effects.want);
    effects.floor = fogHeight;
  }

  /**
   * Draws the run's sky, the meet and the streaks, and points the chevron. `dt` is the frame's
   * seconds, 0 while paused; `quiet` says the map is over the flight.
   */
  function draw(dt, quiet = false) {
    const { elapsed } = sky.state;
    view.update(elapsed, g.pos, sky, camera.position);
    meetView.update(elapsed, g.pos, meet, bells, camera.position);
    streaks.update(dt, g.pos, camera.position, sky.windAt, 1, sky.state.fogHeight + 3, sky.state.gusts, host.bright());
    pointChevron(quiet);
  }

  // Off the screen, the place a kettlebell is coming down is shown by a mark at the screen's edge
  // pointing at it: while circling it sits well off the nose, out of a phone's narrow view.
  function pointChevron(quiet) {
    const thrown = bells.state;
    const bell = thrown.warning >= 0 ? thrown.bells[thrown.warning] : null;
    if (quiet || !bell || bell.phase !== BELL_PHASE.warning || bell.result !== BELL_RESULT.pending) {
      showChevron(false);
      return;
    }
    aimed.set(bell.aimX, bell.aimY + CLOUD_STRIKE.rise, bell.aimZ).project(camera);
    const behind = aimed.z > 1;
    let x = behind ? -aimed.x : aimed.x;
    let y = behind ? -aimed.y : aimed.y;
    if (!behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.9) {
      showChevron(false);
      return;
    }
    // Straight behind, it is below: the way a pilot turns round to look.
    if (Math.abs(x) + Math.abs(y) < 1e-6) y = -1;
    // Out along its own direction to a box just inside the screen's edge.
    const reach = Math.max(Math.abs(x), Math.abs(y));
    x = (x / reach) * 0.88;
    y = (y / reach) * 0.88;
    const { width, height } = host.view;
    const px = Math.round((x * 0.5 + 0.5) * width);
    const py = Math.round((-y * 0.5 + 0.5) * height);
    // The mark points up at no turn; screen y grows downward.
    const turn = Math.round(Math.atan2(x * width, y * height) * 50) / 50;
    showChevron(true);
    if (px === chevron.x && py === chevron.y && turn === chevron.turn) return;
    chevron.x = px;
    chevron.y = py;
    chevron.turn = turn;
    chevronEl.style.transform = `translate(${px}px, ${py}px) rotate(${turn}rad)`;
  }

  function showChevron(shown) {
    if (shown === chevron.shown) return;
    chevron.shown = shown;
    chevronEl.hidden = !shown;
  }

  // The three lights for a line just crossed, lit one after another, then the call.
  function showLights(lift) {
    clearTimeout(lightsTimer);
    const doubled = lift.good && lift.double;
    lightsEl.className = `fj-lights ${lift.good ? 'good' : 'none'}${doubled ? ' doubled' : ''}`;
    let reds = '';
    for (let i = 0; i < JUDGES.length; i++) {
      const red = (lift.red >> i) & 1;
      lightEls[i].className = red ? 'red' : 'white';
      if (red) reds += `${reds ? ', ' : ''}${JUDGES[i]}`;
    }
    callEl.textContent = lift.good ? (doubled ? 'GOOD LIFT ×2' : 'GOOD LIFT') : 'NO LIFT';
    const banked = lift.good ? lift.kg * (doubled ? MEET.double : 1) : 0;
    detailEl.textContent = lift.good ? `+${kg(banked)} kg${reds ? ` · red: ${reds}` : ''}` : `red: ${reds} · the bar drops`;
    lightsEl.hidden = false;
    // Reading the layout lets the lights start over if the last line's are still showing.
    void lightsEl.offsetWidth;
    lightsEl.classList.add('on');
    lightsTimer = setTimeout(hideLights, LIGHTS_FOR * 1000);
    // Emptied, then said a moment later, so the same call twice in a row is said twice.
    clearTimeout(saidTimer);
    saidEl.textContent = '';
    saidTimer = setTimeout(() => (saidEl.textContent = `${callEl.textContent}. ${detailEl.textContent}`), 120);
  }

  function hideLights() {
    clearTimeout(lightsTimer);
    lightsEl.hidden = true;
    lightsEl.classList.remove('on');
  }

  /** The run's sounds of the moment: the ravens calling, and a gust front heard coming. */
  function sounds() {
    callRavens();
    hearGust();
  }

  /** Writes the run's readouts and returns the hint line to show, or '' (`quiet` says show none). */
  function hud(quiet) {
    const { pilot, elapsed, fogHeight } = sky.state;
    const lift = meet.state;
    // The altitude is the one readout every screen shows, so it carries what has hit the wing, and
    // otherwise the next line to reach.
    const plight = pilot.collapse > 0 ? 'collapsed' : g.stall > 0 ? 'stalled' : pilot.cloud > 0.25 ? 'in cloud' : `next ${metres(lift.next)}`;
    host.hud('alt').textContent = `${Math.floor(g.pos.y)} m · ${plight}`;
    const clearance = Math.max(0, Math.floor(g.pos.y - fogHeight));
    host.hud('next').textContent = `${host.compact() ? '' : `peak ${Math.floor(sky.state.peak)} m · `}fog ${clearance} m below`;
    host.hud('speed').textContent = `${Math.round(g.speed * 3.6)} km/h`;
    host.hud('belt').textContent = `total ${kg(lift.total)} kg`;
    // The bar as it would be lifted at the next line, the empty bar included; where the belt is
    // not shown, the total rides with it.
    const bar = `${kg(lift.bar + MEET.bar)}${lift.horn ? ' kg ×2' : ' kg'}`;
    barCell.textContent = host.compact() ? `bar ${bar} · total ${kg(lift.total)} kg` : bar;
    barCell.classList.toggle('doubled', lift.horn);
    if (quiet) {
      hideLights();
      return '';
    }
    const column = pilot.thermal >= 0 ? sky.state.thermals[pilot.thermal] : null;
    moment.collapse = pilot.collapse;
    moment.stall = g.stall;
    moment.stallSide = g.stallSide;
    moment.brake = g.brake;
    moment.deep = effects.deep;
    moment.load = g.stallLoad;
    moment.gustAhead = pilot.gustAhead;
    // The pilot's own depth: the picture can be grey while only the camera is in the cloud.
    moment.cloud = pilot.cloud;
    moment.outside = last.outside;
    moment.elapsed = elapsed;
    moment.fogClearance = g.pos.y - fogHeight;
    moment.lift = g.lift;
    moment.headroom = pilot.headroom;
    moment.climbing = g.vy > 2;
    moment.thermal = pilot.thermal;
    // A hunted thermal is weak while it starts too; only one past its start is dying.
    moment.dying = !!column && column.strength < 0.85 && (pilot.thermal === 0 || column.age > CLOUD_HUNT.bloom);
    moment.flockDir = column ? column.dir : 1;
    moment.against = seen.against;
    moment.rides = seen.rides;
    moment.searching = seen.searching;
    moment.touch = host.touch;
    moment.bellHit = seen.bellHit;
    const coming = bells.state.warning >= 0 ? bells.state.bells[bells.state.warning] : null;
    moment.bell = coming && coming.result === BELL_RESULT.pending ? (coming.circling ? 1 : 2) : 0;
    moment.closeCall = elapsed - seen.closeAt;
    moment.horn = elapsed - seen.hornAt;
    moment.trail = lift.trail.live && lift.trail.boarded < 0;
    moment.shallow = seen.shallow;
    moment.depth = elapsed - seen.deepAt;
    return holdHint(held, cloudbaseHint(moment), elapsed);
  }

  /**
   * Ends the run and says how it went, for the meet sheet; nothing of it is left drawn. The fog and
   * a touchdown judge what is on the bar, and any other `reason` forfeits it. `flown` is the sky it
   * was flown on ({ kind, seed, day }, daily.js). A run ended silently (`record` false: Back, a
   * retry mid-run, leaving the page) is not recorded at all.
   */
  function finish(reason = 'quit', flown = null, record = true) {
    finishRun(world, reason);
    // The sheet, read the way a replay reads it: live play and replays can only differ if the
    // runs themselves did.
    const sheet = summariseRun(world, reason);
    awardMilestones(sheet.peak);
    // A run is the day's only on the day's own sky: any other seed is a named sky, whatever it was
    // asked for as, so its log can never claim a day it was not flown on.
    const daily = flown?.kind === 'daily' && flown.day > 0 && sheet.seed === seedFor(flown.day);
    const kind = daily ? 'daily' : flown?.kind === 'daily' ? 'sky' : flown?.kind ?? 'practice';
    const result = {
      ...sheet,
      kind,
      day: daily ? flown.day : 0,
      label: kind === 'daily' ? `Daily #${dailyNumber(flown.day)}` : `Sky ${skyId(sheet.seed)}`,
      best: { total: sheet.total, peak: sheet.peak },
      feats: { earned: [], fresh: [], streak: 0 },
      board: null,
      target: flown?.target ?? null,
      log: '',
      link: '',
      verified: false,
    };
    const { total, peak, lifts } = result;
    // A run recorded whole is its own proof: its log, replayed here and now, must come to the very
    // same sheet. Only then is it a link to race and a row on the board. (A touchdown's own step is
    // in the log but not in the run's count of steps flown, and a replay counts it the same way.)
    let written = '';
    let again = null;
    if (record && whole) {
      try {
        const log = encodeLog(
          { simVersion: SIM_VERSION, seed: sheet.seed, day: result.day, touch: !!host.touch, initials: readStore().initials, total, peak },
          recorder.bits,
          recorder.steps,
        );
        written = log;
        const read = decodeLog(log);
        again = read.ok ? replayLog(read.log) : { error: read.why };
        result.verified = sameSheet(sheet, again);
        if (result.verified) {
          result.log = log;
          result.link = `${location.origin}${gameHref({ kind: 'vs', vs: log })}`;
        } else console.warn('Good Lift: this run did not replay to the same sheet, so it stays off the board.');
      } catch (error) {
        console.warn('Good Lift: this run could not be written down.', error);
      }
    }
    // Kept for checking from outside: the log as written, verified or not, and what replaying it came to.
    lastRun = { log: result.log, written, again, result: sheet, recorded: recorder.steps, steps: world.steps };
    // Into this device's store: the bests, the tonnage, the feats, the daily streak and the day's
    // board. The feats it earned are announced by the sheet as it opens, never during a run.
    const before = readStore().best.total;
    const outcome = !record ? { feats: [] } : updateStore((store) => {
      // A rival raced on the day's own sky goes on its board too, as the link it came from, if the
      // sky judged that run: one ended with [ end run ] is on no board, here or where it was flown.
      const { target } = result;
      if (target && kind === 'daily' && (target.reason === 'fog' || target.reason === 'landed')) addRow(store.board, boardKey(SIM_VERSION, result.day), { who: target.who, via: 'link', total: target.total, peak: target.peak, red: target.red, at: startedAt, log: target.log });
      return recordRun(store, {
        kind, day: result.day, total, peak, red: lifts.map((each) => each.red), at: startedAt, log: result.log,
        reason: result.reason, feats: featsFor(result),
      }, { version: SIM_VERSION, now: Date.now() });
    });
    const stored = readStore();
    result.best = { ...stored.best };
    result.newBest = result.total > before;
    // The stored streak is as of the last Daily Sky flown: one not flown today or yesterday is over.
    const streak = stored.daily.last >= dayOf(Date.now()) - 1 ? stored.daily.streak : 0;
    result.feats = { earned: stored.feats, fresh: outcome.feats, streak };
    result.board = kind === 'daily' ? { rows: rowsFor(stored.board, boardKey(SIM_VERSION, result.day)), mine: result.log } : null;
    result.initials = stored.initials;
    // The sheet covers the readouts' switch (on a phone, the menu too), so it has its own.
    result.music = music.on;
    view.reset();
    meetView.reset();
    streaks.update(0, g.pos, camera.position, sky.windAt, 0, 0, null, false);
    effects.floor = -Infinity;
    effects.stop = 0;
    hideLights();
    hornEl.classList.remove('on');
    showChevron(false);
    clearTimeout(titleTimer);
    titleEl.hidden = true;
    titleEl.classList.remove('on');
    return result;
  }

  /** The initials the day's board writes this browser's runs under: '' or three letters. */
  function setInitials(text) {
    return updateStore((store) => nameRuns(store, text));
  }

  /**
   * A challenge link read and replayed on this sky: who flew it and what its controls truly come to
   * ({ who, seed, day, total, peak, red, log }), or { error } saying why it cannot be raced. The
   * numbers a link claims are never trusted.
   */
  function challenge(address) {
    const text = address?.vs ?? '';
    if (challenges.has(text)) return challenges.get(text);
    const read = decodeLog(text);
    let target;
    if (!read.ok) target = { error: read.why };
    else if (read.log.simVersion !== SIM_VERSION) target = { error: 'version' };
    else {
      const sheet = replayLog(read.log);
      target = sheet.error
        ? { error: sheet.error }
        : { who: read.log.initials, seed: read.log.seed, day: read.log.day, reason: sheet.reason, total: sheet.total, peak: sheet.peak, red: sheet.lifts.map((lift) => lift.red), log: text };
    }
    challenges.set(text, target);
    return target;
  }

  /**
   * The sky an address asks for ({ kind, seed, day }, daily.js). A challenge's is its log's, with
   * the run to beat as `target`; one flown on today's Daily Sky is today's daily, any other a named
   * sky. One that cannot be raced is the day's sky, with `notice` saying why.
   */
  function skyFor(address) {
    if (address?.kind !== 'vs') return resolveSky(address);
    const target = challenge(address);
    if (target.error) return { ...resolveSky(null), notice: target.error };
    // Today's Daily Sky only if it really is today's sky: a log can say today with another seed.
    const today = dayOf(Date.now());
    const daily = target.day > 0 && target.day === today && target.seed === seedFor(today);
    return { kind: daily ? 'daily' : 'sky', seed: target.seed, day: daily ? today : 0, target };
  }

  /** Replays a log's text here: its sheet, or { error }. QA checks a run's log against Node's. */
  function replay(text) {
    const read = decodeLog(text);
    return read.ok ? replayLog(read.log) : { error: read.why };
  }

  function dispose() {
    music.dispose();
    view.dispose();
    meetView.dispose();
    streaks.dispose();
    clearTimeout(lightsTimer);
    clearTimeout(saidTimer);
    clearTimeout(titleTimer);
    varioCell.classList.remove('surge');
    for (const el of ownEls) el.remove();
  }

  // Which side of the pilot a bell was thrown from, -1 left to 1 right.
  function sideOf(bell) {
    const dx = bell.fromX - g.pos.x;
    const dz = bell.fromZ - g.pos.z;
    return (dx * Math.cos(g.yaw) + dz * Math.sin(g.yaw)) / Math.max(1, Math.hypot(dx, dz));
  }

  // A throw is heard from the giant's side: his grunt, then the whistle of the bell coming down.
  function hearThrow(bell) {
    const side = sideOf(bell);
    sound.play('grunt', 1, grunt, side, bell.kg);
    sound.play('whistle', 1, whistle, side, bell.kg);
  }

  // A raven's call: a rough falling croak. `level` is its loudness and `pitch` raises it in alarm.
  function caw(ctx, at, level, pan, pitch) {
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(470 * pitch, at);
    voice.frequency.exponentialRampToValueAtTime(330 * pitch, at + 0.26);
    // The rasp comes from switching the voice on and off some seventy times a second.
    const rasp = ctx.createOscillator();
    rasp.type = 'square';
    rasp.frequency.value = 68;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    const throat = ctx.createGain();
    throat.gain.value = 0.55;
    rasp.connect(depth).connect(throat.gain);
    const beak = ctx.createBiquadFilter();
    beak.type = 'bandpass';
    beak.frequency.value = 1250;
    beak.Q.value = 1.4;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(level, at + 0.02);
    shape.gain.setTargetAtTime(0, at + 0.14, 0.05);
    voice.connect(throat).connect(beak).connect(shape).connect(panned(ctx, pan));
    voice.start(at);
    rasp.start(at);
    voice.stop(at + 0.4);
    rasp.stop(at + 0.4);
  }

  // A strike: a thud, the rattle of a wing losing its shape, and (from a raven, not a kettlebell)
  // the bird's own complaint.
  function thud(ctx, at, pan, bird) {
    const out = panned(ctx, pan);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(160, at);
    body.frequency.exponentialRampToValueAtTime(42, at + 0.22);
    const hit = ctx.createGain();
    hit.gain.setValueAtTime(0.5, at);
    hit.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    body.connect(hit).connect(out);
    body.start(at);
    body.stop(at + 0.32);
    const cloth = ctx.createBufferSource();
    cloth.buffer = sound.audio.noise;
    const flap = ctx.createBiquadFilter();
    flap.type = 'bandpass';
    flap.frequency.setValueAtTime(1400, at);
    flap.frequency.exponentialRampToValueAtTime(320, at + 1.6);
    const rattle = ctx.createGain();
    rattle.gain.setValueAtTime(0.28, at);
    rattle.gain.exponentialRampToValueAtTime(0.05, at + 1.6);
    rattle.gain.linearRampToValueAtTime(0, at + 2.1);
    cloth.loop = true;
    cloth.connect(flap).connect(rattle).connect(out);
    cloth.start(at, Math.random());
    cloth.stop(at + 2.15);
    if (bird) caw(ctx, at + 0.05, 0.11, pan, 1.25);
  }

  function playStrike(side, bird) {
    sound.play('strike', 1, thud, side * 0.4, bird);
  }

  // A gust front going over: a rush of air that rises, peaks as it arrives and dies away, moving
  // across from the side it comes from so its direction is heard.
  function whoosh(ctx, at, level, from) {
    const air = ctx.createBufferSource();
    air.buffer = sound.audio.noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.6;
    band.frequency.setValueAtTime(320, at);
    band.frequency.exponentialRampToValueAtTime(1100, at + 1);
    band.frequency.exponentialRampToValueAtTime(420, at + 2.4);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(level, at + 0.9);
    shape.gain.linearRampToValueAtTime(0, at + 2.4);
    const out = panned(ctx, 0.8 * from);
    if (out !== sound.audio.master) {
      out.pan.setValueAtTime(clamp(0.8 * from, -1, 1), at);
      out.pan.linearRampToValueAtTime(clamp(-0.8 * from, -1, 1), at + 2.2);
    }
    air.connect(band).connect(shape).connect(out);
    air.start(at, Math.random());
    air.stop(at + 2.45);
  }

  // A kettlebell going past close: a short rush of air from high to low.
  function rush(ctx, at, pan) {
    const air = ctx.createBufferSource();
    air.buffer = sound.audio.noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(1800, at);
    band.frequency.exponentialRampToValueAtTime(300, at + 0.45);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.2, at + 0.06);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
    air.connect(band).connect(shape).connect(panned(ctx, pan));
    air.start(at, Math.random());
    air.stop(at + 0.55);
  }

  // A plate onto the bar: a bright ting of two partials, `step` pentatonic steps above the first.
  function ting(ctx, at, step, level) {
    const f = 523.25 * 2 ** (PENTA[step % 5] / 12 + Math.floor(step / 5));
    for (const [ratio, gain, ring] of [[1, 1, 0.5], [2.76, 0.35, 0.18]]) {
      const tone = ctx.createOscillator();
      tone.frequency.value = f * ratio;
      const shape = ctx.createGain();
      shape.gain.setValueAtTime(0, at);
      shape.gain.linearRampToValueAtTime(level * gain, at + 0.005);
      shape.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      tone.connect(shape).connect(sound.audio.master);
      tone.start(at);
      tone.stop(at + ring + 0.02);
    }
  }

  // A rep to depth: the ting, and another a step higher straight after it.
  function twice(ctx, at, step, level) {
    ting(ctx, at, step, level);
    ting(ctx, at + 0.09, step + 2, level * 0.8);
  }

  // A trail laid: three quick tings up the scale, to say there are plates to fetch.
  function sparkle(ctx, at) {
    for (let i = 0; i < 3; i++) ting(ctx, at + i * 0.07, 5 + i * 2, 0.05);
  }

  // The lift surging under the wing: a soft swell of air with a low note rising in it, from the
  // side the core is on.
  function swell(ctx, at, pan) {
    const out = panned(ctx, pan);
    const air = ctx.createBufferSource();
    air.buffer = sound.audio.noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(260, at);
    band.frequency.exponentialRampToValueAtTime(760, at + 0.4);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.07, at + 0.14);
    shape.gain.setTargetAtTime(0, at + 0.2, 0.12);
    air.connect(band).connect(shape).connect(out);
    air.start(at, Math.random());
    air.stop(at + 0.9);
    const note = ctx.createOscillator();
    note.frequency.setValueAtTime(150, at);
    note.frequency.exponentialRampToValueAtTime(240, at + 0.32);
    const hum = ctx.createGain();
    hum.gain.setValueAtTime(0, at);
    hum.gain.linearRampToValueAtTime(0.05, at + 0.1);
    hum.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
    note.connect(hum).connect(out);
    note.start(at);
    note.stop(at + 0.47);
  }

  // Hrungnir throwing: a giant's grunt, lower for a heavier bell, and a breath with it.
  function grunt(ctx, at, pan, weight) {
    const out = panned(ctx, pan);
    const low = Math.sqrt(weight / BELLS.kg[1]);
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(76 / low, at);
    voice.frequency.exponentialRampToValueAtTime(50 / low, at + 0.42);
    const chest = ctx.createBiquadFilter();
    chest.type = 'lowpass';
    chest.frequency.value = 320;
    chest.Q.value = 2;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.34, at + 0.04);
    shape.gain.setTargetAtTime(0, at + 0.3, 0.08);
    voice.connect(chest).connect(shape).connect(out);
    voice.start(at);
    voice.stop(at + 0.75);
    const breath = ctx.createBufferSource();
    breath.buffer = sound.audio.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 600;
    band.Q.value = 0.8;
    const puff = ctx.createGain();
    puff.gain.setValueAtTime(0.14, at);
    puff.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
    breath.connect(band).connect(puff).connect(out);
    breath.start(at, Math.random());
    breath.stop(at + 0.4);
  }

  // The bell coming down: a whistle that falls as it nears and grows louder, lower for a heavier bell.
  function whistle(ctx, at, pan, weight) {
    const low = weight / BELLS.kg[1];
    const tone = ctx.createOscillator();
    tone.frequency.setValueAtTime(2200 / low, at);
    tone.frequency.exponentialRampToValueAtTime(700 / low, at + BELLS.lead);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0.0001, at);
    shape.gain.exponentialRampToValueAtTime(0.06, at + BELLS.lead * 0.9);
    shape.gain.linearRampToValueAtTime(0, at + BELLS.lead + 0.15);
    tone.connect(shape).connect(panned(ctx, pan));
    tone.start(at);
    tone.stop(at + BELLS.lead + 0.2);
  }

  // The judges: a clack as each light comes on, 150 ms apart (bright for white, dull for red), then
  // the call: plates clanking down onto the platform for a good lift, a low double buzz for none.
  function judges(ctx, at, red, good) {
    for (let i = 0; i < JUDGES.length; i++) clack(ctx, at + i * 0.15, (red >> i) & 1);
    if (good) clank(ctx, at + 0.55);
    else buzz(ctx, at + 0.55);
  }

  function clack(ctx, at, red) {
    const tap = ctx.createBufferSource();
    tap.buffer = sound.audio.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = red ? 700 : 2400;
    band.Q.value = 3;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0.3, at);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    tap.connect(band).connect(shape).connect(sound.audio.master);
    tap.start(at, Math.random());
    tap.stop(at + 0.06);
    const tone = ctx.createOscillator();
    tone.type = red ? 'square' : 'sine';
    tone.frequency.value = red ? 196 : 1320;
    const blip = ctx.createGain();
    blip.gain.setValueAtTime(red ? 0.05 : 0.07, at);
    blip.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    tone.connect(blip).connect(sound.audio.master);
    tone.start(at);
    tone.stop(at + 0.1);
  }

  // Iron plates set down hard: a few unrelated ringing partials over a low thump.
  function clank(ctx, at) {
    for (const [f, level, ring] of [[420, 0.12, 0.7], [1093, 0.08, 0.45], [1730, 0.05, 0.3], [2520, 0.03, 0.2]]) {
      const tone = ctx.createOscillator();
      tone.frequency.value = f;
      const shape = ctx.createGain();
      shape.gain.setValueAtTime(level, at);
      shape.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      tone.connect(shape).connect(sound.audio.master);
      tone.start(at);
      tone.stop(at + ring + 0.02);
    }
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(95, at);
    body.frequency.exponentialRampToValueAtTime(55, at + 0.2);
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(0.3, at);
    thump.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    body.connect(thump).connect(sound.audio.master);
    body.start(at);
    body.stop(at + 0.27);
  }

  function buzz(ctx, at) {
    const mouth = ctx.createBiquadFilter();
    mouth.type = 'lowpass';
    mouth.frequency.value = 900;
    mouth.connect(sound.audio.master);
    for (let i = 0; i < 2; i++) {
      const start = at + i * 0.25;
      const tone = ctx.createOscillator();
      tone.type = 'square';
      tone.frequency.value = 150;
      const shape = ctx.createGain();
      shape.gain.setValueAtTime(0, start);
      shape.gain.linearRampToValueAtTime(0.09, start + 0.01);
      shape.gain.setValueAtTime(0.09, start + 0.16);
      shape.gain.linearRampToValueAtTime(0, start + 0.18);
      tone.connect(shape).connect(mouth);
      tone.start(start);
      tone.stop(start + 0.2);
    }
  }

  // Gjallarhorn: a long low call and its fifth, swelling and brightening, then dying away.
  function horn(ctx, at) {
    const mouth = ctx.createBiquadFilter();
    mouth.type = 'lowpass';
    mouth.frequency.setValueAtTime(400, at);
    mouth.frequency.linearRampToValueAtTime(1400, at + 1.2);
    mouth.frequency.linearRampToValueAtTime(700, at + 2.6);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at + 0.5);
    shape.gain.setValueAtTime(0.16, at + 2);
    shape.gain.linearRampToValueAtTime(0, at + 2.8);
    mouth.connect(shape).connect(sound.audio.master);
    for (const ratio of [1, 1.5, 2]) {
      const voice = ctx.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(98 * ratio, at);
      voice.frequency.linearRampToValueAtTime(110 * ratio, at + 0.6);
      voice.connect(mouth);
      voice.start(at);
      voice.stop(at + 2.85);
    }
  }

  // The front about to reach the pilot is heard coming a moment before it arrives.
  function hearGust() {
    const { pilot, gusts } = sky.state;
    if (pilot.gustSlot < 0 || pilot.gustIn <= 0 || pilot.gustIn > 0.8) return;
    const band = gusts[pilot.gustSlot];
    // It comes from upwind of the pilot: which side is that?
    const from = -band.ux * Math.cos(g.yaw) - band.uz * Math.sin(g.yaw);
    sound.play('gust', 2.5, whoosh, 0.05 + 0.012 * band.strength, from);
  }

  // The nearest raven calls now and then, from the side it is on, so a flock can be found by ear;
  // one about to cross the pilot's path calls sharply and often.
  function callRavens() {
    const { pilot, ravens } = sky.state;
    if (pilot.shield > 0) return;
    let nearest = Infinity;
    let pan = 0;
    let alarm = null;
    for (const raven of ravens) {
      if (raven.fade < 0.5) continue;
      const dx = raven.x - g.pos.x;
      const dz = raven.z - g.pos.z;
      const range = Math.hypot(dx, raven.y - g.pos.y, dz);
      const side = (dx * Math.cos(g.yaw) + dz * Math.sin(g.yaw)) / Math.max(range, 1);
      if (raven.threat) alarm ??= side;
      if (range >= nearest) continue;
      nearest = range;
      pan = side;
    }
    // The two calls keep separate time: a quiet call a moment ago must not silence the alarm.
    if (alarm !== null) sound.play('alarm', 1.1, caw, 0.09, alarm, 1.2);
    else if (nearest < 180) sound.play('caw', 6, caw, 0.012 + 0.05 * (1 - nearest / 180) ** 2, pan, 1);
  }

  return {
    begin, step, want, draw, sounds, hud, finish, dispose, last, setInitials, leave, toggleMusic,
    /** A touch or a key: a play of the music the browser refused is tried again. */
    nudgeMusic: () => music.nudge(),
    /** The page went out of sight, or came back: the music waits for it. */
    hideMusic: (hidden) => music.hide(hidden),
    get musicState() { return { on: music.on, playing: music.playing, track: music.track, blocked: music.blocked }; },
    MeetSheet: GoodLiftResult,
    /** The sky an address asks for: { kind, seed, day }, and a challenge's `target`. */
    resolveSky: skyFor,
    challenge,
    replay,
    get lastRun() { return lastRun; },
    get sky() { return sky; },
    get meet() { return meet; },
    get bells() { return bells; },
    get surge() { return surge; },
    get view() { return view; },
    get meetView() { return meetView; },
    get streaks() { return streaks; },
    get world() { return world; },
  };
}
