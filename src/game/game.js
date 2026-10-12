import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { WORLD, ZONES, STONES, THERMALS, START, centerX, heightAt, surfaceAt, buildTerrain } from './terrain.js';
import { PROJECT_PROPS, buildSky, buildPlaces, buildScatter, buildThermals, buildGlider } from './scenery.js';
import { ACHIEVEMENTS, beltFor, readProgress, writeProgress } from './achievements.js';
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

// Close to a real wing: about 41 km/h and a 9:1 glide at trim. Speeds are m/s, turn is rad/s.
const FLIGHT = {
  trim: { speed: 11.5, sink: 1.2 },
  fast: { speed: 16, sink: 2.3 },
  slow: { speed: 7.5, sink: 1.0 },
  turn: 0.8,
  turnSink: 0.8,
  diveSink: 6.5,
};

const KEYS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'fast',
  KeyW: 'fast',
  ArrowDown: 'slow',
  KeyS: 'slow',
  Space: 'dive',
};

// Everything the game draws over its own canvas. The landing panel is not here: the page renders
// that, so it can reuse the same section components as the traditional page.
const MARKUP = /* html */ `
  <canvas class="fj-scene"></canvas>
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
      <button data-do="map">[ m: map ]</button>
      <button data-do="sound">[ sound: on ]</button>
      <button data-do="fullscreen">[ f: fullscreen ]</button>
      <button data-do="exit">[ esc: exit ]</button>
    </nav>
  </div>
  <div class="fj-toasts"></div>
  <div class="fj-hint"></div>
  <section class="fj-map window" hidden>
    <header><i></i><i></i><i></i><span>~/fjord/map — pick a place to fly to</span></header>
    <canvas class="fj-map-canvas" width="300" height="420"></canvas>
    <div class="fj-map-list"></div>
    <footer>
      <button data-do="map">[ esc: close ]</button>
      <button data-do="reset">[ reset progress ]</button>
    </footer>
  </section>
  <div class="fj-touch">
    <button data-input="left" aria-label="Steer left">◀</button>
    <button data-input="dive" aria-label="Dive">▼</button>
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
  scene.add(terrain.group, sky.group, places.group, scatter.group, thermals.group, glider.group);

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

  // The scene fills its stage: the hero while idle, the whole window in flight.
  const view = { width: 1, height: 1 };
  function resize() {
    view.width = Math.max(1, stage.clientWidth);
    view.height = Math.max(1, stage.clientHeight);
    renderer.setSize(view.width, view.height, false);
    composer.setSize(view.width, view.height);
    const scale = renderer.getPixelRatio();
    patch.uniforms.uTexel.value.set(1 / (view.width * scale), 1 / (view.height * scale));
    camera.aspect = view.width / view.height;
    camera.fov = camera.aspect < 1 ? 75 : 60; // a wider lens keeps the wing in frame on a phone held upright
    camera.updateProjectionMatrix();
  }
  const sizeWatch = new ResizeObserver(resize);
  sizeWatch.observe(stage);
  resize();

  // ---------------------------------------------------------------- state

  const g = {
    pos: new THREE.Vector3(START.x, START.y, START.z),
    yaw: START.yaw,
    yawRate: 0,
    bank: 0,
    speed: FLIGHT.trim.speed,
    sink: FLIGHT.trim.sink,
    vy: 0,
  };
  const input = { left: false, right: false, fast: false, slow: false, dive: false };
  let mode = 'intro'; // intro (idle backdrop) | flying | landed | launching
  let mapOpen = false;
  let panel = null;
  let climbStart = null;
  let outOfBounds = false;
  let time = 0;
  let airtime = 0;

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
    let turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    outOfBounds =
      Math.abs(g.pos.x) > WORLD.halfX - 50 || g.pos.z < WORLD.north + 45 || g.pos.z > WORLD.south - 45;
    if (outOfBounds) {
      // Past the edge of the map the wind steers you back toward the fjord.
      const tz = clamp(g.pos.z, WORLD.north + 140, WORLD.south - 140);
      const want = Math.atan2(centerX(tz) - g.pos.x, -(tz - g.pos.z));
      turn = clamp(wrapAngle(want - g.yaw) * 2, -1, 1);
    }
    g.yawRate += (turn * FLIGHT.turn - g.yawRate) * Math.min(1, dt * 3.2);
    g.yaw += g.yawRate * dt;
    g.bank += (g.yawRate * 0.75 - g.bank) * Math.min(1, dt * 4);

    const trim = input.fast ? FLIGHT.fast : input.slow ? FLIGHT.slow : FLIGHT.trim;
    g.speed += (trim.speed - g.speed) * Math.min(1, dt * 1.6);
    g.sink += (trim.sink - g.sink) * Math.min(1, dt * 1.6);
    let sink = g.sink + Math.abs(g.yawRate) * FLIGHT.turnSink;
    if (input.dive) sink += FLIGHT.diveSink;

    // Thermals are weak near the ground, so they never stop you landing.
    const agl = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    let lift = 0;
    for (const thermal of THERMALS) {
      const d = Math.hypot(g.pos.x - thermal.x, g.pos.z - thermal.z);
      if (d < thermal.r) lift += thermal.s * smoothstep(thermal.r, thermal.r * 0.45, d);
    }
    lift *= smoothstep(8, 45, agl) * (1 - smoothstep(WORLD.ceiling - 80, WORLD.ceiling, g.pos.y));

    g.vy += (lift - sink - g.vy) * Math.min(1, dt * 2.5);
    g.pos.x += Math.sin(g.yaw) * g.speed * dt;
    g.pos.z -= Math.cos(g.yaw) * g.speed * dt;
    g.pos.y += g.vy * dt;

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
        toast(`<small>experience.log</small><b>${stone.years}</b><span>${stone.role}</span>`);
        if (progress.stones.length === STONES.length) unlock('runes');
      }
    }

    const ground = surfaceAt(g.pos.x, g.pos.z);
    const here = ZONES.find((zone) => Math.hypot(g.pos.x - zone.x, g.pos.z - zone.z) < zone.r);
    if (here && g.pos.y - ground < 9) land(here);
    else if (g.pos.y - ground <= 1.4) land(null);
  }

  function land(zone) {
    mode = 'landed';
    g.vy = g.yawRate = g.speed = 0;
    g.pos.y = surfaceAt(g.pos.x, g.pos.z) + 1.4;
    if (zone) {
      if (!progress.visited.includes(zone.id)) progress.visited.push(zone.id);
      places.setVisited(zone.id);
      unlock('touchdown');
      if (progress.visited.length === ZONES.length) unlock('tour');
      openPanel(zone.id, `~/fjord/${zone.place.replace(' ', '-')}`);
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
    $('.fj-fade').classList.add('on');
    setTimeout(() => {
      change();
      snapCamera();
      $('.fj-fade').classList.remove('on');
    }, 320);
  }

  function launchFrom(x, y, z, yaw) {
    closePanel();
    g.pos.set(x, y, z);
    g.yaw = yaw;
    g.yawRate = g.bank = g.vy = 0;
    g.speed = FLIGHT.trim.speed;
    climbStart = null;
    mode = 'flying';
  }

  function takeOff() {
    if (mode !== 'landed') return;
    mode = 'launching';
    fadeThen(() => {
      // Lift straight up from where you stand and face the next place worth visiting.
      const next = nearestZone(true) ?? nearestZone(false);
      const far = next.dist > 40 ? next.zone : { x: centerX(g.pos.z - 80), z: g.pos.z - 80 };
      const yaw = Math.atan2(far.x - g.pos.x, -(far.z - g.pos.z));
      launchFrom(g.pos.x, surfaceAt(g.pos.x, g.pos.z) + 75, g.pos.z, yaw);
    });
  }

  function teleportTo(zone) {
    closePanel();
    closeMap();
    mode = 'launching';
    fadeThen(() => {
      // Arrive on final approach from the water: left alone, the glide ends inside the ring.
      const from = new THREE.Vector2(centerX(zone.z + 40) - zone.x, 40).setLength(110);
      launchFrom(zone.x + from.x, zone.h + 19, zone.z + from.y, Math.atan2(-from.x, from.y));
    });
  }

  function respawn() {
    if (mode === 'intro') return;
    mode = 'launching';
    fadeThen(() => launchFrom(START.x, START.y, START.z, START.yaw));
  }

  // ---------------------------------------------------------------- camera

  const forward = new THREE.Vector3();
  const chase = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function chaseTarget() {
    forward.set(Math.sin(g.yaw), 0, -Math.cos(g.yaw));
    chase.copy(g.pos).addScaledVector(forward, camera.aspect < 1 ? -34 : -26);
    chase.y += 9.5;
    lookAt.copy(g.pos).addScaledVector(forward, 14);
    lookAt.y += 3;
  }

  function snapCamera() {
    chaseTarget();
    camera.position.copy(chase);
  }

  // While set, the camera is parked at `from` looking at `at` (see the debug handle at the bottom).
  let spy = null;

  function updateCamera(dt) {
    if (spy) {
      camera.position.set(...spy.from);
      camera.lookAt(...spy.at);
      return;
    }
    if (mode === 'intro') {
      // As a backdrop the camera circles the glider. On a wide screen it aims a little to the
      // glider's left, which puts the glider right of centre and clear of the headline.
      const a = time * 0.12 + 2.6;
      const aside = camera.aspect > 1.2 ? 13 : 0;
      camera.position.set(g.pos.x + Math.sin(a) * 38, g.pos.y + 9, g.pos.z + Math.cos(a) * 38);
      camera.lookAt(g.pos.x - Math.cos(a) * aside, g.pos.y + 4, g.pos.z + Math.sin(a) * aside);
      return;
    }
    chaseTarget();
    camera.position.lerp(chase, 1 - Math.exp(-dt * 3.2));
    camera.position.y = Math.max(camera.position.y, surfaceAt(camera.position.x, camera.position.z) + 4);
    camera.lookAt(lookAt);
    camera.rotateZ(-g.bank * 0.25);
  }

  // ---------------------------------------------------------------- hud

  const labels = [];

  function addLabel(x, y, z, range, html) {
    const el = document.createElement('div');
    el.className = 'fj-label';
    el.innerHTML = html;
    $('.fj-labels').append(el);
    labels.push({ el, at: new THREE.Vector3(x, y, z), range });
    return el;
  }
  const zoneLabels = ZONES.map((zone) => ({
    zone,
    el: addLabel(zone.x, zone.h + 34, zone.z, 600, `<b>${zone.label}</b><span></span>`),
  }));
  for (const stone of STONES) {
    addLabel(stone.x, stone.y + stone.height + 4, stone.z, 170, `<b>${stone.years}</b><span>${stone.role}</span>`);
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

  function hintText() {
    if (mode !== 'flying' || mapOpen) return '';
    if (outOfBounds) return 'the fog turns you back toward the fjord';
    const agl = g.pos.y - surfaceAt(g.pos.x, g.pos.z);
    const near = nearestZone(false);
    if (near.dist < near.zone.r * 2.5) {
      const unvisited = !progress.visited.includes(near.zone.id);
      return unvisited && agl > 28 ? 'hold space to dive · you land inside the ring' : '';
    }
    if (agl < 45 && g.vy < 0) return 'low — steer for the amber sparks to climb';
    if (airtime < 14) return 'lit pillars are places to land · amber sparks are rising air';
    return '';
  }

  function updateHud() {
    hud('alt').textContent = `${Math.round(g.pos.y)} m`;
    const bars = Math.min(4, Math.round(Math.abs(g.vy) / 1.5));
    hud('vario').textContent = `${g.vy >= 0 ? '+' : '−'}${Math.abs(g.vy).toFixed(1)} m/s ${(g.vy >= 0 ? '▲' : '▼').repeat(bars)}`;
    hud('vario').classList.toggle('up', g.vy > 0.2);
    hud('speed').textContent = `${Math.round(g.speed * 3.6)} km/h${input.dive && mode === 'flying' ? ' · dive' : ''}`;
    const next = nearestZone(true) ?? nearestZone(false);
    const bearing = wrapAngle(Math.atan2(next.zone.x - g.pos.x, -(next.zone.z - g.pos.z)) - g.yaw);
    const arrow = ARROWS[((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
    hud('next').textContent = `${next.zone.label} ${arrow} ${Math.round(next.dist)} m`;
    hud('belt').textContent = `${beltFor(progress)} · ${progress.unlocked.length}/${ACHIEVEMENTS.length}`;
    for (const { zone, el } of zoneLabels) {
      const dist = Math.round(Math.hypot(zone.x - g.pos.x, zone.z - g.pos.z));
      el.lastChild.textContent = `${zone.place} · ${dist} m${progress.visited.includes(zone.id) ? ' · visited' : ''}`;
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

  function openPanel(id, path) {
    panel = { id, path };
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
    for (const thermal of THERMALS) {
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

  // The map covers the landing panel while it is open, and hands it back when it closes.
  function openMap() {
    if (mode === 'intro') return;
    mapOpen = true;
    $('.fj-map').hidden = false;
    if (panel) hooks.onPanel?.(null);
    drawMap();
  }

  function closeMap() {
    if (!mapOpen) return;
    mapOpen = false;
    $('.fj-map').hidden = true;
    if (panel) hooks.onPanel?.(panel);
  }

  on(mapCanvas, 'click', (event) => {
    const box = mapCanvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * mapCanvas.width;
    const y = ((event.clientY - box.top) / box.height) * mapCanvas.height;
    const hit = ZONES.find((zone) => Math.hypot(mapX(zone.x) - x, mapY(zone.z) - y) < 16);
    if (hit) teleportTo(hit);
  });

  for (const zone of ZONES) {
    const button = document.createElement('button');
    button.textContent = `[ ${zone.label} ]`;
    on(button, 'click', () => teleportTo(zone));
    $('.fj-map-list').append(button);
  }

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
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 480;
    const wind = ctx.createGain();
    wind.gain.value = 0.01;
    source.connect(lowpass).connect(wind).connect(master);
    source.start();

    // A variometer: it beeps faster and higher the harder you climb.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const beep = ctx.createGain();
    beep.gain.value = 0;
    osc.connect(beep).connect(master);
    osc.start();

    audio = { ctx, master, wind, osc, beep, nextBeep: 0 };
  }

  function updateAudio() {
    if (!audio) return;
    const now = audio.ctx.currentTime;
    const flying = mode === 'flying' && !mapOpen;
    audio.wind.gain.setTargetAtTime(flying ? 0.02 + g.speed * 0.004 : 0.01, now, 0.3);
    if (flying && g.vy > 0.4 && now >= audio.nextBeep) {
      const gap = Math.max(0.11, 0.42 - g.vy * 0.05);
      audio.osc.frequency.setValueAtTime(620 + g.vy * 85, now);
      audio.beep.gain.setValueAtTime(0.05, now);
      audio.beep.gain.setValueAtTime(0, now + gap * 0.5);
      audio.nextBeep = now + gap;
    }
  }

  function toggleSound() {
    soundOn = !soundOn;
    $('[data-do="sound"]').textContent = `[ sound: ${soundOn ? 'on' : 'off'} ]`;
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
    if (mode === 'intro') {
      $('.fj-hud').hidden = false;
      stage.classList.add('playing');
      startAudio();
      airtime = 0;
      launchFrom(START.x, START.y, START.z, START.yaw);
      unlock('airborne');
    }
    if (zone) teleportTo(zone);
  }

  /** Takes control back: the glider returns to circling as a backdrop. */
  function idle() {
    if (mode === 'intro') return;
    closeMap();
    closePanel();
    mode = 'intro';
    g.pos.set(START.x, START.y, START.z);
    g.yaw = START.yaw;
    g.yawRate = g.bank = g.vy = 0;
    for (const key of Object.keys(input)) input[key] = false;
    $('.fj-hud').hidden = true;
    stage.classList.remove('playing');
    audio?.ctx.suspend();
    if (document.fullscreenElement) document.exitFullscreen();
  }

  // ---------------------------------------------------------------- input

  on(window, 'keydown', (event) => {
    if (mode === 'intro' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code in KEYS) {
      event.preventDefault();
      if (event.code === 'Space') {
        // Space takes off when landed; a held key must not turn into a dive the moment you launch.
        if (event.repeat) return;
        if (mode === 'landed') return takeOff();
      }
      input[KEYS[event.code]] = true;
      return;
    }
    if (event.repeat) return;
    if (event.code === 'KeyM') mapOpen ? closeMap() : openMap();
    else if (event.code === 'KeyL') toggleSound();
    else if (event.code === 'KeyF') toggleFullscreen();
    else if (event.code === 'KeyR') respawn();
    else if (event.code === 'Escape') mapOpen ? closeMap() : hooks.onExit?.();
    else if (event.code === 'Enter' && mode === 'landed') takeOff();
  });

  on(window, 'keyup', (event) => {
    if (mode === 'intro' || !(event.code in KEYS)) return;
    // Stops a held space from also clicking whichever button was last focused.
    event.preventDefault();
    input[KEYS[event.code]] = false;
  });

  on(window, 'blur', () => {
    for (const key of Object.keys(input)) input[key] = false;
  });

  for (const button of stage.querySelectorAll('.fj-touch button')) {
    const set = (down) => (event) => {
      event.preventDefault();
      input[button.dataset.input] = down;
    };
    on(button, 'pointerdown', set(true));
    on(button, 'pointerup', set(false));
    on(button, 'pointercancel', set(false));
    on(button, 'pointerleave', set(false));
  }

  const actions = {
    map: () => (mapOpen ? closeMap() : openMap()),
    sound: toggleSound,
    fullscreen: toggleFullscreen,
    exit: () => hooks.onExit?.(),
    reset: () => {
      writeProgress({ unlocked: [], visited: [], stones: [] });
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

    // Fixed steps keep the flight model identical on slow and fast machines.
    backlog += elapsed;
    while (backlog >= STEP) {
      backlog -= STEP;
      time += STEP;
      if (mode === 'flying' && !mapOpen) simulate(STEP);
    }

    if (mode === 'intro') g.pos.y = START.y + Math.sin(time * 0.8) * 1.2;
    glider.group.position.copy(g.pos);
    glider.group.rotation.set(0, -g.yaw, -g.bank);
    glider.pose({ bank: g.bank, landed: mode === 'landed' });
    updateCamera(elapsed);

    terrain.update(time);
    sky.update(time);
    places.update(time);
    thermals.update(time);
    placeLabels();
    updateAudio();
    hudClock += elapsed;
    if (hudClock > 0.1 && mode !== 'intro') {
      hudClock = 0;
      updateHud();
    }

    // Drop the glow and the extra pixels on machines that cannot hold a playable frame rate.
    if (useBloom && mode === 'flying') {
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
    progress,
    camera,
    ZONES,
    STONES,
    THERMALS,
    teleportTo,
    launchFrom,
    spy: (from, at) => (spy = from ? { from, at } : null),
  };

  return {
    fly,
    idle,
    takeOff,
    openMap,
    /** The page tells the game whether its stage is on screen, so an unseen backdrop costs nothing. */
    setVisible: (seen) => (visible = seen),
    dispose() {
      cancelAnimationFrame(request);
      listeners.abort();
      sizeWatch.disconnect();
      audio?.ctx.close();
      renderer.dispose();
      delete window.fjord;
      stage.replaceChildren();
    },
  };
}
