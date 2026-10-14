import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { WORLD, ZONES, STONES, THERMALS, START, GATEWAY, centerX, heightAt, surfaceAt, buildTerrain } from './terrain.js';
import { PROJECT_PROPS, loadModel, buildSky, buildPlaces, buildScatter, buildThermals, buildGlider, buildGateway } from './scenery.js';
import { ACHIEVEMENTS, beltFor, readProgress, writeProgress, emptyProgress } from './achievements.js';
import { scoreLanding, createLandingLeg } from './landing.js';
import { sampleApproach, fjordBreeze } from './approach.js';
import { crossesGateway } from './gateway.js';
import { createCloudbase, ORDER as CLOUD_ORDER } from './cloudbase.js';
import { createCloudbaseRun, CLOUD_ZONE, CLOUD_MILESTONES, CLOUD_HUNT, CLOUD_RAVENS } from './cloudbase-state.js';
import { FLIGHT, BRAKE, createFlight, releaseFlight, settleFlight, stepFlight } from './flight.js';
import { runEffects } from './run-effects.js';
import { stallEffects, brakeMeter } from './stall-effects.js';
import { cloudbaseHint, holdHint } from './cloudbase-hints.js';
import { fjordHint } from './fjord-hints.js';
import { createLost } from './lost.js';
import { createWindStreaks } from './wind-streaks.js';
import './game.css';

const { clamp } = THREE.MathUtils;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const NIGHT = 0x060a13;
const STEP = 1 / 60;
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

// How many times faster the flight runs while boosting or flying itself to a place.
const HASTE = 3;

// In a Cloudbase run the camera looks up as the pilot climbs, because that is where the ravens
// and the storm clouds come from. At a full gaze it sits `back` metres further behind and `drop`
// lower, and aims `lift` higher; the gaze comes on at `rise` per second and goes at `fall`.
const GAZE = { back: 4, drop: 8, lift: 13, rise: 1.2, fall: 0.5 };

const KEYS = {
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'bar',
  KeyW: 'bar',
  // One brake, whichever of these holds it: deeper the longer it is held.
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'brake',
};

// Everything the game draws over its own canvas. The landing panel is not here: the page renders
// that, so it can reuse the same section components as the traditional page.
const MARKUP = /* html */ `
  <canvas class="fj-scene"></canvas>
  <div class="fj-veil"></div>
  <div class="fj-strike"></div>
  <div class="fj-labels"></div>
  <div class="fj-hud" hidden>
    <dl>
      <dt>alt</dt><dd data-hud="alt"></dd>
      <dt>vario</dt><dd data-hud="vario"></dd>
      <dt>speed</dt><dd data-hud="speed"></dd>
      <dt>next</dt><dd data-hud="next"></dd>
      <dt>belt</dt><dd data-hud="belt"></dd>
    </dl>
    <nav>
      <button data-do="map">[ <kbd>m: </kbd>map ]</button>
      <button data-do="keys" aria-expanded="false">[ <span class="for-keys">h: controls</span><span class="for-touch">≡ menu</span> ]</button>
      <button data-do="sound">[ sound: on ]</button>
      <button data-do="fullscreen">[ <kbd>f: </kbd>fullscreen ]</button>
      <button data-do="exit">[ <kbd>esc: </kbd>exit ]</button>
      <aside class="fj-keys" hidden>
        <p>controls</p>
        <dl>
          <dt>← →</dt><dd>steer <span>or A D</span></dd>
          <dt>space</dt><dd>brake: the longer you hold, the deeper · ease off before the red <span>or ↓ S</span></dd>
          <dt>↑</dt><dd>speed bar: hands up, faster and sinking more <span>or W</span></dd>
          <dt>enter</dt><dd>take off again once landed <span>or space</span></dd>
          <dt>shift</dt><dd>hold to speed time up</dd>
          <dt>click</dt><dd>a lit pillar or its label, to fly there by itself</dd>
          <dt>n</dt><dd>once landed, fly to the next place</dd>
          <dt>m</dt><dd>map: pick a place to fly to</dd>
          <dt>r</dt><dd>start again from the launch</dd>
          <dt>l · f</dt><dd>sound · fullscreen</dd>
          <dt>esc</dt><dd>back to the page</dd>
        </dl>
        <ul>
          <li>◀ ▶ steer</li>
          <li>▼ brake: hold longer to sink faster · let go before the red</li>
          <li>» hold to speed time up</li>
          <li>tap a lit pillar or its label to fly there by itself</li>
        </ul>
        <p class="fj-keys-goal">land inside a lit ring to read that part of the page</p>
        <div class="fj-keys-more">
          <button data-do="sound">[ sound: on ]</button>
          <button data-do="exit">[ <kbd>esc: </kbd>exit ]</button>
        </div>
        <button data-do="cloudbase" hidden>[ Cloudbase ]</button>
        <button data-do="quit-cloudbase" hidden>[ end run ]</button>
        <p class="fj-keys-goal fj-keys-run" hidden>Cloudbase: ravens circle where the air rises · turn the way they turn and climb beside them · keep out of the storm clouds · streaks show the wind and its gusts · time does not speed up in a run</p>
      </aside>
    </nav>
  </div>
  <div class="fj-toasts"></div>
  <div class="fj-brake" data-state="" aria-hidden="true"><b>brake</b><span><i></i><i></i></span></div>
  <div class="fj-hint"></div>
  <section class="fj-map window" hidden>
    <header><i></i><i></i><i></i><span>~/fjord/map — pick a place to fly to</span></header>
    <canvas class="fj-map-canvas" width="300" height="420"></canvas>
    <div class="fj-map-list"></div>
    <footer>
      <button data-do="map">[ <kbd>esc: </kbd>close ]</button>
      <button data-do="reset">[ reset progress ]</button>
    </footer>
  </section>
  <div class="fj-touch">
    <button data-input="left" aria-label="Steer left">◀</button>
    <button data-input="brake" aria-label="Brake">▼</button>
    <button data-input="boost" aria-label="Speed up">»</button>
    <button data-input="right" aria-label="Steer right">▶</button>
  </div>
  <div class="fj-fade"></div>`;

/**
 * Builds the fjord inside `stage` and starts drawing it as an idle backdrop: the glider circles and
 * nothing listens for input. `fly()` hands control to the visitor; `idle()` takes it back.
 *
 * hooks.onPanel({ id, path } | null)  a landing opened or closed its panel
 * hooks.onProgress(progress)          achievements or visited places changed
 * hooks.onExit()                      the visitor asked to leave the flight
 * hooks.onLost(stage)                 a beat of the missing-page emergency (see lost.js)
 * hooks.onCloudbase(result | null)     a run ended, or its result was dismissed
 */
export function createGame(stage, hooks = {}) {
  stage.insertAdjacentHTML('beforeend', MARKUP);
  const $ = (selector) => stage.querySelector(selector);
  const hud = (name) => $(`[data-hud="${name}"]`);
  const listeners = new AbortController();
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });

  // ---------------------------------------------------------------- scene

  const renderer = new THREE.WebGLRenderer({ canvas: $('.fj-scene'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(NIGHT, 0.003);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 5000);

  scene.add(new THREE.HemisphereLight(0x5f8fd8, 0x04060b, 1.1));
  const moon = new THREE.DirectionalLight(0xa9ccff, 1.6);
  moon.position.set(-0.6, 0.8, 0.3);
  scene.add(moon);

  const terrain = buildTerrain();
  const sky = buildSky();
  const places = buildPlaces();
  const thermals = buildThermals();
  const glider = buildGlider();
  const scatter = buildScatter(() => (terrain.cones.visible = false));
  const gateway = buildGateway();
  const cloudRun = createCloudbaseRun();
  let cloudView = null; // Heavy run visuals are allocated only on entry.
  scene.add(terrain.group, sky.group, places.group, scatter.group, thermals.group, glider.group);
  scene.add(gateway.group);

  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
  );
  composer.addPass(new RenderPass(scene, camera));

  // The glow pass blurs the picture, so a single pixel with no valid colour (a shader dividing by
  // zero, say) gets smeared into a large black block. This pass patches such pixels from their
  // neighbours before the glow sees them.
  const patch = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uTexel;
      varying vec2 vUv;
      // Comparisons against an invalid number are always false, so only real colours pass.
      bool valid(vec3 c) {
        return c.r >= 0.0 && c.r <= 60000.0 && c.g >= 0.0 && c.g <= 60000.0 && c.b >= 0.0 && c.b <= 60000.0;
      }
      void main() {
        vec3 colour = texture2D(tDiffuse, vUv).rgb;
        if (!valid(colour)) {
          vec4 sum = vec4(0.0);
          for (int i = 0; i < 4; i++) {
            vec2 side = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
            vec3 beside = texture2D(tDiffuse, vUv + side * uTexel).rgb;
            if (valid(beside)) sum += vec4(beside, 1.0);
          }
          colour = sum.a > 0.0 ? sum.rgb / sum.a : vec3(0.0);
        }
        gl_FragColor = vec4(colour, 1.0);
      }`,
  });
  composer.addPass(patch);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.6, 0.3));
  composer.addPass(new OutputPass());
  let useBloom = true;

  // The lens widens for a moment in a warp and stays a little wide while boosting.
  const lens = { base: 60, was: 60, now: 60, warp: 0, rising: false };

  // The scene fills its stage: the hero while idle, the whole window in flight.
  const view = { width: 1, height: 1 };
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
  // What the pilot asks of the wing and the air it is in, filled afresh at every step.
  const controls = { turn: 0, brake: false, bar: false, locked: false, harsh: false, linger: false, climb: null };
  const air = { lift: 0, sink: 0, windX: 0, windZ: 0, calm: true, rough: 0, clearance: Infinity };
  // What a Cloudbase run says of the air where the pilot is, written afresh each step.
  const forces = { lift: 0, sink: 0, liftSide: 0, windX: 0, windZ: 0, rough: 0 };
  const input = { left: false, right: false, bar: false, brake: false, boost: false };
  // Who is holding each control. Two keys, or a key and a button, can hold the same one, and it
  // is only let go when the last of them is.
  const holders = { left: new Set(), right: new Set(), bar: new Set(), brake: new Set(), boost: new Set() };
  function press(name, by, down) {
    if (down) holders[name].add(by);
    else holders[name].delete(by);
    input[name] = holders[name].size > 0;
  }
  let mode = 'intro'; // intro | flying | cloudbase | cloudbase-ended | landed | launching | lost
  const isAirborne = () => mode === 'flying' || mode === 'cloudbase';
  const landingLeg = createLandingLeg();
  const previousPosition = new THREE.Vector3();
  let fadeTimer = null;
  let disposed = false;
  let launchReveal = null;
  let revealShown = false;
  let cloudResult = null;
  let mapOpen = false;
  let keysOpen = false;
  let auto = null; // the place the glider is flying itself to, if any
  let hot = null; // the place under the pointer
  let panel = null;
  let climbStart = null;
  let outOfBounds = false;
  let time = 0;
  let airtime = 0;
  // How many times faster than the clock the flight is really running this frame.
  let haste = 1;
  // What a Cloudbase run is doing to the wing, the picture and the camera right now, eased frame
  // by frame toward what run-effects.js asks for (`want`), with what the hints have seen so far:
  // strikes already answered, which way the folded wing hooks, seconds spent turning against a
  // flock and without lift, and the hunted thermals ridden. None of it may outlive the run.
  // A stall does its own things to the wing in either kind of flying (`stall`, from
  // stall-effects.js): `foldLeft` and `foldRight` are each half of the wing as shown, from a strike
  // or a stall, and `fold` the more folded of the two. `stalled` is whether the stall has been
  // heard, `stalls` how many there have been this run, `deep` seconds the brake has been deep, and
  // `meter` what the brake meter shows (`meterShown`, what was last written to the page).
  const effects = {
    fold: 0, veil: 0, veilShown: 0, shake: 0, gaze: 0, want: { fold: 0, veil: 0, shake: 0, gaze: 0 },
    strikes: 0, hook: 1, against: 0, searching: 0, rides: 0, riding: 0, hint: { line: '', since: 0 }, gazeShown: -1,
    foldLeft: 0, foldRight: 0, luff: 0, stall: { left: 0, right: 0, luff: 0, shake: 0 }, stalled: false, stallSide: 0, stalls: 0, deep: 0,
    meter: { fill: 0, red: 0, state: '' }, meterShown: { fill: -1, red: -1, state: null }, fjordHint: { line: '', since: 0 },
  };
  const veilEl = $('.fj-veil');
  const strikeEl = $('.fj-strike');
  const hintEl = $('.fj-hint');
  const boostButton = $('.fj-touch [data-input="boost"]');
  const touchEl = $('.fj-touch');
  const meterEl = $('.fj-brake');
  const [meterWord, meterTrack] = meterEl.children;
  const [meterFill, meterRed] = meterTrack.children;
  // For looking at a run from the console: a seed to fly again, and the flight held still.
  let pinnedSeed = null;
  let held = false;

  const progress = readProgress();
  progress.visited.forEach((id) => places.setVisited(id));
  function persist() {
    writeProgress(progress);
    hooks.onProgress?.({ ...progress });
  }

  function unlock(id) {
    if (progress.unlocked.includes(id)) return;
    const before = beltFor(progress);
    progress.unlocked.push(id);
    persist();
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    toast(
      `<small>achievement ${progress.unlocked.length}/${ACHIEVEMENTS.length}</small><b>${achievement.name}</b>` +
        `<span>${achievement.text}</span><small>belt: ${before} → ${beltFor(progress)}</small>`,
    );
  }

  function clearInput() {
    for (const key of Object.keys(input)) {
      holders[key].clear();
      input[key] = false;
    }
  }

  function clearCloudResult() {
    cloudResult = null;
    hooks.onCloudbase?.(null);
    stage.classList.remove('cloudbase-ended');
  }

  function syncCloudbaseEntry() {
    for (const button of stage.querySelectorAll('[data-do="cloudbase"]')) button.hidden = !progress.cloudbase.discovered || mode === 'cloudbase';
    for (const button of stage.querySelectorAll('[data-do="quit-cloudbase"]')) button.hidden = mode !== 'cloudbase';
    $('.fj-keys-run').hidden = !progress.cloudbase.discovered;
    // Time does not speed up in a run, so its button becomes a second brake: one under each thumb,
    // so the brake can be held while steering either way.
    const second = mode === 'cloudbase';
    if ((boostButton.dataset.input === 'brake') !== second) {
      press(boostButton.dataset.input, boostButton, false);
      boostButton.dataset.input = second ? 'brake' : 'boost';
      boostButton.textContent = second ? '▼' : '»';
      boostButton.setAttribute('aria-label', second ? 'Brake' : 'Speed up');
    }
    touchEl.classList.toggle('pairs', second);
  }

  function awardMilestones(peak) {
    for (const milestone of CLOUD_MILESTONES) {
      if (peak >= milestone) unlock(`cloudbase-${milestone}`);
    }
  }

  // Opens the wing, clears the picture and forgets what the last run taught. Every way out of a
  // run comes through here, so a strike or a cloud can never follow the glider anywhere else.
  function clearRunEffects() {
    effects.fold = effects.veil = effects.veilShown = effects.shake = 0;
    effects.strikes = effects.against = effects.searching = effects.rides = effects.riding = 0;
    effects.foldLeft = effects.foldRight = effects.luff = effects.stalls = effects.deep = effects.stallSide = 0;
    effects.stalled = false;
    effects.hook = 1;
    releaseFlight(g);
    effects.hint.line = '';
    effects.hint.since = 0;
    veilEl.style.opacity = '0';
    strikeEl.classList.remove('on');
    hintEl.style.removeProperty('--gaze');
    effects.gazeShown = -1;
    if (audio) audio.next = {};
  }

  // A raven has hit the wing: note which way it was turning, flash the picture and make the noise.
  function struck() {
    effects.hook = Math.sign(g.yawRate) || 1;
    if (!calm) {
      strikeEl.classList.remove('on');
      void strikeEl.offsetWidth; // reading the layout lets a flash that is still fading start again
      strikeEl.classList.add('on');
    }
    playStrike(effects.hook);
  }

  function finishCloudbase(reason, show = true) {
    // The run engine already stops its clock when fog catches; UI finalization still follows.
    if (mode !== 'cloudbase') return null;
    cloudRun.finish();
    const peak = Math.floor(Math.max(cloudRun.state.peak, g.pos.y));
    progress.cloudbase.bestAltitude = Math.max(progress.cloudbase.bestAltitude, peak);
    awardMilestones(peak);
    const { strikes, cloudTime } = cloudRun.state.pilot;
    const result = { peak, best: progress.cloudbase.bestAltitude, reason, strikes, stalls: effects.stalls, cloud: Math.round(cloudTime) };
    persist();
    clearRunEffects();
    cloudView?.reset();
    thermals.group.visible = true;
    stage.classList.remove('cloudbase');
    mode = 'cloudbase-ended';
    settleFlight(g, 0);
    clearInput();
    if (show) {
      cloudResult = result;
      hooks.onCloudbase?.(result);
      stage.classList.add('cloudbase-ended');
      $('.fj-hud dl').hidden = true;
    }
    syncCloudbaseEntry();
    return result;
  }

  function beginCloudbase(throughGateway = false) {
    if (mode === 'intro' || mode === 'lost' || (!throughGateway && !progress.cloudbase.discovered)) return;
    clearTimeout(fadeTimer);
    $('.fj-fade').classList.remove('on');
    closeMap();
    showKeys(false);
    setAuto(null);
    setHot(null);
    if (!throughGateway) launchFrom(GATEWAY.x, 80, GATEWAY.z, Math.PI / 2);
    else closePanel();
    clearCloudResult();
    if (!throughGateway) clearInput();
    else {
      // Flown in through the arch, the steering carries on, but a boost or a brake held on the way
      // does not: neither means the same in a run.
      for (const name of ['boost', 'brake']) {
        holders[name].clear();
        input[name] = false;
      }
    }
    launchReveal = null;
    if (!progress.cloudbase.discovered) {
      progress.cloudbase.discovered = true;
      persist();
    }
    // Every run flies a sky of its own, laid out from a seed nobody chose.
    cloudRun.reset(g.pos.y, pinnedSeed ?? (Math.random() * 0x100000000) >>> 0);
    clearRunEffects();
    cloudView ??= createCloudbase({ scene, loadModel });
    cloudView.begin();
    mode = 'cloudbase';
    stage.classList.add('cloudbase');
    thermals.group.visible = false;
    $('.fj-hud dl').hidden = false;
    syncCloudbaseEntry();
    startAudio();
    if (!throughGateway) snapCamera();
  }

  function retryCloudbase() {
    if (mode === 'cloudbase') finishCloudbase('quit', false);
    beginCloudbase();
  }

  function backToFjord() {
    finishCloudbase('quit', false);
    closeMap();
    showKeys(false);
    setAuto(null);
    launchFrom(START.x, START.y, START.z, START.yaw);
    snapCamera();
    syncCloudbaseEntry();
  }

  function exitFlight() {
    finishCloudbase('quit', false);
    hooks.onExit?.();
  }

  // ---------------------------------------------------------------- flight

  function nearestZone(onlyUnvisited) {
    let best = null;
    let bestDist = Infinity;
    for (const zone of ZONES) {
      if (onlyUnvisited && progress.visited.includes(zone.id)) continue;
      const dist = Math.hypot(zone.x - g.pos.x, zone.z - g.pos.z);
      if (dist < bestDist) [best, bestDist] = [zone, dist];
    }
    return best && { zone: best, dist: bestDist };
  }

  function simulate(dt) {
    airtime += dt;
    previousPosition.copy(g.pos);
    const cloudFlying = mode === 'cloudbase';
    const inZone = cloudFlying && cloudRun.inside(g.pos);
    // A raven strike folds the wing: for a moment nothing the pilot does reaches it, and it keeps
    // hooking round the way it was already turning. Only a run can do this.
    const collapsed = cloudFlying && cloudRun.state.pilot.collapse > 0;
    let turn = collapsed ? effects.hook * FLIGHT.turn.hook : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (auto) {
      const want = Math.atan2(auto.x - g.pos.x, -(auto.z - g.pos.z));
      turn = clamp(wrapAngle(want - g.yaw) * 2.5, -1, 1);
    }
    outOfBounds = cloudFlying ? !inZone :
      Math.abs(g.pos.x) > WORLD.halfX - 50 || g.pos.z < WORLD.north + 45 || g.pos.z > WORLD.south - 45;
    if (outOfBounds) {
      // Past the edge of the map the wind steers you back toward the fjord.
      const tz = clamp(g.pos.z, WORLD.north + 140, WORLD.south - 140);
      const want = cloudFlying
        ? Math.atan2(CLOUD_ZONE.x - g.pos.x, -(CLOUD_ZONE.z - g.pos.z))
        : Math.atan2(centerX(tz) - g.pos.x, -(tz - g.pos.z));
      turn = clamp(wrapAngle(want - g.yaw) * 2, -1, 1);
    }

    // The air where the pilot is. Thermals are weak near the ground, so they never stop you landing.
    const agl = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    let lift = 0;
    let coreSide = 0;
    for (const thermal of cloudFlying ? [] : THERMALS) {
      const d = Math.hypot(g.pos.x - thermal.x, g.pos.z - thermal.z);
      if (d >= thermal.r) continue;
      const rising = thermal.s * smoothstep(thermal.r, thermal.r * 0.45, d);
      lift += rising;
      // How far to the right of the glider this thermal's core lies, from -1 to 1.
      const right = (thermal.x - g.pos.x) * Math.cos(g.yaw) + (thermal.z - g.pos.z) * Math.sin(g.yaw);
      coreSide += (rising * right) / thermal.r;
    }
    const approach = !cloudFlying && landingLeg.eligible ? sampleApproach(g.pos.x, g.pos.y, g.pos.z) : { x: 0, z: 0, lift: 0 };
    if (cloudFlying) {
      // The run's own air: its lift, the pull of a folded wing or a storm cloud, and a wind that
      // carries the pilot and gusts.
      cloudRun.sample(g.pos, g.yaw, forces);
      lift = inZone ? forces.lift : 0;
      air.sink = forces.sink;
      air.windX = forces.windX;
      air.windZ = forces.windZ;
      air.rough = forces.rough;
      g.liftSide = forces.liftSide;
    } else {
      // Over the fjord the only wind is the faint drift near each ring: it carries the pilot and
      // is never a gust.
      air.sink = 0;
      air.windX = approach.x;
      air.windZ = approach.z;
      air.rough = 0;
      g.liftSide = lift > 0 ? clamp(coreSide / lift, -1, 1) : 0;
    }
    air.calm = !cloudFlying;
    // Run cores must lift above the east-shore hillside immediately; normal air still fades near ground.
    lift *= inZone ? 1 : smoothstep(8, 45, agl) * (1 - smoothstep(WORLD.ceiling - 80, WORLD.ceiling, g.pos.y));
    lift += approach.lift;
    g.lift = air.lift = lift;
    air.clearance = agl;

    controls.turn = turn;
    controls.brake = input.brake && !auto;
    controls.bar = input.bar && !auto;
    controls.locked = collapsed;
    // A stall only costs real height high in a run; low over the launch hill it is the gentle kind.
    controls.harsh = cloudFlying && g.pos.y >= CLOUD_RAVENS.grace;
    controls.linger = cloudFlying;
    controls.climb = null;
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
    // A stall beginning or ending is heard once, and counted.
    if (g.stall > 0 && !effects.stalled) {
      effects.stalled = true;
      effects.stallSide = g.stallSide;
      effects.stalls += 1;
      playStall(g.stallSide, g.stallHarsh);
    } else if (g.stall === 0 && effects.stalled) {
      effects.stalled = false;
      // A raven strike ends a stall too, by folding the wing: that is no time for it to fill.
      if (!collapsed) playRefill(effects.stallSide);
    }
    effects.deep = g.brake >= BRAKE.shelf ? effects.deep + dt : 0;

    if (lift > 1 && g.vy > 0) {
      climbStart ??= g.pos.y;
      if (g.pos.y - climbStart >= 60) unlock('thermal');
    } else if (lift < 0.2) {
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

    const ground = surfaceAt(g.pos.x, g.pos.z);
    const here = ZONES.find((zone) => Math.hypot(g.pos.x - zone.x, g.pos.z - zone.z) < zone.r);
    if (here && g.pos.y - ground < 9) land(here);
    else if (g.pos.y - ground <= 1.4) land(null);
    if (mode === 'cloudbase') {
      const ended = cloudRun.step(dt, g.pos);
      const { pilot } = cloudRun.state;
      if (pilot.strikes > effects.strikes) {
        effects.strikes = pilot.strikes;
        struck();
      }
      // What the hints want to know, counted in the run's own time so the map pauses it too.
      effects.searching = g.lift < 1 ? effects.searching + dt : g.lift > 3 ? 0 : effects.searching;
      const flock = pilot.thermal > 0 ? cloudRun.state.thermals[pilot.thermal] : null;
      effects.against = flock && Math.abs(g.yawRate) > 0.2 && Math.sign(g.yawRate) !== flock.dir ? effects.against + dt : 0;
      // A thermal that has moved is a new one to ride; coming back to the same one is not.
      const riding = flock ? pilot.thermal * 1000 + Math.round(flock.x) : effects.riding;
      if (riding !== effects.riding) {
        effects.riding = riding;
        effects.rides += 1;
      }
      awardMilestones(cloudRun.state.peak);
      if (ended) finishCloudbase(ended);
    } else if (mode === 'flying' && !auto && crossesGateway(previousPosition, g.pos, GATEWAY)) {
      beginCloudbase(true);
    }
  }

  function land(zone) {
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
    if (mode === 'cloudbase') {
      // Landing content wins over the run ending; the result is rendered inline with it.
      finishCloudbase('landed');
    }
    mode = 'landed';
    stage.classList.remove('cloudbase-ended');
    setAuto(null);
    settleFlight(g, 0);
    effects.stalled = false;
    effects.deep = 0;
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

  function fadeThen(change) {
    clearTimeout(fadeTimer);
    $('.fj-fade').classList.add('on');
    fadeTimer = setTimeout(() => {
      if (disposed) return;
      change();
      snapCamera();
      $('.fj-fade').classList.remove('on');
    }, 320);
  }

  function launchFrom(x, y, z, yaw, assisted = false) {
    closePanel();
    clearCloudResult();
    landingLeg.begin(assisted);
    launchReveal = null;
    g.pos.set(x, y, z);
    g.yaw = yaw;
    settleFlight(g);
    climbStart = null;
    effects.gaze = 0;
    // A new flight starts with nothing said, and nothing of the last stall still showing. Nor is
    // a brake key pressed on the ground, or held through a restart, a brake in the air: key
    // repeats are ignored, so it stays off until it is pressed again.
    effects.fjordHint.line = '';
    effects.fjordHint.since = 0;
    effects.stalled = false;
    effects.deep = 0;
    holders.brake.clear();
    input.brake = false;
    mode = 'flying';
  }

  // Sends the glider to a place by itself, at boosted speed. Steering takes control back.
  function setAuto(zone) {
    auto = zone;
    // Flying itself, the glider has no use for a brake or a stall left over from the pilot.
    if (zone) releaseFlight(g);
    for (const { zone: each, el } of zoneLabels) el.classList.toggle('target', each === auto);
  }

  function autoFly(zone) {
    if (!zone || (!isAirborne() && mode !== 'landed')) return;
    if (mode === 'cloudbase') {
      finishCloudbase('travel', false);
      mode = 'flying';
    }
    clearCloudResult();
    landingLeg.assist();
    closeMap();
    setAuto(zone);
    if (mode === 'landed') takeOff();
  }

  function takeOff() {
    if (mode !== 'landed') return;
    mode = 'launching';
    fadeThen(() => {
      // Lift straight up from where you stand and face the next place worth visiting.
      const next = nearestZone(true) ?? nearestZone(false);
      const far = next.dist > 40 ? next.zone : { x: centerX(g.pos.z - 80), z: g.pos.z - 80 };
      const yaw = Math.atan2(far.x - g.pos.x, -(far.z - g.pos.z));
      launchFrom(g.pos.x, surfaceAt(g.pos.x, g.pos.z) + 75, g.pos.z, yaw, !!auto);
    });
  }

  function teleportTo(zone) {
    if (!zone) return;
    finishCloudbase('travel', false);
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
    if (mode === 'cloudbase' || mode === 'cloudbase-ended' || cloudResult) return retryCloudbase();
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
    onStage(name) {
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

  const forward = new THREE.Vector3();
  const chase = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function chaseTarget() {
    // With no gaze this is the ordinary chase: behind, a little above, looking just ahead.
    forward.set(Math.sin(g.yaw), 0, -Math.cos(g.yaw));
    chase.copy(g.pos).addScaledVector(forward, (camera.aspect < 1 ? -34 : -26) - GAZE.back * effects.gaze);
    chase.y += 9.5 - GAZE.drop * effects.gaze;
    lookAt.copy(g.pos).addScaledVector(forward, 14);
    lookAt.y += 3 + GAZE.lift * effects.gaze;
  }

  function snapCamera() {
    chaseTarget();
    camera.position.copy(chase);
  }

  // While set, the camera is parked at `from` looking at `at` (see the debug handle at the bottom).
  let spy = null;
  // How far the backdrop's camera has climbed above the glider, 0 to 1, and how far it is asked to.
  // The page raises it as the hero scrolls away, until the fjord is seen from above like a map.
  const climb = { now: 0, want: 0 };

  // As a backdrop the glider can be pulled about with the mouse: a drag near it holds it off to
  // one side, and a pointer passing by stirs it. Let go and it swings home. `x` and `y` are how far
  // it has been pulled across and up the screen, in metres, and `toX`, `toY` where a drag holds it.
  const TUG = { stiffness: 14, damping: 3.2, reachX: 13, reachY: 7, stir: 0.9, lean: 0.035 };
  const tug = { x: 0, y: 0, vx: 0, vy: 0, toX: 0, toY: 0, held: null };
  const across = new THREE.Vector3();
  const upward = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const roll = new THREE.Quaternion();

  // Where the glider is in the window, how near the pointer is to it, and the metres one pixel covers there.
  function tugReach(event) {
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
    if (event.target.closest?.('a, button, input, .window')) return;
    const { near, scale } = tugReach(event);
    if (!near) return;
    tug.held = { x: event.clientX - tug.x / scale, y: event.clientY + tug.y / scale, scale };
    document.documentElement.classList.add('tugging');
    event.preventDefault(); // a drag on the glider is not a text selection
  });
  on(window, 'pointermove', (event) => {
    if (mode !== 'intro' || event.pointerType !== 'mouse') return document.documentElement.classList.remove('tuggable');
    if (tug.held) {
      const { clamp } = THREE.MathUtils;
      tug.toX = clamp((event.clientX - tug.held.x) * tug.held.scale, -TUG.reachX, TUG.reachX);
      tug.toY = clamp((tug.held.y - event.clientY) * tug.held.scale, -TUG.reachY, TUG.reachY);
      return undefined;
    }
    const { near, scale } = tugReach(event);
    document.documentElement.classList.toggle('tuggable', near);
    if (near) {
      // One fast sweep of the mouse must not fling the glider away, so each nudge is capped.
      const { clamp } = THREE.MathUtils;
      tug.vx += clamp(event.movementX, -40, 40) * scale * TUG.stir;
      tug.vy -= clamp(event.movementY, -40, 40) * scale * TUG.stir;
    }
    return undefined;
  });
  on(window, 'pointerup', letGo);
  on(window, 'pointercancel', letGo);
  on(window, 'blur', letGo);

  // Moves the pull along by `dt` seconds and returns how far the wing leans into it.
  function tugStep(dt) {
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

  function updateCamera(dt) {
    if (spy) {
      camera.position.set(...spy.from);
      camera.lookAt(...spy.at);
      return;
    }
    if (mode === 'lost') return lostScene.aim(dt);
    if (mode === 'intro') {
      // As a backdrop the camera circles the glider, and climbs above it as the page scrolls away.
      // On a wide screen it aims a little to the glider's left, which puts the glider right of
      // centre and clear of the headline; the aim widens with distance to hold it there.
      climb.now += (climb.want - climb.now) * (1 - Math.exp(-dt * 5));
      const up = climb.now * climb.now * (3 - 2 * climb.now);
      const a = time * 0.12 + 2.6;
      const back = 38 + 22 * up;
      const above = 9 + 135 * up;
      const aside = camera.aspect > 1.2 && !view.centred ? 0.33 * Math.hypot(back, above - 4) : 0;
      // On an upright phone the headline fills the lower half, so the camera aims below the
      // glider, which lifts the glider into the upper half.
      const below = camera.aspect < 1 && !view.centred ? 13 : 0;
      camera.position.set(g.pos.x + Math.sin(a) * back, g.pos.y + above, g.pos.z + Math.cos(a) * back);
      camera.lookAt(g.pos.x - Math.cos(a) * aside, g.pos.y + (4 - below) * (1 - up), g.pos.z + Math.sin(a) * aside);
      return;
    }
    // Outside a run there is nothing to look up at, so the gaze eases back to the ordinary chase.
    const gaze = effects.want.gaze;
    effects.gaze += (gaze - effects.gaze) * (1 - Math.exp(-dt * (gaze > effects.gaze ? GAZE.rise : GAZE.fall)));
    if (effects.gaze < 1e-4 && gaze === 0) effects.gaze = 0;
    if (touch && mode === 'cloudbase') {
      // On a phone held sideways the hint rides between the pilot and the wing, and they sink
      // down the picture as the camera looks up: the stylesheet moves the line by this much.
      const shown = Math.round(effects.gaze * 50);
      if (shown !== effects.gazeShown) {
        effects.gazeShown = shown;
        hintEl.style.setProperty('--gaze', String(shown / 50));
      }
    }
    chaseTarget();
    if (launchReveal && mode === 'flying') {
      launchReveal.age += dt;
      if ((input.left || input.right) && launchReveal.age < 0.8) {
        launchReveal.age = 0.8;
        launchReveal.duration = 0.35;
      }
      const mix = smoothstep(0.8, 0.8 + launchReveal.duration, launchReveal.age);
      camera.position.copy(launchReveal.from).lerp(chase, mix);
      const at = launchReveal.at.clone().lerp(lookAt, mix);
      camera.lookAt(at);
      if (mix >= 1) launchReveal = null;
      return;
    }
    camera.position.lerp(chase, 1 - Math.exp(-dt * 3.2));
    camera.position.y = Math.max(camera.position.y, surfaceAt(camera.position.x, camera.position.z) + 4);
    if (mode === 'cloudbase') camera.position.y = Math.max(camera.position.y, cloudRun.state.fogHeight + 4);
    camera.lookAt(lookAt);
    camera.rotateZ(-g.bank * 0.25);
    if (effects.shake > 0) {
      // A turn of the head only, after the aim is set, so it can never drift.
      camera.rotateX(effects.shake * Math.sin(time * 53.1));
      camera.rotateY(effects.shake * Math.sin(time * 41.7 + 1.3));
    }
  }

  // ---------------------------------------------------------------- hud

  const labels = [];

  function addLabel(x, y, z, range, html, tag = 'div') {
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
  function placeLabels() {
    for (const { el, at, range } of labels) {
      const dist = at.distanceTo(camera.position);
      projected.copy(at).project(camera);
      const show = mode === 'flying' && !mapOpen && dist < range && projected.z < 1 && Math.abs(projected.x) < 1.05;
      el.style.display = show ? '' : 'none';
      if (!show) continue;
      const x = (projected.x * 0.5 + 0.5) * view.width;
      const y = (-projected.y * 0.5 + 0.5) * view.height;
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  function setHot(zone) {
    if (zone === hot) return;
    hot = zone;
    places.setHot(hot?.id ?? null);
    $('.fj-scene').style.cursor = hot ? 'pointer' : '';
    for (const { zone: each, el } of zoneLabels) el.classList.toggle('hot', each === hot);
  }

  // The place whose pillar of light passes under a point on screen, if any.
  const foot = new THREE.Vector3();
  const head = new THREE.Vector3();
  function pillarAt(clientX, clientY) {
    const box = stage.getBoundingClientRect();
    const px = clientX - box.left;
    const py = clientY - box.top;
    let best = null;
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

  on($('.fj-scene'), 'pointermove', (event) => setHot(mode === 'flying' && !mapOpen ? pillarAt(event.clientX, event.clientY) : null));
  on($('.fj-scene'), 'pointerleave', () => setHot(null));
  on($('.fj-scene'), 'click', (event) => mode === 'flying' && !mapOpen && autoFly(pillarAt(event.clientX, event.clientY)));

  // On a touch screen the hints name the on-screen buttons instead of keys.
  const touch = matchMedia('(pointer: coarse)').matches;
  // Visitors who ask for less motion keep everything that tells them something and lose the rest.
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The wind made visible, drawn after the run's fog so that a gust can be seen coming through it.
  const streaks = createWindStreaks({ scene, order: CLOUD_ORDER.aboveFog, calm });
  const moment = {};
  const fjordMoment = {};

  function hintText() {
    if (!isAirborne() || mapOpen) return '';
    if (mode === 'cloudbase') {
      const { pilot, elapsed, fogHeight } = cloudRun.state;
      const column = pilot.thermal >= 0 ? cloudRun.state.thermals[pilot.thermal] : null;
      moment.collapse = pilot.collapse;
      moment.stall = g.stall;
      moment.stallSide = g.stallSide;
      moment.brake = g.brake;
      moment.deep = effects.deep;
      moment.load = g.stallLoad;
      moment.gustAhead = pilot.gustAhead;
      // The pilot's own depth: the picture can be grey while only the camera is in the cloud.
      moment.cloud = pilot.cloud;
      moment.outside = outOfBounds;
      moment.elapsed = elapsed;
      moment.fogClearance = g.pos.y - fogHeight;
      moment.lift = g.lift;
      moment.headroom = pilot.headroom;
      moment.climbing = g.vy > 2;
      moment.thermal = pilot.thermal;
      // A hunted thermal is weak while it starts too; only one past its start is dying.
      moment.dying = !!column && column.strength < 0.85 && (pilot.thermal === 0 || column.age > CLOUD_HUNT.bloom);
      moment.flockDir = column ? column.dir : 1;
      moment.against = effects.against;
      moment.rides = effects.rides;
      moment.searching = effects.searching;
      moment.touch = touch;
      return holdHint(effects.hint, cloudbaseHint(moment), elapsed);
    }
    const near = nearestZone(false);
    fjordMoment.stall = g.stall;
    fjordMoment.stallSide = g.stallSide;
    fjordMoment.auto = auto ? auto.label : '';
    fjordMoment.arch = !progress.cloudbase.discovered && airtime < 4 && landingLeg.eligible;
    fjordMoment.outside = outOfBounds;
    fjordMoment.nearRing = near.dist < near.zone.r * 2.5;
    fjordMoment.unvisited = !progress.visited.includes(near.zone.id);
    fjordMoment.agl = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    fjordMoment.sinking = g.vy < 0;
    fjordMoment.airtime = airtime;
    fjordMoment.touch = touch;
    // Held on the frame clock, not the flight's: under boost the flight's runs three times as fast,
    // and a line has to stay up long enough to read in real time.
    return holdHint(effects.fjordHint, fjordHint(fjordMoment), time);
  }

  // The brake meter: two bars scaled across one track, written only when they change and only as
  // transforms, so the page never lays itself out again for them.
  const SCALES = Array.from({ length: 201 }, (_, i) => `scaleX(${i / 200})`);
  const METER_WORDS = { light: 'brake', late: 'brake', deep: 'deep', near: 'deep', stalled: 'stall' };
  function updateMeter() {
    // Nothing to show with the map open, while flying itself, or anywhere but in the air.
    const shown = isAirborne() && !mapOpen && !auto;
    brakeMeter(shown ? g.brake : 0, shown ? g.stallLoad : 0, shown ? g.stall : 0, effects.meter);
    const was = effects.meterShown;
    const fill = Math.round(effects.meter.fill * 200);
    const red = Math.round(effects.meter.red * 200);
    if (fill !== was.fill) meterFill.style.transform = SCALES[(was.fill = fill)];
    if (red !== was.red) meterRed.style.transform = SCALES[(was.red = red)];
    if (effects.meter.state !== was.state) {
      was.state = effects.meter.state;
      meterEl.dataset.state = was.state;
      touchEl.dataset.brake = was.state;
      // The word stays as it was while the meter fades out.
      if (METER_WORDS[was.state]) meterWord.textContent = METER_WORDS[was.state];
    }
  }

  function updateHud() {
    hud('alt').textContent = `${Math.max(0, Math.round(g.pos.y))} m`;
    const bars = Math.min(4, Math.round(Math.abs(g.vy) / 1.5));
    hud('vario').textContent = `${g.vy >= 0 ? '+' : '−'}${Math.abs(g.vy).toFixed(1)} m/s ${(g.vy >= 0 ? '▲' : '▼').repeat(bars)}`;
    hud('vario').classList.toggle('up', g.vy > 0.2);
    if (mode === 'lost') {
      hud('speed').textContent = `${Math.round(Math.abs(g.vy) * 3.6)} km/h down`;
      hud('next').textContent = 'nowhere · 404';
      hud('belt').textContent = `${beltFor(progress)} · ${progress.unlocked.length}/${ACHIEVEMENTS.length}`;
      $('.fj-hint').textContent = '';
      return;
    }
    if (mode === 'cloudbase') {
      // The altitude is the one readout every screen shows, so it carries what has hit the wing.
      const plight = cloudRun.state.pilot.collapse > 0 ? 'collapsed' : g.stall > 0 ? 'stalled' : cloudRun.state.pilot.cloud > 0.25 ? 'in cloud' : 'Cloudbase';
      hud('alt').textContent = `${Math.floor(g.pos.y)} m · ${plight}`;
      const clearance = Math.max(0, Math.floor(g.pos.y - cloudRun.state.fogHeight));
      hud('next').textContent = `${touch || view.width <= 560 ? '' : `peak ${Math.floor(cloudRun.state.peak)} m · `}fog ${clearance} m below`;
      hud('speed').textContent = `${Math.round(g.speed * 3.6)} km/h`;
      hud('belt').textContent = `best ${progress.cloudbase.bestAltitude} m`;
      $('.fj-hint').textContent = hintText();
      // The compact HUD can wrap on small phones; notifications must start below its real height.
      $('.fj-toasts').style.top = `${Math.ceil($('.fj-hud dl').getBoundingClientRect().bottom + 8)}px`;
      if (mapOpen) drawMap();
      return;
    }
    $('.fj-toasts').style.removeProperty('top');
    if (mode === 'flying' && g.stall > 0) hud('alt').textContent = `${Math.max(0, Math.round(g.pos.y))} m · stalled`;
    const pace = auto ? ` · auto ×${HASTE}` : input.boost ? ` · ×${HASTE}` : g.brake > 0.05 ? ' · brake' : g.bar > 0.5 ? ' · bar' : '';
    hud('speed').textContent = `${Math.round(g.speed * 3.6)} km/h${mode === 'flying' ? pace : ''}`;
    const next = nearestZone(true) ?? nearestZone(false);
    const bearing = wrapAngle(Math.atan2(next.zone.x - g.pos.x, -(next.zone.z - g.pos.z)) - g.yaw);
    const arrow = ARROWS[((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
    hud('next').textContent = `${next.zone.label} ${arrow} ${Math.round(next.dist)} m`;
    hud('belt').textContent = `${beltFor(progress)} · ${progress.unlocked.length}/${ACHIEVEMENTS.length}`;
    for (const { zone, el } of zoneLabels) {
      const dist = Math.round(Math.hypot(zone.x - g.pos.x, zone.z - g.pos.z));
      el.children[1].textContent = `${zone.place} · ${dist} m${progress.visited.includes(zone.id) ? ' · visited' : ''}`;
      el.children[2].textContent = zone === auto ? 'flying there' : '▶ fly here';
    }
    $('.fj-hint').textContent = hintText();
    if (mapOpen) drawMap();
  }

  function toast(html) {
    const el = document.createElement('div');
    el.className = 'fj-toast';
    el.innerHTML = html;
    $('.fj-toasts').append(el);
    setTimeout(() => el.remove(), 5200);
  }

  function openPanel(id, path, landing = null) {
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

  const mapCanvas = $('.fj-map-canvas');
  const mapCtx = mapCanvas.getContext('2d');
  const mapX = (x) => ((x + WORLD.halfX) / (WORLD.halfX * 2)) * mapCanvas.width;
  const mapY = (z) => ((z - WORLD.north) / (WORLD.south - WORLD.north)) * mapCanvas.height;

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
    for (const zone of ZONES) {
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
      mapCtx.fillText('Cloudbase', x + 10, y + 3);
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

  // The list of controls drops down under its button and stays until it is put away. It covers
  // nothing that matters and stops nothing: the flight goes on underneath.
  function showKeys(open = !keysOpen) {
    keysOpen = open;
    $('.fj-keys').hidden = !open;
    $('[data-do="keys"]').setAttribute('aria-expanded', open);
  }

  // The map covers the landing panel while it is open, and hands it back when it closes.
  function openMap() {
    if (mode === 'intro' || mode === 'lost') return;
    clearInput();
    mapOpen = true;
    $('.fj-map').hidden = false;
    if (panel) hooks.onPanel?.(null);
    if (cloudResult) hooks.onCloudbase?.(null);
    drawMap();
  }

  function closeMap() {
    if (!mapOpen) return;
    mapOpen = false;
    $('.fj-map').hidden = true;
    if (panel) hooks.onPanel?.(panel);
    if (cloudResult) hooks.onCloudbase?.(cloudResult);
  }

  on(mapCanvas, 'click', (event) => {
    const box = mapCanvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * mapCanvas.width;
    const y = ((event.clientY - box.top) / box.height) * mapCanvas.height;
    const hit = ZONES.find((zone) => Math.hypot(mapX(zone.x) - x, mapY(zone.z) - y) < 16);
    if (hit) teleportTo(hit);
    else if (progress.cloudbase.discovered && Math.hypot(mapX(GATEWAY.x) - x, mapY(GATEWAY.z) - y) < 16) retryCloudbase();
  });

  for (const zone of ZONES) {
    const button = document.createElement('button');
    button.textContent = `[ ${zone.label} ]`;
    on(button, 'click', () => teleportTo(zone));
    $('.fj-map-list').append(button);
  }
  const cloudMapButton = document.createElement('button');
  cloudMapButton.dataset.do = 'cloudbase';
  cloudMapButton.textContent = '[ Cloudbase ]';
  cloudMapButton.hidden = !progress.cloudbase.discovered;
  $('.fj-map-list').append(cloudMapButton);

  // ---------------------------------------------------------------- sound

  let audio = null;
  let soundOn = true;

  function startAudio() {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (audio) return audio.ctx.resume();
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = soundOn ? 1 : 0;
    master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 480;
    const wind = ctx.createGain();
    wind.gain.value = 0.01;
    source.connect(windFilter).connect(wind).connect(master);
    const fogFilter = ctx.createBiquadFilter();
    fogFilter.type = 'lowpass';
    fogFilter.frequency.value = 85;
    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    source.connect(fogFilter).connect(rumble).connect(master);
    source.start();

    // A variometer: it beeps faster and higher the harder you climb.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const beep = ctx.createGain();
    beep.gain.value = 0;
    osc.connect(beep).connect(master);
    osc.start();

    // The cloth of a wing near the stall: the same noise through a narrow band, switched on and
    // off by a slow square wave (the raven's rasp, much slower), louder and quicker as it nears.
    const flap = ctx.createBiquadFilter();
    flap.type = 'bandpass';
    flap.frequency.value = 900;
    flap.Q.value = 0.9;
    const shudder = ctx.createGain();
    shudder.gain.value = 0.5;
    const luff = ctx.createGain();
    luff.gain.value = 0;
    source.connect(flap).connect(shudder).connect(luff).connect(master);
    const beat = ctx.createOscillator();
    beat.type = 'square';
    beat.frequency.value = 9;
    const swing = ctx.createGain();
    swing.gain.value = 0.5;
    beat.connect(swing).connect(shudder.gain);
    beat.start();

    // `next` holds when each one-off sound may play again, so none can pile up.
    audio = { ctx, master, noise, wind, windFilter, osc, beep, rumble, flap, luff, beat, nextBeep: 0, next: {} };
  }

  // Plays a one-off sound unless it played less than `gap` seconds ago. Nothing new starts while
  // the map has the run paused, or with the sound switched off.
  function play(name, gap, voice, a, b, c) {
    if (!audio || !soundOn || mapOpen || audio.ctx.state !== 'running') return;
    const now = audio.ctx.currentTime;
    if (now < (audio.next[name] ?? 0)) return;
    audio.next[name] = now + gap;
    voice(audio.ctx, now + 0.01, a, b, c);
  }

  // Sends a sound to one side: -1 is the pilot's left, 1 the right.
  function panned(ctx, pan) {
    const out = ctx.createStereoPanner?.();
    if (!out) return audio.master;
    out.pan.value = clamp(pan, -1, 1);
    out.connect(audio.master);
    return out;
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

  // A raven strike: a thud, the rattle of a wing losing its shape, and the bird's own complaint.
  function thud(ctx, at, pan) {
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
    cloth.buffer = audio.noise;
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
    caw(ctx, at + 0.05, 0.11, pan, 1.25);
  }

  function playStrike(side) {
    play('strike', 1, thud, side * 0.4);
  }

  // A stall: the wing slumps with a low drop and its cloth rattles loose, slowing as it goes. No
  // call in it: a stall must never sound like a raven. `level` is softer for the forgiving kind.
  function slump(ctx, at, pan, level) {
    const out = panned(ctx, pan);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(110, at);
    body.frequency.exponentialRampToValueAtTime(34, at + 0.4);
    const drop = ctx.createGain();
    drop.gain.setValueAtTime(0.3 * level, at);
    drop.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
    body.connect(drop).connect(out);
    body.start(at);
    body.stop(at + 0.52);
    const cloth = ctx.createBufferSource();
    cloth.buffer = audio.noise;
    cloth.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(950, at);
    band.frequency.exponentialRampToValueAtTime(280, at + 1.3);
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const rattle = ctx.createOscillator();
    rattle.type = 'square';
    rattle.frequency.setValueAtTime(14, at);
    rattle.frequency.linearRampToValueAtTime(6, at + 1.3);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    rattle.connect(depth).connect(chop.gain);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0.2 * level, at);
    shape.gain.exponentialRampToValueAtTime(0.04 * level, at + 1.3);
    shape.gain.linearRampToValueAtTime(0, at + 1.7);
    cloth.connect(band).connect(chop).connect(shape).connect(out);
    cloth.start(at, Math.random());
    rattle.start(at);
    cloth.stop(at + 1.75);
    rattle.stop(at + 1.75);
  }

  // The wing filling again: a soft thump of cloth taking the air.
  function refill(ctx, at, pan) {
    const out = panned(ctx, pan);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(85, at);
    body.frequency.exponentialRampToValueAtTime(60, at + 0.18);
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(0.12, at);
    thump.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    body.connect(thump).connect(out);
    body.start(at);
    body.stop(at + 0.2);
    const cloth = ctx.createBufferSource();
    cloth.buffer = audio.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.7;
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, at);
    shape.gain.linearRampToValueAtTime(0.16, at + 0.03);
    shape.gain.setTargetAtTime(0, at + 0.06, 0.07);
    cloth.connect(band).connect(shape).connect(out);
    cloth.start(at, Math.random());
    cloth.stop(at + 0.5);
  }

  // A gust front going over: a rush of air that rises, peaks as it arrives and dies away, moving
  // across from the side it comes from so its direction is heard.
  function whoosh(ctx, at, level, from) {
    const air = ctx.createBufferSource();
    air.buffer = audio.noise;
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
    if (out !== audio.master) {
      out.pan.setValueAtTime(clamp(0.8 * from, -1, 1), at);
      out.pan.linearRampToValueAtTime(clamp(-0.8 * from, -1, 1), at + 2.2);
    }
    air.connect(band).connect(shape).connect(out);
    air.start(at, Math.random());
    air.stop(at + 2.45);
  }

  function playStall(side, harsh) {
    play('stall', 1.2, slump, side * 0.5, harsh ? 1 : 0.7);
  }

  function playRefill(side) {
    play('refill', 1, refill, side * 0.3);
  }

  // The front about to reach the pilot is heard coming a moment before it arrives.
  function hearGust() {
    const { pilot, gusts } = cloudRun.state;
    if (pilot.gustSlot < 0 || pilot.gustIn <= 0 || pilot.gustIn > 0.8) return;
    const band = gusts[pilot.gustSlot];
    // It comes from upwind of the pilot: which side is that?
    const from = -band.ux * Math.cos(g.yaw) - band.uz * Math.sin(g.yaw);
    play('gust', 2.5, whoosh, 0.05 + 0.012 * band.strength, from);
  }

  // The nearest raven calls now and then, from the side it is on, so a flock can be found by ear;
  // one about to cross the pilot's path calls sharply and often.
  function callRavens() {
    const { pilot, ravens } = cloudRun.state;
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
    if (alarm !== null) play('alarm', 1.1, caw, 0.09, alarm, 1.2);
    else if (nearest < 180) play('caw', 6, caw, 0.012 + 0.05 * (1 - nearest / 180) ** 2, pan, 1);
  }

  function updateAudio() {
    if (!audio) return;
    const now = audio.ctx.currentTime;
    const flying = isAirborne() && !mapOpen;
    const running = mode === 'cloudbase' && !mapOpen;
    const rush = mode === 'lost' ? Math.min(0.14, 0.01 + Math.abs(g.vy) * 0.005) : 0.01;
    // The wind in the lines follows the airspeed: louder and brighter on the bar, dull on the brake.
    audio.wind.gain.setTargetAtTime(flying ? 0.02 + g.speed * 0.004 : rush, now, 0.3);
    const fogNear = running ? 1 - clamp((g.pos.y - cloudRun.state.fogHeight) / 140, 0, 1) : 0;
    // Inside a storm cloud the same rumble swells and the wind goes dull.
    const inCloud = running ? effects.veil : 0;
    audio.rumble.gain.setTargetAtTime(Math.max(fogNear, inCloud * 0.8) * 0.35, now, 0.3);
    const pitch = flying ? clamp(480 + (g.speed - FLIGHT.speed.trim) * 28, 260, 900) : 480;
    audio.windFilter.frequency.setTargetAtTime(Math.max(120, pitch - 260 * inCloud), now, 0.3);
    // The cloth flutters harder and faster as the stall comes, and flaps loose in it.
    const luff = flying ? effects.luff : 0;
    audio.luff.gain.setTargetAtTime(0.11 * luff * luff, now, 0.08);
    audio.beat.frequency.setTargetAtTime(8 + 9 * luff, now, 0.08);
    audio.flap.frequency.setTargetAtTime(700 + 500 * luff, now, 0.08);
    if (running) {
      callRavens();
      hearGust();
    }
    if (flying && g.vy > 0.4 && now >= audio.nextBeep) {
      const gap = Math.max(0.11, 0.42 - g.vy * 0.05);
      audio.osc.frequency.setValueAtTime(620 + g.vy * 85, now);
      audio.beep.gain.setValueAtTime(0.05, now);
      audio.beep.gain.setValueAtTime(0, now + gap * 0.5);
      audio.nextBeep = now + gap;
    } else if (!flying || g.vy <= 0.4) audio.beep.gain.setTargetAtTime(0, now, 0.03);
  }

  function toggleSound() {
    soundOn = !soundOn;
    for (const button of stage.querySelectorAll('[data-do="sound"]')) button.textContent = `[ sound: ${soundOn ? 'on' : 'off'} ]`;
    audio?.master.gain.setTargetAtTime(soundOn ? 1 : 0, audio.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- taking and giving back control

  // True fullscreen covers the page's own overlays too, so it is asked of the stage's container.
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else (stage.parentElement ?? stage).requestFullscreen?.().catch(() => {});
  }

  /** Hands the glider to the visitor. With a place id, starts on final approach to that place. */
  function fly(zoneId) {
    const zone = ZONES.find((candidate) => candidate.id === zoneId);
    if (mode === 'lost') idle();
    if (mode === 'intro') {
      $('.fj-hud').hidden = false;
      stage.classList.add('playing');
      startAudio();
      airtime = 0;
      launchFrom(START.x, START.y, START.z, START.yaw);
      if (!zone && !revealShown && !progress.cloudbase.discovered && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        revealShown = true;
        launchReveal = {
          age: 0,
          duration: 0.65,
          from: new THREE.Vector3(START.x - 45, START.y + 16, START.z + 16),
          at: new THREE.Vector3(START.x, START.y, START.z).lerp(new THREE.Vector3(GATEWAY.x, 80, GATEWAY.z), 0.55),
        };
      }
      unlock('airborne');
    }
    if (zone) teleportTo(zone);
    syncCloudbaseEntry();
  }

  /** From a landing, flies itself to the next place not yet visited. */
  function flyToNext() {
    autoFly(ZONES.find((zone) => zone.id === panel?.next?.id));
  }

  /** Takes control back: the glider returns to circling as a backdrop. */
  function idle() {
    if (mode === 'intro') return;
    finishCloudbase('quit', false);
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
    effects.gaze = 0;
    launchReveal = null;
    mode = 'intro';
    g.pos.set(START.x, START.y, START.z);
    g.yaw = START.yaw;
    settleFlight(g);
    clearInput();
    $('.fj-hud').hidden = true;
    stage.classList.remove('playing', 'lost', 'cloudbase', 'cloudbase-ended');
    audio?.ctx.suspend();
    if (document.fullscreenElement) document.exitFullscreen();
  }

  // ---------------------------------------------------------------- input

  on(window, 'keydown', (event) => {
    if (mode === 'intro' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (mode === 'lost') {
      // In the emergency there is one thing to do, and several keys that do it.
      if (event.code === 'KeyR' || event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!event.repeat) throwReserve();
      } else if (event.code === 'Escape') lostEnded ? hooks.onExit?.() : skipLost();
      else if (event.code === 'KeyL' && !event.repeat) toggleSound();
      return;
    }
    if (mode === 'cloudbase-ended') {
      if (event.code === 'Escape') mapOpen ? closeMap() : backToFjord();
      else if (event.code === 'KeyR' && !event.repeat) retryCloudbase();
      else if (event.code === 'KeyM' && !event.repeat) mapOpen ? closeMap() : openMap();
      else if (event.code === 'KeyL' && !event.repeat) toggleSound();
      return;
    }
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]') && ['Space', 'Enter'].includes(event.code)) return;
    if (event.code in KEYS) {
      event.preventDefault();
      const name = KEYS[event.code];
      if (name === 'brake') {
        // A brake key held since before the launch is not a brake until it is pressed again.
        if (event.repeat) return;
        // Space also takes off when landed.
        if (event.code === 'Space' && mode === 'landed') return takeOff();
      }
      if (mapOpen || mode === 'launching') return;
      press(name, event.code, true);
      // Steering by hand takes the glider back from flying itself.
      if (name === 'left' || name === 'right') setAuto(null);
      return;
    }
    if (event.repeat) return;
    if (event.code === 'KeyM') mapOpen ? closeMap() : openMap();
    else if (event.code === 'KeyH') showKeys();
    else if (event.code === 'KeyL') toggleSound();
    else if (event.code === 'KeyF') toggleFullscreen();
    else if (event.code === 'KeyR') respawn();
    else if (event.code === 'Escape') mapOpen ? closeMap() : keysOpen ? showKeys(false) : mode === 'cloudbase' ? finishCloudbase('quit') : exitFlight();
    else if (event.code === 'Enter' && mode === 'landed') takeOff();
    else if (event.code === 'KeyN' && mode === 'landed') flyToNext();
  });

  on(window, 'keyup', (event) => {
    if (mode === 'intro' || !(event.code in KEYS)) return;
    press(KEYS[event.code], event.code, false);
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]') && ['Space', 'Enter'].includes(event.code)) return;
    // Stops a held space from also clicking whichever button was last focused.
    event.preventDefault();
  });

  on(window, 'blur', () => {
    clearInput();
  });
  on(window, 'pagehide', () => finishCloudbase('quit', false));

  for (const button of stage.querySelectorAll('.fj-touch button')) {
    const set = (down) => (event) => {
      event.preventDefault();
      if (down && (!isAirborne() || mapOpen)) return;
      press(button.dataset.input, button, down);
      if (down && button.dataset.input !== 'boost' && button.dataset.input !== 'brake') setAuto(null);
    };
    on(button, 'pointerdown', set(true));
    on(button, 'pointerup', set(false));
    on(button, 'pointercancel', set(false));
    on(button, 'pointerleave', set(false));
  }

  const actions = {
    map: () => (mapOpen ? closeMap() : openMap()),
    keys: () => showKeys(),
    sound: toggleSound,
    fullscreen: toggleFullscreen,
    exit: exitFlight,
    cloudbase: retryCloudbase,
    'quit-cloudbase': () => { showKeys(false); finishCloudbase('quit'); },
    reset: () => {
      finishCloudbase('quit', false);
      Object.assign(progress, emptyProgress());
      writeProgress(emptyProgress());
      location.reload();
    },
  };
  for (const button of stage.querySelectorAll('[data-do]')) on(button, 'click', actions[button.dataset.do]);

  // ---------------------------------------------------------------- loop

  let last = performance.now();
  let backlog = 0;
  let hudClock = 0;
  let slowFrames = 0;
  let visible = true;
  let request = 0;

  function frame(now) {
    request = requestAnimationFrame(frame);
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    // Scrolled out of view as a backdrop, there is nothing to draw.
    if (!visible && mode === 'intro') return;

    if (mode === 'lost') lostScene.update(elapsed, time + elapsed);

    // Fixed steps keep the flight model identical on slow and fast machines. Boosting, or flying
    // itself to a place, runs the flight several times faster than the clock. A Cloudbase run is
    // never hurried: at three times the speed a raven arrives with no warning at all.
    haste = isAirborne() && !mapOpen && (auto || (input.boost && mode !== 'cloudbase')) ? HASTE : 1;
    time += elapsed;
    backlog += elapsed * haste;
    while (backlog >= STEP) {
      backlog -= STEP;
      if (isAirborne() && !mapOpen && !held) simulate(STEP);
    }

    // What the run is doing to the wing and the picture, eased by the real clock. Outside a run
    // the targets are all zero and nothing here writes to the wing, which the 404 scene also folds.
    const inRun = mode === 'cloudbase';
    runEffects(
      mode,
      cloudRun.state.pilot,
      g.vy,
      g.pos.y - cloudRun.state.fogHeight,
      inRun ? cloudRun.depthAt(camera.position.x, camera.position.y, camera.position.z) : 0,
      effects.want,
    );
    stallEffects(mode, g, effects.stall);
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
    } else effects.foldLeft = effects.foldRight = effects.luff = 0;
    effects.fold = Math.max(effects.foldLeft, effects.foldRight);
    effects.shake = !isAirborne() || calm || mapOpen || held ? 0 : Math.max(effects.want.shake, effects.stall.shake);
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

    if (mode === 'intro') g.pos.y = START.y + Math.sin(time * 0.8) * 1.2;
    glider.group.position.copy(g.pos);
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
    glider.pose({
      dt: elapsed,
      time,
      bank: g.bank + lean,
      pace: airborne ? g.speed - FLIGHT.speed.trim : 0,
      turn: airborne ? g.turn : THREE.MathUtils.clamp(lean * 1.6, -1, 1),
      lift: airborne ? g.lift : mode === 'intro' ? tug.y : 0,
      liftSide: g.liftSide,
      landed: mode === 'landed',
      flying: airborne,
      brake: airborne ? g.brake : 0,
      bar: airborne ? g.bar : 0,
      luff: effects.luff,
      stall: airborne && g.stall > 0 ? 1 : 0,
      foldLeft: effects.foldLeft,
      foldRight: effects.foldRight,
      // A gust rocking the wing is only motion; the flutter of a coming stall says something, and stays.
      rough: airborne && !calm ? air.rough : 0,
    });
    updateMeter();
    updateCamera(elapsed);

    terrain.update(time);
    sky.update(time);
    places.update(time);
    thermals.update(time);
    gateway.update(time);
    if (mode === 'cloudbase') cloudView?.update(cloudRun.state.elapsed, g.pos, cloudRun, camera.position);
    // All of the wind in a run; over the fjord a sparse breeze that moves nothing, as the windsocks
    // show it. Paused with the flight, and drawn brighter once the glow has been dropped.
    streaks.update(
      mapOpen || held ? 0 : elapsed,
      g.pos,
      camera.position,
      inRun ? cloudRun.windAt : fjordBreeze,
      inRun ? 1 : mode === 'flying' ? 0.35 : 0,
      inRun ? cloudRun.state.fogHeight + 3 : 3,
      inRun ? cloudRun.state.gusts : null,
      !useBloom,
    );
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
  window.fjord = {
    g,
    glider,
    progress,
    get mode() { return mode; },
    cloudRun,
    get cloudView() { return cloudView; },
    get effects() {
      return {
        seed: cloudRun.state.seed, fold: effects.fold, foldLeft: effects.foldLeft, foldRight: effects.foldRight, luff: effects.luff,
        veil: effects.veil, gaze: effects.gaze, hook: effects.hook, stalls: effects.stalls, meter: { ...effects.meter }, haste,
      };
    },
    // fjord.seed(n) flies the same Cloudbase sky every run until fjord.seed() lets it go;
    // fjord.hold() stops the flight where it is, without the map in the way, and fjord.hold(false) resumes.
    seed: (value) => (pinnedSeed = value == null ? null : value >>> 0),
    hold: (on = true) => (held = on),
    // The flight's own clock, and what it was last handed: the pilot's controls and the air.
    get airtime() { return airtime; },
    controls,
    air,
    streaks,
    fjordBreeze,
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
    spy: (from, at) => (spy = from ? { from, at } : null),
  };

  return {
    fly,
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
    warp(rising) {
      lens.rising = rising;
      if (!rising) lens.warp = 1;
    },
    /** How far the hero has scrolled away, 0 to 1: the backdrop's camera climbs to match. */
    rise: (amount) => (climb.want = Math.max(0, Math.min(1, amount))),
    /** The page tells the game whether its stage is on screen, so an unseen backdrop costs nothing. */
    setVisible: (seen) => (visible = seen),
    dispose() {
      finishCloudbase('quit', false);
      disposed = true;
      clearTimeout(fadeTimer);
      cancelAnimationFrame(request);
      listeners.abort();
      sizeWatch.disconnect();
      audio?.ctx.close();
      cloudView?.dispose();
      streaks.dispose();
      for (const pass of composer.passes) pass.dispose?.();
      composer.dispose();
      renderer.dispose();
      document.documentElement.classList.remove('tuggable', 'tugging');
      delete window.fjord;
      stage.replaceChildren();
    },
  };
}
