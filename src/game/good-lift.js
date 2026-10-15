// Good Lift: the game beyond the arch. Everything a run needs that the fjord does not (the run's
// sky, ravens and storm clouds with their lightning, its gusts, the glide ring on its fog, the meet
// and Hrungnir's kettlebells, its hints, readouts and sounds, its milestones) lives here and is
// loaded only when a pilot is about to fly it, so the page's hero never carries it. The engine in
// game.js hands over what the two share through `host`.
import { Vector3 } from 'three';
import { CLOUD_HUNT, CLOUD_MILESTONES, CLOUD_STRIKE, RUN_SKY, createCloudbaseRun } from './cloudbase-state.js';
import { ORDER, createCloudbase } from './cloudbase.js';
import { runEffects } from './run-effects.js';
import { STONES_LEAD, cloudbaseHint } from './cloudbase-hints.js';
import { holdHint } from './hints.js';
import { BRAKE, PITCH, ROLL, pitchPeak } from './flight.js';
import { SWING_GAUGE } from './swing-gauge.js';
import { CATCH } from './pilots.js';
import { createRunWorld, finishRun, startRun, stepBits } from './run-step.js';
import { createWindStreaks } from './wind-streaks.js';
import { MEET, PLATE_KIND, TRAIL, createMeet } from './meet-state.js';
import { BELLS, BELL_PHASE, BELL_RESULT, createBells } from './bells.js';
import { BLESSING, GATE, GATES, RUNE, RUNE_NAME, RUNE_SIGN } from './meet-runes.js';
import { createMeetView } from './meet-view.js';
import { resolveSky, seedFor, skyId } from './daily.js';
import { featsFor } from './meet-card.js';
import { DAY_MS, dailyNumber, dayOf, gameHref } from './good-lift-address.js';
import { earnFeats, keepEarned, kitAfterRun, kitSheet, readStore, recordRun, setInitials as nameRuns, updateStore } from './good-lift-store.js';
import { readKit, writeKit } from './wing-kit.js';
import { createChalk } from './meet-chalk.js';
import { addRow, boardKey, outranks, rowsFor } from './board.js';
import { BOTS, createBots, landing, owing } from './meet-bots.js';
import { bynameFor } from './meet-bynames.js';
import { verseFor } from './meet-verse.js';
import { isBlocked } from './meet-initials.js';
import { SIM_VERSION } from './sim-version.js';
import { createRecorder, createTouchEars, decodeLog, encodeLog, inputBits } from './recorder.js';
import { replayLog } from './replay.js';
import { STYLE, createStyle } from './meet-style.js';
import { summariseRun } from './meet-sheet.js';
import { createMusic } from './music.js';
import { createSurge } from './run-surge.js';
import { createEntry } from './run-entry.js';
import { createOnlineBoard, placeOf, takenOff } from './board-online.js';
import { LIGHTNING, createLightning } from './run-lightning.js';
import { GLIDE, createGlideRing } from './run-glide.js';
import './good-lift.css';

// The meet sheet comes with the game, never with the page: the page draws it through the engine.
import GoodLiftResult from '../components/GoodLiftResult.jsx';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Whether a replay came to the very sheet the run itself did: the same ending, steps, total, peak
// and lights, lift for lift.
const sameSheet = (run, again) => !!again && !again.error && again.reason === run.reason && again.steps === run.steps &&
  again.total === run.total && again.peak === run.peak && again.lifts.length === run.lifts.length &&
  run.lifts.every((lift, i) => lift.red === again.lifts[i].red && lift.kg === again.lifts[i].kg && lift.good === again.lifts[i].good) &&
  again.stats.style === run.stats.style;

// Whether two kits (wing-kit.js's, normalised) are the same wing, helmet and chalk.
const sameKit = (a, b) => a.wing === b.wing && a.helmet === b.helmet && a.chalk === b.chalk;

// Wall seconds a good lift holds the flight still for: a heartbeat, felt more than seen.
export const HIT_STOP = 0.07;
// The judges, in the order their lights stand: bit 0 of a lift's `red` is the first.
export const JUDGES = Object.freeze(['contact', 'control', 'airspace']);
// Seconds the lights stay up after a line, and between one pickup and the next for the next to
// ring a step higher.
const LIGHTS_FOR = 2.5;
// When the next plate of a boarded trail is worth the ears: no further off than `ahead` (m), the
// wing more than `over` metres too high for it on the bar's glide, in lift under `lift` m/s, which
// the ears' 6 m/s still sinks through.
const EARS_REACH = Object.freeze({ ahead: 40, over: 2, lift: 6 });
// A flock worth flying into for the entry's hint: within `range` metres and `ahead` radians of the nose.
const APPROACH = Object.freeze({ range: 70, ahead: 1 });
const CHAIN = 2;
// The pentatonic steps a run of pickups climbs, in semitones.
const PENTA = [0, 2, 4, 7, 9];

// Kilograms as a meet writes them (182.5, 1,240) and metres with their thousands marked.
const kg = (value) => value.toLocaleString('en-GB', { maximumFractionDigits: 1 });
const metres = (value) => Math.round(value).toLocaleString('en-GB');

// What each rune stone offers, as the label over it says it: its rune and name, and in a few words
// what its blessing does (by RUNE). The hint says it in full once one is taken (cloudbase-hints.js).
export const GATE_LABELS = Object.freeze([
  null,
  Object.freeze(['ᚠ Fehu', 'plates come to you']),
  Object.freeze(['ᛉ Algiz', 'a kettlebell glances off']),
  Object.freeze(['ᚨ Ansuz', 'lift seen from afar']),
  Object.freeze(['ᛏ Tiwaz', 'plates ×2, a hit costs all']),
]);
// A stone's label stands `rise` metres over the middle of its opening (clear of its rune), and only
// while the pilot is within `range` metres of it: the stones round the lift being climbed.
const LABEL = Object.freeze({ rise: 4.5, range: 160 });
// How near (m, level) the plate under a storm cloud and the fog's bait must be for the hint to point
// at them: the cloud's is hung within THUNDER.inward (8 m) of the pilot and the bait BAIT.aside
// (20 m) off to a side, so a pilot further off than this has flown away from them.
const NOTICE = Object.freeze({ thunder: 40, bait: 60 });
// How a kettlebell came out, as the meet sheet names the Beast's (by BELL_RESULT).
const OUTCOMES = Object.freeze(['falling', 'hit', 'close', 'dodged', 'shielded', 'hidden', 'glanced']);

// What the run adds to the readouts: the bar's row, the judges' lights, the chevron and the glow
// along the bottom once Gjallarhorn has sounded.
const BAR_ROW = /* html */ '<dt class="fj-run">bar</dt><dd class="fj-run" data-hud="bar"></dd>';
// The run's style (meet-style.js), a row of its own that shows once a set of tricks has landed, and
// the line above the swing gauge saying the set in hand, and stamping it landed or lost.
const STYLE_ROW = /* html */ '<dt class="fj-run fj-trick">style</dt><dd class="fj-run fj-trick" data-hud="style"></dd>';
const STYLE_LINE = /* html */ '<p class="fj-style" aria-hidden="true"></p>';
// Seconds a set of tricks landed, and one lost, is stamped over the gauge.
const STAMP = Object.freeze({ landed: 1.6, lost: 1.4 });
const MARKUP = /* html */ `
  <div class="fj-horn" aria-hidden="true"></div>
  <div class="fj-chevron" aria-hidden="true" hidden></div>
  <div class="fj-title" aria-hidden="true" hidden>
    <small></small>
    <b data-text="GOOD LIFT">GOOD LIFT</b>
    <div class="fj-barbell"><i></i><i></i><em></em><i></i><i></i></div>
    <span></span>
  </div>`;
// The rune stones' labels, one for each stone of a set, laid in the picture under the readouts (as
// the fjord's labels for its places are), so neither the readouts nor the hint is ever covered.
const GATE_MARKUP = /* html */ `<div class="fj-gates" aria-hidden="true">${'<p class="fj-gate" hidden><b></b><small></small></p>'.repeat(GATES.count)}</div>`;
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
 *   onBots(bots)            the bots have landed on the sky the meet sheet shows: its medals, TST
 *                           for its board and any feat that earned (see askBots)
 *   onWorld(world)          the world board has answered for the Daily Sky the meet sheet shows: its
 *                           best runs, where this browser stands and what became of the run sent
 *                           (see shareWorld)
 *   kit(), wear(kit)        what the visitor flies in ({ wing, helmet, chalk }, wing-kit.js), and
 *                           dressing the glider in another; wear returns the kit now worn
 */
export function createGoodLift(host) {
  const { g, controls, air, scene, camera, effects, stage } = host;
  const sound = host.sound;
  const panned = (ctx, pan) => sound.panned(ctx, pan);
  const sky = createCloudbaseRun();
  const meet = createMeet();
  const style = createStyle();
  const bells = createBells();
  const world = createRunWorld({ sky, g, controls, air, bells, meet, style });
  // Feeling for the core: the lift surging as a circle closes on it (run-surge.js), and the moment
  // to turn into one, passing it on the flock's side (run-entry.js).
  const surge = createSurge();
  const entry = createEntry();
  // Both ▼ of a touch screen pressed together, for the big ears (recorder.js), and the controls the
  // keys and buttons ask for each step, written into the log as its bits.
  const touchEars = createTouchEars();
  const asked = { left: false, right: false, brake: false, bar: false, ears: false };
  const view = createCloudbase({ scene, loadModel: host.loadModel, calm: host.calm });
  const meetView = createMeetView({ scene, loadModel: host.loadModel, calm: host.calm });
  // The chalk the kit puts on the pilot's hands, puffing as a plate or a rep loads.
  const chalk = createChalk({ scene, calm: host.calm });
  // Lightning in the storm clouds, which for a moment shows where the hidden lift is, and the ring
  // on the fog that says how far the wing can glide before the fog catches it. Both only ever read
  // the run (run-lightning.js, run-glide.js).
  const lightning = createLightning({ scene, calm: host.calm });
  const glide = createGlideRing({ scene });
  // Seconds the glide ring's word has been said as a line this visit, and the run time the hint was
  // last chosen at.
  let taught = 0;
  let hintAt = 0;
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
  // The result the meet sheet was handed. The map opened over the sheet and closed draws it again
  // from this, so what the pilot changes there (initials, the opt-in, the kit) is kept in it too.
  let shownResult = null;
  // What the hints and sounds have answered so far this run: strikes, and whether the last was a
  // kettlebell's; seconds turning against a flock and without lift; the hunted thermals ridden and
  // the one being ridden now; the meet's and the bells' counts; when the last close call came (and
  // whether it was the Beast's), the horn and the run's first rep to depth, and whether this
  // thermal's last rep missed its core; the pickups rung in a row and when the last of them was;
  // the iron off the trail loaded, the sprays and the kg lost; bells turned aside by Algiz, stones
  // flown through and crumbled, and when the last blessing was taken, Algiz turned a bell aside and
  // Tiwaz lost the bar; the line of the last stones the climb came level with, and when; whether the
  // wing was surging, the tucks, tips and pumps answered and when the last tuck and tip came; whether the ears
  // have been pulled this run, and how long they have been held in climbing air; and when the moment
  // came to turn into a core, and which way.
  const seen = {
    strikes: 0, bellHit: false, against: 0, searching: 0, rides: 0, riding: 0,
    thrown: 0, hits: 0, close: 0, count: 0, plates: 0, reps: 0, deep: 0, trails: 0, horn: false, shallow: false,
    closeAt: -Infinity, hornAt: -Infinity, deepAt: -Infinity, chain: 0, chainAt: -Infinity, beastClose: false,
    wind: 0, bait: 0, sprays: 0, lost: 0, glanced: 0, gates: 0, crumbled: 0,
    blessedAt: -Infinity, glancedAt: -Infinity, lostAt: -Infinity, levelLine: 0, levelAt: -Infinity,
    surging: false, tucks: 0, pumps: 0, tuckAt: -Infinity, tips: 0, tipAt: -Infinity, earsUsed: false, earsClimb: 0, turnAt: -Infinity, turnSide: 0,
  };
  // The run's style as last answered (meet-style.js): sets landed and lost, the elements in the set in
  // hand and its name, the style shown and in which form, and when a set last landed or was lost, and
  // a trick was flown too low to count, with the stamp over the gauge and when it comes down, and
  // what the line over the gauge last showed (the stamp, or the points of the set in hand).
  const styled = {
    landed: 0, lost: 0, elements: 0, unscored: 0, total: -1, compact: null, inHand: '', trick: '', points: 0,
    landedAt: -Infinity, lostAt: -Infinity, unscoredAt: -Infinity, toldLow: false, stamp: '', stampUntil: -Infinity, stamped: null, pending: -1,
  };
  // The blessing the readouts show, by RUNE.
  let shownRune = RUNE.none;
  const held = { line: '', since: 0 };
  const moment = {};
  // How the last step left things, for the engine: whether a raven had the wing as it began, and
  // whether the glider is outside the sky.
  const last = { collapsed: false, outside: false };

  // The game's music, only beyond the arch: it starts as a run does, plays on between runs, and
  // stops as the pilot leaves for the fjord or the page (leave()). Its switch is its own (music.js).
  const music = createMusic({ base: host.base ?? '/' });

  // The bots the meet sheet takes its medals from (meet-bots.js): flown on a run's sky once its
  // sheet is open, and stopped whenever a run is flown or the pilot leaves. `owed` is the best run
  // the sky judged on the last sky asked for that is still to be held up against TST: a sheet put
  // away before the bots land (R at once) leaves its run owed, and it is judged when they land on
  // that sky for the next sheet. `botsSaid` is what they last told a sheet, for QA.
  const bots = createBots();
  let owed = null;
  let botsSaid = null;

  // The world board (board-online.js), if the build names its function; off, nothing is fetched.
  // `worldAsks` counts the sheets it has been asked for, so an answer that comes back after its
  // sheet was put away (a run begun, the pilot gone) is dropped; `worldSaid` is what it last told a
  // sheet, for QA and for taking this browser's run off again.
  const online = createOnlineBoard({ url: import.meta.env.VITE_BOARD_URL });
  let worldAsks = 0;
  let worldSaid = null;

  // The run's own readouts, made once and taken away by dispose().
  const rows = stage.querySelector('.fj-hud dl');
  rows.insertAdjacentHTML('beforeend', BAR_ROW + STYLE_ROW);
  stage.querySelector('.fj-toasts').insertAdjacentHTML('beforebegin', MARKUP);
  stage.querySelector('.fj-toasts').insertAdjacentHTML('afterbegin', LIGHTS);
  stage.querySelector('.fj-hud').insertAdjacentHTML('beforebegin', GATE_MARKUP);
  const barCell = host.hud('bar');
  const varioCell = host.hud('vario');
  const styleCell = host.hud('style');
  stage.querySelector('.fj-swing').insertAdjacentHTML('beforebegin', STYLE_LINE);
  const styleEl = stage.querySelector('.fj-style');
  const hornEl = stage.querySelector('.fj-horn');
  const lightsEl = stage.querySelector('.fj-lights');
  const lightEls = lightsEl.querySelectorAll('i');
  const callEl = lightsEl.querySelector('b');
  const detailEl = lightsEl.querySelector('small');
  const saidEl = stage.querySelector('.fj-said');
  const titleEl = stage.querySelector('.fj-title');
  const [titleSmall, titleBig, , titleLine] = titleEl.children;
  const chevronEl = stage.querySelector('.fj-chevron');
  const gatesEl = stage.querySelector('.fj-gates');
  // Each stone's label: where it was last put on screen, and the rune it names.
  const labels = [...gatesEl.children].map((el) => ({ el, name: el.children[0], gist: el.children[1], shown: false, x: NaN, y: NaN, rune: RUNE.none }));
  for (const sound of stage.querySelectorAll('.fj-hud nav > [data-do="sound"], .fj-keys-more > [data-do="sound"]')) sound.insertAdjacentHTML('afterend', MUSIC_BUTTON);
  const musicButtons = [...stage.querySelectorAll('[data-do="music"]')];
  for (const button of musicButtons) button.addEventListener('click', () => toggleMusic());
  const ownEls = [...rows.querySelectorAll('.fj-run'), styleEl, hornEl, lightsEl, saidEl, chevronEl, gatesEl, titleEl, ...musicButtons];
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
    // The bots never take a frame from a run: those still flying wait for the next sheet. Nor does
    // the world board's answer for the last one, which has no sheet left to show it.
    bots.pause();
    worldAsks += 1;
    startRun(world, seed);
    recorder.reset();
    whole = true;
    startedAt = Date.now();
    seen.strikes = seen.against = seen.searching = seen.rides = seen.riding = 0;
    seen.thrown = seen.hits = seen.close = seen.count = seen.plates = seen.reps = seen.deep = seen.trails = seen.chain = 0;
    seen.wind = seen.bait = seen.sprays = seen.lost = seen.glanced = seen.gates = seen.crumbled = 0;
    seen.levelLine = 0;
    seen.bellHit = seen.horn = seen.shallow = seen.beastClose = false;
    seen.closeAt = seen.hornAt = seen.deepAt = seen.chainAt = seen.blessedAt = seen.glancedAt = seen.lostAt = seen.levelAt = -Infinity;
    seen.tucks = seen.pumps = seen.tips = seen.earsClimb = seen.turnSide = 0;
    seen.surging = seen.earsUsed = false;
    seen.tuckAt = seen.tipAt = seen.turnAt = -Infinity;
    Object.assign(styled, {
      landed: 0, lost: 0, elements: 0, unscored: 0, total: -1, compact: null, inHand: '', trick: '', points: 0,
      landedAt: -Infinity, lostAt: -Infinity, unscoredAt: -Infinity, toldLow: false, stamp: '', stampUntil: -Infinity, stamped: null, pending: -1,
    });
    styleEl.textContent = '';
    styleEl.className = 'fj-style';
    rows.toggleAttribute('data-style', false);
    surge.reset();
    entry.reset();
    touchEars.reset();
    varioCell.classList.remove('surge');
    barCell.classList.remove('depth', 'blessed');
    showRune(RUNE.none);
    hideLabels();
    held.line = '';
    held.since = 0;
    last.collapsed = last.outside = false;
    view.begin();
    meetView.begin();
    chalk.wear(host.kit().chalk);
    chalk.begin();
    lightning.begin();
    glide.begin();
    hintAt = 0;
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

  /**
   * The pilot has left Good Lift, for the fjord or the page: its music stops (`now`, at once), and
   * its bots, and the world board's answer for the last sheet is not waited for.
   */
  function leave(now = false) {
    music.stop(now);
    labelMusic(false);
    bots.pause();
    worldAsks += 1;
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

  /**
   * One fixed step with the keys as `input`, and `first` and `second` whether each ▼ of a touch
   * screen is held. Returns 'fog' or 'landed' if the run ended.
   */
  function step(dt, input, first = false, second = false) {
    // The keys a step are recorded and flown through the one step every replay flies too, which
    // reads both ways at once as the speed bar: on a touch screen the only way to it. Both ▼ pressed
    // together are the big ears, as E is on keys. A run that outlasts the log flies on unrecorded,
    // and cannot then be raced or put on the board.
    const paired = touchEars.step(first, second);
    asked.left = input.left;
    asked.right = input.right;
    asked.bar = input.bar;
    asked.brake = input.brake && !paired;
    asked.ears = input.ears || paired;
    const bits = inputBits(asked);
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
      // Only one bell is ever in the air, so it is the last one thrown.
      const bell = thrown.bells[(thrown.thrown - 1) % thrown.bells.length];
      seen.close = thrown.close;
      seen.closeAt = elapsed;
      seen.beastClose = bell.beast;
      sound.play('close', 0.3, rush, sideOf(bell));
      pickup(elapsed, 1);
    }
    if (thrown.glanced > seen.glanced) {
      seen.glanced = thrown.glanced;
      seen.glancedAt = elapsed;
      sound.play('glance', 1, ricochet, sideOf(thrown.bells[(thrown.thrown - 1) % thrown.bells.length]));
    }
    answerMeet(meet.state, elapsed);
    answerRunes(meet.state.runes, elapsed);
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
      entry.reset();
    }
    // The moment the climb first comes level with a set of stones still waiting near it (from
    // STONES_LEAD under their opening's foot to its top): the time to dash for one, said once a set.
    const { runes } = meet.state;
    const under = runes.line - g.pos.y;
    if (runes.line !== seen.levelLine && under <= GATES.tall + STONES_LEAD && under >= -GATES.tall && stonesNear(runes)) {
      seen.levelLine = runes.line;
      seen.levelAt = elapsed;
    }
    // The lift surging as a circle closes on the core is heard from the core's side, and flares
    // the vario for whoever has the sound off: the beat to straighten on.
    const flying = !!flock && pilot.collapse === 0 && g.stall === 0 && pilot.cloud === 0;
    if (surge.step(dt, g.lift, flock ? flock.strength : 1, g.yawRate, flying)) {
      sound.play('surge', 0.8, swell, clamp(g.liftSide * 2, -0.7, 0.7));
      flare(varioCell, 'surge');
    }
    // The moment to turn in: a thump from the core's side, the climb's readout flaring cyan and the
    // wing over the core lifting, said by the hint with the way to turn.
    const turnIn = entry.step(dt, g.lift, flock ? flock.strength : 1, g.yawRate, g.liftSide, flock ? flock.dir : 1, flying);
    if (turnIn) {
      seen.turnAt = elapsed;
      seen.turnSide = turnIn;
      sound.play('lifted', 1, thump, clamp(turnIn * 0.7, -0.7, 0.7));
      flare(varioCell, 'lifted');
      effects.heave = turnIn;
    }
    answerWing(dt, elapsed);
    answerStyle(elapsed);
    awardMilestones(sky.state.peak);
    return ended;
  }

  // Answers what the wing did this step: a surge toward a fold, a tuck or a tip, a pump of a folded
  // wing, and the ears, which the hints keep count of. A surge caught is the engine's to hear
  // (game.js), over the fjord as here.
  function answerWing(dt, elapsed) {
    const surging = g.tuck === 0 && g.pitchRate < 0 && pitchPeak(g) < -CATCH.surge;
    if (surging && !seen.surging) sound.play('lurch', 0.4, lurch);
    seen.surging = surging;
    if (world.tucks > seen.tucks) {
      seen.tucks = world.tucks;
      seen.tuckAt = elapsed;
      sound.play('tuck', 0.5, flap);
    }
    // A tip collapse rattles from the side of the half that unloaded.
    if (world.tips > seen.tips) {
      seen.tips = world.tips;
      seen.tipAt = elapsed;
      sound.play('tip', 0.5, flap, 0.7 * g.tipSide);
    }
    if (world.pump.n > seen.pumps) sound.play('pump', 0.2, thunk);
    seen.pumps = world.pump.n;
    if (g.ears > 0) seen.earsUsed = true;
    seen.earsClimb = g.ears >= 0.9 && g.vy > 1 ? seen.earsClimb + dt : 0;
  }

  // What a set of tricks is called: its wingovers, its pitched swing, or, both in it, its tricks.
  function setName({ elements, rolls }) {
    if (rolls === elements) return `wingover ×${rolls}`;
    return rolls > 0 ? `tricks ×${elements}` : `pitch ×${elements}`;
  }

  // Answers what the style did this step (meet-style.js): an element scored in a set in hand, a rush
  // of air a step higher for each linked (a lone element, as a dodge turned back makes, is no set
  // yet, and passes unheard and unshown); a set landed, stamped over the gauge, flared on its
  // readout, rung and said; one lost, stamped struck through, with a falling pair of notes after the
  // fold's own sound; and a trick flown too low to count, told once a run.
  function answerStyle(elapsed) {
    const s = style.state;
    const inHand = s.elements >= STYLE.inHand;
    if (s.elements > styled.elements) {
      styled.inHand = setName(s);
      if (inHand && s.links > 0) sound.play('swish', 0.08, swish, s.links);
    }
    if (s.landed > styled.landed) {
      styled.landedAt = elapsed;
      styled.trick = styled.inHand;
      styled.points = s.said;
      styled.stamp = 'landed';
      styled.stampUntil = elapsed + STAMP.landed;
      styled.stamped = null;
      sound.play('landed', 0.5, arpeggio);
      flare(styleCell, 'lifted');
      if (lightsEl.hidden) {
        clearTimeout(saidTimer);
        saidEl.textContent = '';
        saidTimer = setTimeout(() => (saidEl.textContent = `Trick landed: ${styled.trick}, plus ${styled.points} style.`), 120);
      }
    }
    if (s.lost > styled.lost) {
      styled.lostAt = elapsed;
      styled.points = s.said;
      styled.stamp = 'lost';
      styled.stampUntil = elapsed + STAMP.lost;
      styled.stamped = null;
      sound.play('dud', 0.5, dud);
    }
    if (s.unscored > styled.unscored && !styled.toldLow) {
      styled.unscoredAt = elapsed;
      styled.toldLow = true;
    }
    styled.elements = s.elements;
    styled.landed = s.landed;
    styled.lost = s.lost;
    styled.unscored = s.unscored;
    // The line over the gauge: a stamp while it is up, or else the set in hand and what it is worth;
    // written only as one of them changes.
    const stamped = elapsed < styled.stampUntil ? styled.stamp : '';
    const pending = !stamped && inHand ? s.pending : -1;
    if (stamped !== styled.stamped || pending !== styled.pending) {
      styled.stamped = stamped;
      styled.pending = pending;
      styleEl.textContent = stamped === 'landed' ? `LANDED +${styled.points.toLocaleString('en-GB')}` : stamped === 'lost' ? `lost +${styled.points.toLocaleString('en-GB')}`
        : pending >= 0 ? `${styled.inHand} +${pending.toLocaleString('en-GB')}` : '';
      styleEl.className = stamped ? `fj-style ${stamped}` : 'fj-style';
    }
  }

  // Answers what the meet did this step: a plate or a circle loaded, a trail laid, a strike's
  // plates sprayed (or, under Tiwaz, the whole bar lost), a line judged, the horn sounded.
  function answerMeet(state, elapsed) {
    if (state.plates > seen.plates) {
      seen.plates = state.plates;
      pickup(elapsed, 1);
    }
    // A plate off a gust front comes with a rush of its air, the fog's bait with a ring from the mist.
    if (state.wind > seen.wind) {
      seen.wind = state.wind;
      sound.play('gale', 0.2, gale);
    }
    if (state.bait > seen.bait) {
      seen.bait = state.bait;
      sound.play('lure', 0.5, lure);
    }
    if (state.spray.n > seen.sprays) {
      seen.sprays = state.spray.n;
      let flying = 0;
      for (const plate of state.loose) if (plate.live && plate.kind === PLATE_KIND.scatter) flying += 1;
      sound.play('scatter', 1, clatter, flying);
    }
    // A strike under Tiwaz takes the whole bar; any other loses only what its plates cannot hold.
    if (state.lost > seen.lost) {
      seen.lost = state.lost;
      if (state.runes.blessing.rune === RUNE.tiwaz) seen.lostAt = elapsed;
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

  // Answers what the rune stones did this step: one flown through rings deep, and the rest of the
  // set crumbling is heard from the side they stand on.
  function answerRunes(runes, elapsed) {
    if (runes.taken > seen.gates) {
      seen.gates = runes.taken;
      seen.blessedAt = elapsed;
      const gate = runes.gates.find((each) => each.state === GATE.taken && each.ended === elapsed) ?? runes.gates[0];
      sound.play('chime', 1, chime, sideAt(gate.x, gate.z));
    }
    // Stones that crumbled this step: counted afresh for each set, which is raised all waiting.
    let crumbled = 0;
    let side = 0;
    for (let i = 0; i < runes.gates.length; i++) {
      const gate = runes.gates[i];
      if (gate.state !== GATE.crumbled) continue;
      crumbled += 1;
      if (gate.ended === elapsed) side += sideAt(gate.x, gate.z);
    }
    if (crumbled > seen.crumbled) sound.play('crumble', 1, rubble, side / (crumbled - seen.crumbled));
    seen.crumbled = crumbled;
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
    // Lightning first: it says which storm cloud is lit, and how much of the hidden lift shows, as
    // the sky is drawn. It picks only from clouds the sky drew whole last frame.
    lightning.update(elapsed, g.pos, sky, camera, view.shown);
    view.light(lightning.state.slot, lightning.state.glow);
    view.reveal(lightning.state.reveal);
    // Ansuz shows the hunted thermals' motes from twice as far. The blessing keeps its old key,
    // `sparks`: the rules' fingerprint reads every key of BLESSING, so a new name is a new version.
    const sight = meet.state.runes.blessing.rune === RUNE.ansuz ? BLESSING.sparks : 1;
    view.update(elapsed, g.pos, sky, camera.position, sight, host.bright());
    meetView.update(elapsed, g.pos, meet, bells, camera.position, sky);
    chalk.update(elapsed, g.pos, meet);
    glide.update(dt, g.pos, sky, g.lift);
    streaks.update(dt, g.pos, camera.position, sky.windAt, 1, sky.state.fogHeight + 3, sky.state.gusts, host.bright());
    pointChevron(quiet);
    pointLabels(quiet);
  }

  // Over each rune stone still waiting near the pilot, its rune and what it gives, where the stone
  // is on the screen: nothing for one behind the camera or off the screen's edge.
  function pointLabels(quiet) {
    const { gates } = meet.state.runes;
    const { width, height } = host.view;
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const gate = gates[i];
      let shown = !quiet && gate.state === GATE.waiting && !!GATE_LABELS[gate.rune] &&
        Math.hypot(gate.x - g.pos.x, gate.y - g.pos.y, gate.z - g.pos.z) <= LABEL.range;
      if (shown) {
        aimed.set(gate.x, gate.y + LABEL.rise, gate.z).project(camera);
        shown = aimed.z < 1 && Math.abs(aimed.x) <= 1 && Math.abs(aimed.y) <= 1;
      }
      if (shown !== label.shown) {
        label.shown = shown;
        label.el.hidden = !shown;
      }
      if (!shown) continue;
      if (gate.rune !== label.rune) {
        label.rune = gate.rune;
        label.name.textContent = GATE_LABELS[gate.rune][0];
        label.gist.textContent = GATE_LABELS[gate.rune][1];
      }
      const px = Math.round((aimed.x * 0.5 + 0.5) * width);
      const py = Math.round((-aimed.y * 0.5 + 0.5) * height);
      if (px === label.x && py === label.y) continue;
      label.x = px;
      label.y = py;
      label.el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
    }
  }

  function hideLabels() {
    for (const label of labels) {
      label.shown = false;
      label.el.hidden = true;
    }
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

  /** The run's sounds of the moment: the ravens calling, a gust front heard coming, and thunder. */
  function sounds() {
    callRavens();
    hearGust();
    hearThunder();
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
    const compact = host.compact();
    barCell.textContent = compact ? `bar ${bar} · total ${kg(lift.total)} kg` : bar;
    barCell.classList.toggle('doubled', lift.horn);
    // The style, once a set of tricks has landed: written as it changes, or as the readouts change
    // form (a phone turned, a window narrowed).
    const total = style.state.total;
    if (total !== styled.total || compact !== styled.compact) {
      styled.total = total;
      styled.compact = compact;
      styleCell.textContent = compact ? `style ${total.toLocaleString('en-GB')}` : total.toLocaleString('en-GB');
      rows.toggleAttribute('data-style', total > 0);
    }
    // The blessing held rides beside the bar as its rune, lit up as it is taken.
    showRune(lift.runes.blessing.rune);
    if (quiet) {
      hideLights();
      return '';
    }
    const column = pilot.thermal >= 0 ? sky.state.thermals[pilot.thermal] : null;
    moment.collapse = pilot.collapse;
    moment.stall = g.stall;
    moment.stallSide = g.stallSide;
    moment.harsh = controls.harsh;
    moment.surging = seen.surging ? 1 : 0;
    moment.tucked = elapsed - seen.tuckAt;
    moment.tipped = elapsed - seen.tipAt;
    // Near a fold a trick can come to, where the wing can come to one.
    const tuckLine = PITCH.line + PITCH.held * Math.min(1, g.brake / BRAKE.light);
    moment.nearTuck = controls.folds && g.pitch < 0 && -g.pitch >= tuckLine - SWING_GAUGE.near && g.pitchRate < 0;
    moment.nearTip = controls.folds && Math.abs(g.bank) >= ROLL.limit - SWING_GAUGE.near;
    // The tricks: a set landed or lost, the set in hand, one being flown, and one flown too low.
    moment.landed = elapsed - styled.landedAt;
    moment.trick = styled.trick;
    moment.points = styled.points;
    moment.lost = elapsed - styled.lostAt;
    moment.unscored = elapsed - styled.unscoredAt;
    moment.inHand = style.state.elements >= STYLE.inHand ? styled.inHand : '';
    moment.inHandPitch = style.state.last === 1;
    moment.pitching = world.watch.state.pumping === 1;
    moment.wingover = world.watch.state.linking === 1 || world.watch.state.chain >= 2;
    moment.tricksLanded = style.state.landed;
    moment.ears = g.ears;
    moment.earsUsed = seen.earsUsed;
    moment.earsClimb = seen.earsClimb;
    moment.turnIn = elapsed - seen.turnAt;
    moment.turnSide = seen.turnSide;
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
    moment.beast = !!coming && coming.result === BELL_RESULT.pending && coming.beast;
    moment.closeCall = elapsed - seen.closeAt;
    moment.beastClose = seen.beastClose;
    moment.glanced = elapsed - seen.glancedAt;
    moment.barLost = elapsed - seen.lostAt;
    moment.horn = elapsed - seen.hornAt;
    const { runes } = lift;
    moment.blessing = runes.blessing.rune;
    moment.blessed = elapsed - seen.blessedAt;
    moment.double = runes.blessing.rune === RUNE.tiwaz;
    moment.trail = lift.trail.live && lift.trail.boarded < 0;
    moment.trailHigh = trailHigh(lift, runes);
    approach(pilot);
    moment.shallow = seen.shallow;
    moment.depth = elapsed - seen.deepAt;
    // The stones still waiting near the pilot, the line they stand at, when they were raised and
    // when the climb came level with them.
    moment.stones = stonesNear(runes) ? runes.line : 0;
    moment.stonesNew = elapsed - runes.gates[0].at;
    moment.stonesLevel = runes.line === seen.levelLine ? elapsed - seen.levelAt : Infinity;
    // The iron loose in the sky: a strike's plates flying, a front's plates not yet arrived (worth
    // a word to a pilot circling in lift, who has a circle to widen), and a plate under a cloud or
    // on the fog close enough to be worth one.
    moment.sprayed = moment.front = moment.thunder = moment.bait = false;
    for (let i = 0; i < lift.loose.length; i++) {
      const plate = lift.loose[i];
      if (!plate.live) continue;
      const level = Math.hypot(plate.x - g.pos.x, plate.z - g.pos.z);
      if (plate.kind === PLATE_KIND.scatter) moment.sprayed = true;
      else if (plate.kind === PLATE_KIND.wind && !plate.still && pilot.thermal >= 0) moment.front = true;
      else if (plate.kind === PLATE_KIND.thunder && level <= NOTICE.thunder) moment.thunder = true;
      else if (plate.kind === PLATE_KIND.bait && level <= NOTICE.bait) moment.bait = true;
    }
    moment.fronts = lift.fronts;
    // With nothing more pressing to say, the glide ring's word, until the visitor has had it up for
    // GLIDE.teach seconds this visit: by then its colours speak for themselves.
    const line = holdHint(held, cloudbaseHint(moment) || (taught < GLIDE.teach ? glide.state.line : ''), elapsed);
    if (line && line === glide.state.line) taught += Math.max(0, elapsed - hintAt);
    hintAt = elapsed;
    return line;
  }

  // Whether the next plate ahead on a trail already boarded lies further under the wing than the
  // bar's glide brings it down by the time it gets there, in air the ears can sink through: the
  // moment to say they would reach it. Worked out by hand, as stonesNear is.
  function trailHigh(lift, runes) {
    const { trail } = lift;
    if (!trail.live || trail.boarded < 0 || g.lift >= EARS_REACH.lift) return false;
    const reach = runes.blessing.rune === RUNE.fehu ? BLESSING.reach : TRAIL.reach;
    const here = (g.pos.x - trail.x) * trail.ux + (g.pos.z - trail.z) * trail.uz;
    for (let i = 0; i < trail.plates.length; i++) {
      const plate = trail.plates[i];
      if (!plate.live || (plate.x - trail.x) * trail.ux + (plate.z - trail.z) * trail.uz < here) continue;
      const dx = plate.x - g.pos.x;
      const dz = plate.z - g.pos.z;
      const across = Math.sqrt(dx * dx + dz * dz);
      if (across > EARS_REACH.ahead) return false;
      return g.pos.y - across * trail.slope - plate.y - reach > EARS_REACH.over;
    }
    return false;
  }

  // On the way into a thermal: whether a settled flock that still lifts lies ahead, close enough to
  // fly into, while the glider is in no hunted thermal yet, and which way that flock turns.
  function approach(pilot) {
    moment.approach = false;
    moment.approachDir = 1;
    if (pilot.thermal > 0) return;
    let nearest = APPROACH.range * APPROACH.range;
    const { thermals } = sky.state;
    for (let i = 1; i < thermals.length; i++) {
      const thermal = thermals[i];
      if (!thermal.live || thermal.move !== 0 || thermal.strength < MEET.alive) continue;
      const dx = thermal.x - g.pos.x;
      const dz = thermal.z - g.pos.z;
      const away = dx * dx + dz * dz;
      if (away >= nearest) continue;
      const off = Math.atan2(dx, -dz) - g.yaw;
      if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > APPROACH.ahead) continue;
      nearest = away;
      moment.approach = true;
      moment.approachDir = thermal.dir;
    }
  }

  // Whether any of the set of stones raised last still waits near the pilot (as its label would
  // show it): stones left behind round a lift the pilot has flown away from are not worth a word.
  // Asked every step, so worked out by hand (Math.hypot boxes the numbers it is handed).
  function stonesNear(runes) {
    for (let i = 0; i < runes.gates.length; i++) {
      const gate = runes.gates[i];
      const dx = gate.x - g.pos.x;
      const dz = gate.z - g.pos.z;
      if (gate.state === GATE.waiting && dx * dx + dz * dz <= LABEL.range * LABEL.range) return true;
    }
    return false;
  }

  // The rune beside the bar: the blessing held, or none. A new one flares as it is taken.
  function showRune(rune) {
    if (rune === shownRune) return;
    shownRune = rune;
    if (rune === RUNE.none) {
      delete barCell.dataset.rune;
      delete barCell.dataset.name;
      return;
    }
    barCell.dataset.rune = RUNE_SIGN[rune];
    barCell.dataset.name = RUNE_NAME[rune];
    flare(barCell, 'blessed');
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
      // When the run began: which run a sheet is for, so what the bots say of one is never shown on
      // the sheet of another.
      at: startedAt,
      best: { total: sheet.total, peak: sheet.peak },
      feats: { earned: [], fresh: [], streak: 0 },
      board: null,
      target: flown?.target ?? null,
      log: '',
      link: '',
      verified: false,
      // The byname the run earned its pilot and the skald's line for it, both read off its sheet
      // alone, so a replay of the run earns the same.
      byname: bynameFor(sheet),
      verse: verseFor(sheet),
    };
    const { total, peak, lifts } = result;
    // The initials the run goes under, read once: its log names its pilot by them, and only a run
    // flown under initials its pilot opted in to the world board with goes up to it.
    const { initials, optIn } = readStore();
    // A run recorded whole is its own proof: its log, replayed here and now, must come to the very
    // same sheet. Only then is it a link to race and a row on the board. (A touchdown's own step is
    // in the log but not in the run's count of steps flown, and a replay counts it the same way.)
    let written = '';
    let again = null;
    if (record && whole) {
      try {
        const log = encodeLog(
          { simVersion: SIM_VERSION, seed: sheet.seed, day: result.day, touch: !!host.touch, initials, total, peak },
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
    const was = readStore();
    const before = was.best.total;
    const outcome = !record ? { feats: [] } : updateStore((store) => {
      // A rival raced on the day's own sky goes on its board too, as the link it came from, if the
      // sky judged that run: one ended with [ end run ] is on no board, here or where it was flown.
      const { target } = result;
      if (target && kind === 'daily' && (target.reason === 'fog' || target.reason === 'landed')) addRow(store.board, boardKey(SIM_VERSION, result.day), { who: target.who, via: 'link', total: target.total, peak: target.peak, red: target.red, at: startedAt, log: target.log, byname: target.byname });
      return recordRun(store, {
        kind, day: result.day, total, peak, red: lifts.map((each) => each.red), at: startedAt, log: result.log,
        reason: result.reason, feats: featsFor(result), byname: result.byname,
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
    // Who flew it, for the sheet's header: initials typed on the sheet name the runs after it, and
    // change `initials` (setInitials), never this.
    result.pilot = stored.initials;
    // Whether the sheet has a world board to show beside this browser's, which is asked for below,
    // and whether the initials are the pilot's opt-in to it, or were set before it was offered.
    result.online = online.on && kind === 'daily';
    result.optIn = stored.optIn;
    // The kit it earned, announced by the sheet like the feats: a rung of tonnage crossed, or a feat
    // (kitAfterRun, which also holds the kit kept to what has been earned here). It is worked out
    // from the kit kept, never from one tried on from the console (fjord.wear), which is never
    // written down: the end of the run takes that off, and the glider wears the kit kept again.
    const choice = readKit();
    const { kept, fresh } = kitAfterRun(choice, was, stored);
    if (!sameKit(kept, choice)) writeKit(kept);
    if (!sameKit(kept, host.kit())) host.wear(kept);
    result.kit = kitSheet(stored, kept, fresh);
    // The sheet covers the readouts' switch (on a phone, the menu too), so it has its own.
    result.music = music.on;
    // The runes and the Beast in words, for the sheet: the blessing held at the end, every rune
    // taken (from stats.runes, in RUNE order), and how the Beast came out (null if never thrown).
    const { blessing } = meet.state.runes;
    result.blessing = blessing.rune === RUNE.none ? null : { rune: blessing.rune, sign: RUNE_SIGN[blessing.rune], name: RUNE_NAME[blessing.rune], line: blessing.line };
    result.runes = [RUNE.fehu, RUNE.algiz, RUNE.ansuz, RUNE.tiwaz]
      .filter((rune) => (sheet.stats.runes >> (rune - 1)) & 1)
      .map((rune) => ({ rune, sign: RUNE_SIGN[rune], name: RUNE_NAME[rune] }));
    result.beast = bells.state.beast.n < 0 ? null : OUTCOMES[sheet.stats.beast] ?? null;
    view.reset();
    meetView.reset();
    chalk.reset();
    lightning.reset();
    glide.reset();
    streaks.update(0, g.pos, camera.position, sky.windAt, 0, 0, null, false);
    effects.floor = -Infinity;
    effects.stop = 0;
    hideLights();
    hideLabels();
    hornEl.classList.remove('on');
    showChevron(false);
    clearTimeout(titleTimer);
    titleEl.hidden = true;
    titleEl.classList.remove('on');
    // The bots fly the sky for the sheet; with no sheet to show, those still flying wait.
    if (record) askBots(result, stored.bots);
    else bots.pause();
    if (record && result.online) shareWorld(result, result.board.rows, !!initials && optIn).catch((error) => console.warn('Good Lift: the world board could not be asked.', error));
    shownResult = result;
    return result;
  }

  /**
   * The world board for the sheet of a Daily Sky run (board-online.js): the run sent up first if its
   * pilot opted in, then the day's board handed to the sheet through host.onWorld as { at, seed, day,
   * rows, rank, sent, removed, stays }: the board's best runs, where this browser stands on it (0 for
   * nowhere), what the function said of the run sent (null if none was), and (removeWorldRun) whether
   * this browser's run was taken off or stays. `rows` is the day's local board, best first, and
   * `optedIn` whether the run was flown under initials its pilot opted in with
   * (good-lift-store.js setInitials). The run is sent only then, and only if it replayed here to its
   * own sheet, was judged by the fog or a touchdown, and is this browser's best named run of the day
   * so far: the world board keeps each device's best, so no other could better this browser's place
   * on it. Never throws; offline or refused, the sheet just gets no world board.
   */
  async function shareWorld(result, rows, optedIn) {
    const ask = ++worldAsks;
    const own = rows.filter((row) => row.via === 'me' && row.who);
    const judged = result.reason === 'fog' || result.reason === 'landed';
    const sending = judged && optedIn && result.verified && own[0]?.log === result.log;
    const sent = sending ? await online.send(result.log, result.day) : null;
    if (ask !== worldAsks) return;
    const board = sent?.board ?? (await online.board(result.day));
    if (!board || ask !== worldAsks) return;
    const found = await placeOf(board.rows, own.map((row) => row.log));
    if (ask !== worldAsks) return;
    // A better run this device sent that its own board no longer holds (Reset progress clears it,
    // and keeps the device token): the function names its place when it turns this one away.
    const rank = found || (sent?.why === 'not-best' ? sent.rank : 0);
    worldSaid = {
      at: result.at, seed: result.seed, day: result.day, rows: board.rows, rank,
      sent: sent && { ok: sent.ok, why: sent.why, rank: sent.rank },
      removed: false,
      stays: false,
    };
    host.onWorld?.(worldSaid);
  }

  /**
   * Takes this browser's run off the world board, for the day the sheet's world board shows, and
   * tells the sheet: whether it went. A run of this browser's that went up from another browser
   * stays, and the sheet says only that one can take it off (board-online.js takenOff). The
   * initials still stand, so this browser's next best goes up again unless they are cleared.
   */
  async function removeWorldRun() {
    const shown = worldSaid;
    if (!shown || shown.removed || shown.stays) return false;
    const ask = worldAsks;
    // A browser that has never sent a run has no token to take one down with: the row the sheet
    // matched to it is a copy another browser sent, and it stays.
    const taken = online.token ? await online.remove(shown.day).catch(() => null) : { ok: true, removed: 0, board: null };
    if (ask !== worldAsks) return false;
    // Offline, slow or refused, the sheet says it could not be done, and the button asks again.
    if (!taken?.ok) {
      worldSaid = { ...shown, failed: true };
      host.onWorld?.(worldSaid);
      return false;
    }
    worldSaid = { ...shown, ...takenOff(shown, taken), sent: null, failed: false };
    host.onWorld?.(worldSaid);
    return worldSaid.removed;
  }

  /**
   * Asks the bots for the sky a sheet shows (meet-bots.js), and hands the sheet what they came to
   * through host.onBots once they have landed (meet-bots.js landing: the medals, the medal the run
   * took, TST for the board and the feats that earned), or { at, seed, failed: true } if they could
   * not fly. The Daily Sky's bots come from the store (`kept`, its day's) when they have flown it
   * today, and go into it when they have not.
   */
  function askBots(result, kept) {
    owed = owing(owed, result);
    const key = result.kind === 'daily' ? boardKey(SIM_VERSION, result.day) : '';
    const inStore = !!key && kept?.key === key && kept.seed === result.seed && kept.scores.length === BOTS.length;
    if (inStore) bots.remember(result.seed, kept.scores);
    bots.fly(result.seed, (scores) => landBots(result, scores, inStore ? '' : key));
  }

  // The bots are in: beat-the-bot for the best run owed on this sky if it out-lifted TST, the day's
  // scores into the store under `key` if they are not there yet, and the sheet told.
  function landBots(result, scores, key) {
    if (!scores) {
      botsSaid = { at: result.at, seed: result.seed, failed: true };
      host.onBots?.(botsSaid);
      return;
    }
    const due = owed?.seed === result.seed && outranks(owed, scores[0]);
    owed = null;
    let fresh = [];
    if (due || key) {
      fresh = updateStore((store) => {
        if (key && (store.bots?.key !== key || store.bots.seed !== result.seed)) {
          store.bots = { key, seed: result.seed, scores: scores.map(({ total, peak, red }) => ({ total, peak, red: [...red] })) };
        }
        return due ? earnFeats(store, ['beat-the-bot']) : [];
      });
    }
    botsSaid = landing(result, scores, fresh);
    host.onBots?.(botsSaid);
  }

  /**
   * The initials the day's board writes this browser's runs under: '' or three letters. Typed where
   * the sheet says they put this browser's best of each day on the world board, as it says whenever
   * the build names one, they are the pilot's opt-in to it (good-lift-store.js setInitials).
   */
  function setInitials(text) {
    const named = updateStore((store) => nameRuns(store, text, { world: online.on }));
    if (shownResult) {
      const stored = readStore();
      shownResult.initials = stored.initials;
      shownResult.optIn = stored.optIn;
    }
    return named;
  }

  /**
   * The kit tab's choice (any of { wing, helmet, chalk }, over the kit kept so far), kept to what
   * this device has earned, written down for every flight after it (wing-kit.js) and worn at once.
   * Returns the kit now worn.
   */
  function chooseKit(choice) {
    const kept = keepEarned({ ...readKit(), ...choice }, readStore());
    writeKit(kept);
    chalk.wear(kept.chalk);
    const worn = host.wear(kept);
    if (shownResult?.kit) shownResult.kit.worn = { ...worn };
    return worn;
  }

  /**
   * A challenge link read and replayed on this sky: who flew it, what its controls truly come to and
   * the byname that earns ({ who, seed, day, reason, total, peak, red, log, byname }), or { error }
   * saying why it cannot be raced. The numbers a link claims are never trusted, and initials the
   * board will not show (meet-initials.js) are shown as none, wherever the link was written.
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
        : {
          who: isBlocked(read.log.initials) ? '' : read.log.initials,
          seed: read.log.seed, day: read.log.day, reason: sheet.reason, total: sheet.total, peak: sheet.peak, red: sheet.lifts.map((lift) => lift.red), log: text,
          byname: bynameFor(sheet),
        };
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
    bots.dispose();
    music.dispose();
    view.dispose();
    meetView.dispose();
    chalk.dispose();
    lightning.dispose();
    glide.dispose();
    streaks.dispose();
    clearTimeout(lightsTimer);
    clearTimeout(saidTimer);
    clearTimeout(titleTimer);
    varioCell.classList.remove('surge');
    for (const el of ownEls) el.remove();
  }

  // Which side of the pilot a point is on, -1 left to 1 right (nought straight ahead or behind).
  function sideAt(x, z) {
    const dx = x - g.pos.x;
    const dz = z - g.pos.z;
    return (dx * Math.cos(g.yaw) + dz * Math.sin(g.yaw)) / Math.max(1, Math.hypot(dx, dz));
  }

  // Which side of the pilot a bell was thrown from.
  function sideOf(bell) {
    return sideAt(bell.fromX, bell.fromZ);
  }

  // A throw is heard from the giant's side: his grunt (for the Beast, a longer, lower heave), then
  // the whistle of the bell coming down, as long as its warning.
  function hearThrow(bell) {
    const side = sideOf(bell);
    if (bell.beast) sound.play('growl', 1, growl, side);
    else sound.play('grunt', 1, grunt, side, bell.kg);
    sound.play('whistle', 1, whistle, side, bell.kg, bell.lead);
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

  // The wing surging ahead toward a fold: its cloth whooshing forward over the pilot, a falling
  // rush in the band of the canopy's own noise, quicker than a gust's.
  function lurch(ctx, at) {
    const air = ctx.createBufferSource();
    air.buffer = sound.audio.noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.1;
    band.frequency.setValueAtTime(1300, at);
    band.frequency.exponentialRampToValueAtTime(420, at + 0.32);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at + 0.04);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.38);
    air.connect(band).connect(shape).connect(sound.audio.master);
    air.start(at, Math.random());
    air.stop(at + 0.4);
  }

  // A front tuck: the leading edge folding under with a short rattle of loose cloth, shorter and
  // lighter than a stall's (slump), and with no call in it.
  function flap(ctx, at, pan = 0) {
    const cloth = ctx.createBufferSource();
    cloth.buffer = sound.audio.noise;
    cloth.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.8;
    band.frequency.value = 900;
    const rattle = ctx.createGain();
    rattle.gain.setValueAtTime(0, at);
    for (let i = 0; i < 9; i++) {
      const when = at + i * 0.055;
      rattle.gain.setValueAtTime(0.13 * (1 - i / 10), when);
      rattle.gain.setValueAtTime(0.02, when + 0.025);
    }
    rattle.gain.linearRampToValueAtTime(0, at + 0.55);
    cloth.connect(band).connect(rattle).connect(pan ? panned(ctx, pan) : sound.audio.master);
    cloth.start(at, Math.random());
    cloth.stop(at + 0.56);
  }

  // A trick's element scored: a rush of air up the canopy's band, with a soft note a pentatonic step
  // higher for each linked (`links`), so a chain is heard climbing as the plates' tings do, in a
  // voice of its own.
  function swish(ctx, at, links = 1) {
    const air = ctx.createBufferSource();
    air.buffer = sound.audio.noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(600, at);
    band.frequency.exponentialRampToValueAtTime(1800, at + 0.22);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.05, at + 0.06);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.26);
    air.connect(band).connect(shape).connect(sound.audio.master);
    air.start(at, Math.random());
    air.stop(at + 0.28);
    const steps = [0, 2, 4, 7, 9, 12, 14, 16];
    const note = ctx.createOscillator();
    note.type = 'triangle';
    note.frequency.value = 392 * 2 ** (steps[Math.min(links, steps.length) - 1] / 12);
    const ring = ctx.createGain();
    ring.gain.setValueAtTime(0.04, at + 0.04);
    ring.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    note.connect(ring).connect(sound.audio.master);
    note.start(at + 0.04);
    note.stop(at + 0.32);
  }

  // A set of tricks landed: three bright notes up an arpeggio, and a faint shimmer.
  function arpeggio(ctx, at) {
    for (const [i, ratio] of [1, 1.5, 2].entries()) {
      const note = ctx.createOscillator();
      note.type = 'triangle';
      note.frequency.value = 523.25 * ratio;
      const ring = ctx.createGain();
      ring.gain.setValueAtTime(0.06, at + i * 0.07);
      ring.gain.exponentialRampToValueAtTime(0.001, at + i * 0.07 + 0.45);
      note.connect(ring).connect(sound.audio.master);
      note.start(at + i * 0.07);
      note.stop(at + i * 0.07 + 0.5);
    }
    const shimmer = ctx.createBufferSource();
    shimmer.buffer = sound.audio.noise;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 5000;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0.015, at + 0.14);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
    shimmer.connect(high).connect(shape).connect(sound.audio.master);
    shimmer.start(at + 0.14, Math.random());
    shimmer.stop(at + 0.62);
  }

  // A set of tricks lost: two soft notes falling, after the fold's own sound has had its moment.
  function dud(ctx, at) {
    for (const [i, freq] of [196, 164.81].entries()) {
      const note = ctx.createOscillator();
      note.type = 'triangle';
      note.frequency.value = freq;
      const ring = ctx.createGain();
      ring.gain.setValueAtTime(0.04, at + 0.25 + i * 0.16);
      ring.gain.exponentialRampToValueAtTime(0.001, at + 0.25 + i * 0.16 + 0.3);
      note.connect(ring).connect(sound.audio.master);
      note.start(at + 0.25 + i * 0.16);
      note.stop(at + 0.25 + i * 0.16 + 0.32);
    }
  }

  // A pump of a folded wing let go: a soft, low thunk of the cloth filling.
  function thunk(ctx, at) {
    const tone = ctx.createOscillator();
    tone.frequency.setValueAtTime(110, at);
    tone.frequency.exponentialRampToValueAtTime(68, at + 0.12);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.12, at + 0.01);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    tone.connect(shape).connect(sound.audio.master);
    tone.start(at);
    tone.stop(at + 0.18);
  }

  // The moment to turn into a core: a low thump from its side, falling where the surge's swell
  // rises, so the one says turn and the other straighten.
  function thump(ctx, at, pan) {
    const out = panned(ctx, pan);
    const tone = ctx.createOscillator();
    tone.frequency.setValueAtTime(110, at);
    tone.frequency.exponentialRampToValueAtTime(55, at + 0.25);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at + 0.008);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    tone.connect(shape).connect(out);
    tone.start(at);
    tone.stop(at + 0.32);
    const puff = ctx.createBufferSource();
    puff.buffer = sound.audio.noise;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 380;
    const breath = ctx.createGain();
    breath.gain.setValueAtTime(0.08, at);
    breath.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    puff.connect(low).connect(breath).connect(out);
    puff.start(at, Math.random());
    puff.stop(at + 0.24);
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

  // The Beast thrown: the giant's grunt lower and longer, heaving as he puts his back into it, and
  // a long breath out after it.
  function growl(ctx, at, pan) {
    const out = panned(ctx, pan);
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(48, at);
    voice.frequency.exponentialRampToValueAtTime(30, at + 1.1);
    // The heave: the voice swells and slackens six times a second.
    const heave = ctx.createOscillator();
    heave.frequency.value = 6;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    const throat = ctx.createGain();
    throat.gain.value = 0.7;
    heave.connect(depth).connect(throat.gain);
    const chest = ctx.createBiquadFilter();
    chest.type = 'lowpass';
    chest.frequency.value = 260;
    chest.Q.value = 2.5;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.36, at + 0.08);
    shape.gain.setValueAtTime(0.36, at + 0.7);
    shape.gain.setTargetAtTime(0, at + 0.75, 0.14);
    voice.connect(throat).connect(chest).connect(shape).connect(out);
    voice.start(at);
    heave.start(at);
    voice.stop(at + 1.5);
    heave.stop(at + 1.5);
    const breath = ctx.createBufferSource();
    breath.buffer = sound.audio.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.8;
    const puff = ctx.createGain();
    puff.gain.setValueAtTime(0, at);
    puff.gain.setValueAtTime(0, at + 0.6);
    puff.gain.linearRampToValueAtTime(0.12, at + 0.75);
    puff.gain.exponentialRampToValueAtTime(0.001, at + 1.5);
    breath.connect(band).connect(puff).connect(out);
    breath.start(at + 0.6, Math.random());
    breath.stop(at + 1.55);
  }

  // The bell coming down: a whistle that falls as it nears and grows louder, lower for a heavier
  // bell, and as long as its warning (`lead`: the Beast's is longer).
  function whistle(ctx, at, pan, weight, lead = BELLS.lead) {
    const low = weight / BELLS.kg[1];
    const tone = ctx.createOscillator();
    tone.frequency.setValueAtTime(2200 / low, at);
    tone.frequency.exponentialRampToValueAtTime(700 / low, at + lead);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0.0001, at);
    shape.gain.exponentialRampToValueAtTime(0.06, at + lead * 0.9);
    shape.gain.linearRampToValueAtTime(0, at + lead + 0.15);
    tone.connect(shape).connect(panned(ctx, pan));
    tone.start(at);
    tone.stop(at + lead + 0.2);
  }

  // A kettlebell turned aside by Algiz: iron struck a glancing blow, ringing bright, and the rush
  // of it going off the other way.
  function ricochet(ctx, at, pan) {
    const out = panned(ctx, pan);
    for (const [f, level, ring] of [[2100, 0.05, 0.5], [3170, 0.03, 0.35], [4890, 0.018, 0.2]]) {
      const tone = ctx.createOscillator();
      tone.frequency.value = f;
      const shape = ctx.createGain();
      shape.gain.setValueAtTime(level, at);
      shape.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      tone.connect(shape).connect(out);
      tone.start(at);
      tone.stop(at + ring + 0.02);
    }
    const away = ctx.createOscillator();
    away.frequency.setValueAtTime(1800, at + 0.03);
    away.frequency.exponentialRampToValueAtTime(500, at + 0.45);
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0.03, at + 0.03);
    fade.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    away.connect(fade).connect(out);
    away.start(at + 0.03);
    away.stop(at + 0.47);
  }

  // A rune stone flown through: a deep chime, a bell's partials over a hum an octave down, the low
  // ones ringing longest.
  function chime(ctx, at, pan) {
    const out = panned(ctx, pan * 0.5);
    for (const [ratio, level, ring] of [[0.5, 0.05, 2.6], [1, 0.07, 2.2], [1.19, 0.035, 1.5], [1.5, 0.03, 1.3], [2, 0.025, 1], [2.74, 0.012, 0.7]]) {
      const tone = ctx.createOscillator();
      tone.frequency.value = 196 * ratio;
      const shape = ctx.createGain();
      shape.gain.setValueAtTime(0, at);
      shape.gain.linearRampToValueAtTime(level, at + 0.01);
      shape.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      tone.connect(shape).connect(out);
      tone.start(at);
      tone.stop(at + ring + 0.02);
    }
  }

  // Stones crumbling: a dull knock, a run of grit as the pieces break away (further apart and
  // fainter as they go), and a low rumble under it.
  function rubble(ctx, at, pan) {
    const out = panned(ctx, pan);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(120, at);
    body.frequency.exponentialRampToValueAtTime(45, at + 0.3);
    const knock = ctx.createGain();
    knock.gain.setValueAtTime(0.14, at);
    knock.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
    body.connect(knock).connect(out);
    body.start(at);
    body.stop(at + 0.37);
    const grit = ctx.createBufferSource();
    grit.buffer = sound.audio.noise;
    grit.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500;
    band.Q.value = 1.1;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    let when = at + 0.04;
    for (let k = 0; k < 7; k++) {
      shape.gain.setValueAtTime(0, when);
      shape.gain.linearRampToValueAtTime(0.1 * (1 - k / 8), when + 0.008);
      shape.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
      when += 0.07 + k * 0.035;
    }
    grit.connect(band).connect(shape).connect(out);
    grit.start(at, Math.random());
    grit.stop(when + 0.1);
    const ground = ctx.createBufferSource();
    ground.buffer = sound.audio.noise;
    ground.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 220;
    const rumble = ctx.createGain();
    rumble.gain.setValueAtTime(0, at);
    rumble.gain.linearRampToValueAtTime(0.07, at + 0.1);
    rumble.gain.exponentialRampToValueAtTime(0.001, at + 1.1);
    ground.connect(low).connect(rumble).connect(out);
    ground.start(at, Math.random());
    ground.stop(at + 1.15);
  }

  // A strike's plates spraying off the bar: a clatter of iron, one clink a plate, from all round.
  function clatter(ctx, at, count) {
    for (let k = 0; k < count; k++) {
      const when = at + k * 0.045 + (k % 3) * 0.012;
      const out = panned(ctx, (k % 2 ? 1 : -1) * (0.25 + 0.1 * (k % 4)));
      for (const [f, level, ring] of [[1560 + 140 * (k % 5), 0.035, 0.16], [3720 + 210 * (k % 3), 0.015, 0.08]]) {
        const tone = ctx.createOscillator();
        tone.frequency.value = f;
        const shape = ctx.createGain();
        shape.gain.setValueAtTime(level, when);
        shape.gain.exponentialRampToValueAtTime(0.0001, when + ring);
        tone.connect(shape).connect(out);
        tone.start(when);
        tone.stop(when + ring + 0.02);
      }
    }
  }

  // A plate taken off a gust front: a quick rush of its air, rising, about as loud as a gust heard
  // coming (whoosh) and some 7 dB under the ting it comes with, in a band of its own above the
  // wind's: any fainter and the wind in the lines covers it.
  function gale(ctx, at) {
    const air = ctx.createBufferSource();
    air.buffer = sound.audio.noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(700, at);
    band.frequency.exponentialRampToValueAtTime(2600, at + 0.22);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.25, at + 0.03);
    shape.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    air.connect(band).connect(shape).connect(sound.audio.master);
    air.start(at, Math.random());
    air.stop(at + 0.32);
  }

  // The fog's bait taken: a low ring out of the mist, and the mist sighing under it.
  function lure(ctx, at) {
    for (const [f, level, ring] of [[147, 0.07, 0.9], [405, 0.03, 0.5]]) {
      const tone = ctx.createOscillator();
      tone.frequency.value = f;
      const shape = ctx.createGain();
      shape.gain.setValueAtTime(0, at);
      shape.gain.linearRampToValueAtTime(level, at + 0.01);
      shape.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      tone.connect(shape).connect(sound.audio.master);
      tone.start(at);
      tone.stop(at + ring + 0.02);
    }
    const mist = ctx.createBufferSource();
    mist.buffer = sound.audio.noise;
    mist.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 600;
    const sigh = ctx.createGain();
    sigh.gain.setValueAtTime(0, at);
    sigh.gain.linearRampToValueAtTime(0.05, at + 0.15);
    sigh.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
    mist.connect(low).connect(sigh).connect(sound.audio.master);
    mist.start(at, Math.random());
    mist.stop(at + 0.62);
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

  // Thunder: from a bolt close by, a crack and then the roll; from one far off only the roll, lower,
  // softer and slower to come up. It rolls because the sound from further along the bolt keeps
  // arriving after the first. Always quiet, a fifth as loud as a strike's thud or less: it is
  // weather, not news. It settles no lower than a phone's speaker can give. `distance` (m) is to the
  // nearest part of the bolt.
  function thunder(ctx, at, distance, pan) {
    const out = panned(ctx, pan);
    const far = clamp((distance - LIGHTNING.range[0]) / (LIGHTNING.range[1] - LIGHTNING.range[0]), 0, 1);
    const level = 0.16 - 0.08 * far;
    const air = ctx.createBufferSource();
    air.buffer = sound.audio.noise;
    air.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.Q.value = 0.7;
    low.frequency.setValueAtTime(1400 - 900 * far, at);
    low.frequency.exponentialRampToValueAtTime(140, at + 2);
    // The roll: the loudness swells and sags a few times a second.
    const roll = ctx.createGain();
    roll.gain.value = 0.7;
    const sway = ctx.createOscillator();
    sway.frequency.value = 2.5 + 2 * Math.random();
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    sway.connect(depth).connect(roll.gain);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(level, at + 0.04 + 0.25 * far);
    shape.gain.setTargetAtTime(0, at + 0.3 + 0.4 * far, 0.6 + 0.4 * far);
    air.connect(low).connect(roll).connect(shape).connect(out);
    air.start(at, Math.random());
    sway.start(at);
    air.stop(at + 4);
    sway.stop(at + 4);
    if (far >= 0.4) return;
    // A near one tears the air first: a short, bright crack.
    const tear = ctx.createBufferSource();
    tear.buffer = sound.audio.noise;
    const bright = ctx.createBiquadFilter();
    bright.type = 'highpass';
    bright.frequency.value = 1800;
    const crack = ctx.createGain();
    crack.gain.setValueAtTime(level * (1 - 2 * far), at);
    crack.gain.exponentialRampToValueAtTime(0.0005, at + 0.12);
    tear.connect(bright).connect(crack).connect(out);
    tear.start(at, Math.random());
    tear.stop(at + 0.14);
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

  // Thunder reaches the pilot as long after the flash as sound takes from the nearest part of the
  // bolt (counted in the run's own time, so the map holds it back too), from the side the bolt is on.
  function hearThunder() {
    if (!lightning.hear(sky.state.elapsed)) return;
    const strike = lightning.state;
    const dx = strike.x - g.pos.x;
    const dz = strike.z - g.pos.z;
    const side = (dx * Math.cos(g.yaw) + dz * Math.sin(g.yaw)) / Math.max(1, Math.hypot(dx, dz));
    sound.play('thunder', 2, thunder, strike.near, side * 0.7);
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
    begin, step, want, draw, sounds, hud, finish, dispose, last, setInitials, leave, toggleMusic, removeWorldRun, chooseKit,
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
    /** The meet sheet's bots: where they are with the sky they fly, and what they last told a sheet. */
    get bots() { return { ...bots.state, said: botsSaid }; },
    /**
     * The world board: whether the build names one, whether this browser has a device token yet (it
     * makes one as it first sends a run), the sheets asked for and what it last told one.
     */
    get worldBoard() { return { on: online.on, device: online.token !== null, asks: worldAsks, said: worldSaid }; },
    get sky() { return sky; },
    get meet() { return meet; },
    get bells() { return bells; },
    get surge() { return surge; },
    get entry() { return entry; },
    /** What the hint was last chosen from (cloudbaseHint's facts), as of the last readout. */
    get hintFacts() { return moment; },
    get view() { return view; },
    get meetView() { return meetView; },
    get chalk() { return chalk; },
    get lightning() { return lightning; },
    get glide() { return glide; },
    get streaks() { return streaks; },
    get world() { return world; },
    get style() { return style; },
  };
}
