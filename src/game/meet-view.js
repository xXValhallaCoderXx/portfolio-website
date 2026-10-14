// What the meet adds to a run's picture: the plates laid along a trail, the line the next lift is
// judged at and the flash of the one just judged, Hrungnir's kettlebells, and the ring where each
// is going to land. Built like the run's own view (cloudbase.js): nothing until the first begin(),
// one root of its own, and nothing allocated while a run is drawn.
import * as THREE from 'three';
import { CLOUD_STRIKE, CLOUD_ZONE } from './cloudbase-state.js';
import { ORDER } from './cloudbase.js';
import { RAVEN } from './ravens.js';
import { MEET_POOL } from './meet-state.js';
import { BELLS, BELL_POOL } from './bells.js';

// A plate is a competition bumper about four times life size (a real one is 45 cm across), so it
// reads from a circle or two away, as the ravens do. Its face is near white, bright enough for the
// glow (whose threshold is 0.3), so from afar every plate is a light; its rim takes the colour of
// its weight as the pilot closes in, fully within `near[0]` metres and not at all beyond `near[1]`.
// A plate faces the camera but for a slow sway of `sway` radians, so it seems to turn in the air.
// A plate loaded onto the bar leaves a ring that spreads to `pop` times its size in `popFor` s.
export const PLATE = Object.freeze({
  radius: 1.8, thick: 0.42, hub: 0.32, face: 0xe6edf5,
  colours: Object.freeze({ 5: 0xf4f6fa, 10: 0x37c06a, 15: 0xf5c533, 20: 0x3a7ff0, 25: 0xf04848 }),
  near: Object.freeze([18, 40]), sway: 0.35, pop: 3.2, popFor: 0.4,
});

// The line the next lift is judged at, and the one just judged: rings `inset` metres inside the
// milestone rings, so never drawn over one. A judged line flashes white for a good lift and red
// for none, and is gone after `flash` seconds.
export const LINES = Object.freeze({ inset: 3, next: 0xf3efe2, good: 0xffffff, flash: 1.2 });

// Hrungnir's kettlebells: the forge's model, glowing like iron from the fire, `size` metres tall
// for each weight in BELLS.kg. Each tumbles as it falls and leaves `trail` embers `gap` metres apart
// behind it. The ring where it will land closes in from `closing` times the strike's size as it comes.
export const BELL_LOOK = Object.freeze({
  size: Object.freeze([2.2, 2.6, 3]), ember: 0xff7a2e, glow: 0.55, tumble: 2.2, trail: 14, gap: 2.2, closing: 3,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * `loadModel` is scenery.js's loader (or a test's); without it, or until the kettlebell arrives,
 * or if it never does, the bells are plain iron stand-ins.
 */
export function createMeetView({ scene, loadModel = null }) {
  let root = null;
  let disposed = false;
  let ready = null;
  let next = null;
  let judged = null;
  const loaded = { kettlebell: false };
  const plateViews = [];
  const bellViews = [];
  // What the last update saw, to notice what has changed since: lifts judged, and which plates
  // were up and where.
  const seen = { count: 0, flashAt: -Infinity };
  const materials = new Set();
  const geometries = new Set();
  const ownGeometry = (geometry) => { geometries.add(geometry); return geometry; };
  const ownMaterial = (material) => { materials.add(material); return material; };
  const transparent = { transparent: true, depthWrite: false, fog: false };
  const silver = new THREE.Color(PLATE.face);
  const weights = new Map(Object.entries(PLATE.colours).map(([kg, colour]) => [Number(kg), new THREE.Color(colour)]));
  const threat = new THREE.Color(RAVEN.threat).multiplyScalar(RAVEN.flare);

  // A ring lying level, or (`upright`) standing in the plane a plate's face is in.
  function ring(radius, color, opacity, upright = false) {
    const points = Array.from({ length: 96 }, (_, i) => {
      const angle = i / 96 * Math.PI * 2;
      return upright
        ? new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
        : new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    });
    const loop = new THREE.LineLoop(ownGeometry(new THREE.BufferGeometry().setFromPoints(points)),
      ownMaterial(new THREE.LineBasicMaterial({ color, opacity, ...transparent })));
    loop.renderOrder = ORDER.aboveFog;
    return loop;
  }

  function build() {
    root = new THREE.Group();
    root.name = 'GoodLift';
    scene.add(root);

    // One disc, rim and hub serve every plate; each plate has its own rim material, to colour.
    // The disc's faces look along its own z, the way a plate is turned to face the camera.
    const disc = ownGeometry(new THREE.CylinderGeometry(PLATE.radius, PLATE.radius, PLATE.thick, 40).rotateX(Math.PI / 2));
    const rim = ownGeometry(new THREE.TorusGeometry(PLATE.radius, PLATE.thick * 0.62, 8, 40));
    const hub = ownGeometry(new THREE.CylinderGeometry(PLATE.hub, PLATE.hub, PLATE.thick * 1.6, 16).rotateX(Math.PI / 2));
    const face = ownMaterial(new THREE.MeshBasicMaterial({ color: PLATE.face }));
    const iron = ownMaterial(new THREE.MeshBasicMaterial({ color: 0x1b2230 }));
    for (let i = 0; i < MEET_POOL.plates; i++) {
      const holder = new THREE.Group();
      holder.name = `plate-${i}`;
      holder.visible = false;
      const band = ownMaterial(new THREE.MeshBasicMaterial({ color: PLATE.face }));
      holder.add(new THREE.Mesh(disc, face), new THREE.Mesh(rim, band), new THREE.Mesh(hub, iron));
      const pop = ring(PLATE.radius, PLATE.face, 0, true);
      pop.name = `pop-${i}`;
      pop.visible = false;
      root.add(holder, pop);
      plateViews.push({ holder, band, pop, live: false, kg: 0, x: 0, y: 0, z: 0, popAt: -Infinity });
    }

    next = ring(CLOUD_ZONE.r - LINES.inset, LINES.next, 0.55);
    next.name = 'line-next';
    judged = ring(CLOUD_ZONE.r - LINES.inset, LINES.good, 0);
    judged.name = 'line-judged';
    judged.visible = false;
    root.add(next, judged);

    const body = ownGeometry(new THREE.SphereGeometry(0.36, 16, 12).translate(0, -0.08, 0));
    const handle = ownGeometry(new THREE.TorusGeometry(0.2, 0.06, 8, 20).translate(0, 0.3, 0));
    const standIn = ownMaterial(new THREE.MeshStandardMaterial({
      color: 0x2c2b30, roughness: 0.6, metalness: 0.4, emissive: BELL_LOOK.ember, emissiveIntensity: 0.35,
    }));
    for (let i = 0; i < BELL_POOL; i++) {
      const holder = new THREE.Group();
      holder.name = `bell-${i}`;
      holder.visible = false;
      const model = new THREE.Group();
      model.add(new THREE.Mesh(body, standIn), new THREE.Mesh(handle, standIn));
      holder.add(model);
      // The embers it leaves: fixed brightness from the bell back, only their places move.
      const places = new Float32Array(BELL_LOOK.trail * 3);
      const glow = new Float32Array(BELL_LOOK.trail * 3);
      const ember = new THREE.Color(BELL_LOOK.ember);
      for (let k = 0; k < BELL_LOOK.trail; k++) {
        const fade = (1 - k / BELL_LOOK.trail) ** 1.5;
        glow[k * 3] = ember.r * fade;
        glow[k * 3 + 1] = ember.g * fade;
        glow[k * 3 + 2] = ember.b * fade;
      }
      const trailGeometry = ownGeometry(new THREE.BufferGeometry());
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(places, 3).setUsage(THREE.DynamicDrawUsage));
      trailGeometry.setAttribute('glow', new THREE.BufferAttribute(glow, 3));
      // Soft round sparks, added to what is behind them, a little larger close to.
      const trail = new THREE.Points(trailGeometry, ownMaterial(new THREE.ShaderMaterial({
        vertexShader: `attribute vec3 glow; varying vec3 tint;
          void main() {
            tint = glow;
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = clamp(220.0 / max(1.0, -view.z), 1.5, 8.0);
          }`,
        fragmentShader: `varying vec3 tint;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            gl_FragColor = vec4(tint, 1.0 - smoothstep(0.15, 1.0, d));
          }`,
        blending: THREE.AdditiveBlending,
        ...transparent,
      })));
      trail.name = `embers-${i}`;
      trail.visible = false;
      // Its places are written each frame, so the bounds it was built with mean nothing.
      trail.frustumCulled = false;
      // Where it will land, the size of a strike, as a raven's is; and a second ring closing in on it.
      const aim = ring(CLOUD_STRIKE.radius, threat, 0.9);
      aim.name = `aim-${i}`;
      aim.visible = false;
      const closing = ring(CLOUD_STRIKE.radius, threat, 0.45);
      closing.name = `closing-${i}`;
      aim.add(closing);
      root.add(holder, trail, aim);
      bellViews.push({ holder, model, trail, places, aim, closing });
    }
  }

  // Puts the kettlebell from the file in each holder in place of its stand-in. The file's material
  // is shared with the forge's prop, so the bells glow in a copy of their own.
  function adoptBells(models) {
    const copies = new Map();
    models.forEach((model, i) => {
      model.traverse((part) => {
        if (!part.isMesh) return;
        if (!copies.has(part.material)) {
          const copy = ownMaterial(part.material.clone());
          copy.emissive.set(BELL_LOOK.ember);
          copy.emissiveIntensity = BELL_LOOK.glow;
          copies.set(part.material, copy);
        }
        part.material = copies.get(part.material);
      });
      if (!copies.size) throw new Error('The kettlebell file has nothing to draw.');
      // The file stands on its base; the bell's point is the middle of it.
      model.position.y = -0.5;
      const view = bellViews[i];
      view.holder.remove(view.model);
      view.holder.add(model);
      view.model = model;
    });
  }

  // Asks for the model once; a file that fails leaves the stand-ins up, and one that arrives after
  // dispose() is dropped untouched.
  function load() {
    if (!loadModel) return Promise.resolve();
    const ask = async () => loadModel('kettlebell', 1);
    return Promise.all(Array.from({ length: BELL_POOL }, ask))
      .then((models) => {
        if (disposed) return;
        adoptBells(models);
        loaded.kettlebell = true;
      })
      .catch((error) => console.warn('The kettlebell model did not load; keeping the stand-ins.', error));
  }

  /** Builds on the first call and shows the group on every call; nothing of the last run shows. */
  function begin() {
    if (disposed) return Promise.resolve();
    if (!root) {
      build();
      ready = load();
    }
    root.visible = true;
    seen.count = 0;
    seen.flashAt = -Infinity;
    judged.visible = false;
    for (const view of plateViews) {
      view.holder.visible = view.pop.visible = view.live = false;
      view.popAt = -Infinity;
    }
    for (const view of bellViews) view.holder.visible = view.trail.visible = view.aim.visible = false;
    return ready;
  }

  /**
   * `time` is the run's clock, `pos` the pilot, `meet` and `bells` the meet's and Hrungnir's
   * states (or the modules that hold them), and `eye` the camera's position, which the plates turn
   * to face. Nothing is allocated here.
   */
  function update(time, pos, meet, bells, eye) {
    if (!root || !root.visible || disposed) return;
    const lift = meet.state ?? meet;
    const thrown = bells.state ?? bells;

    for (let i = 0; i < plateViews.length; i++) {
      const view = plateViews[i];
      const plate = lift.trail.plates[i];
      // A plate gone from the meet within reach of the pilot was loaded, not left behind.
      if (view.live && !plate.live && Math.hypot(view.x - pos.x, view.y - pos.y, view.z - pos.z) < 12) {
        view.popAt = time;
        view.pop.position.set(view.x, view.y, view.z);
        view.pop.material.color.copy(weights.get(view.kg) ?? silver);
      }
      view.live = plate.live;
      view.kg = plate.kg;
      view.x = plate.x;
      view.y = plate.y;
      view.z = plate.z;
      const popping = time - view.popAt;
      view.pop.visible = popping >= 0 && popping < PLATE.popFor;
      if (view.pop.visible) {
        const t = popping / PLATE.popFor;
        view.pop.scale.setScalar(1 + (PLATE.pop - 1) * t);
        view.pop.material.opacity = 0.9 * (1 - t);
        view.pop.rotation.y = Math.atan2(eye.x - view.pop.position.x, eye.z - view.pop.position.z);
      }
      view.holder.visible = plate.live;
      if (!plate.live) continue;
      view.holder.position.set(plate.x, plate.y, plate.z);
      view.holder.rotation.y = Math.atan2(eye.x - plate.x, eye.z - plate.z) + Math.sin(time * 0.9 + i * 1.7) * PLATE.sway;
      const near = 1 - smoothstep(PLATE.near[0], PLATE.near[1], Math.hypot(pos.x - plate.x, pos.y - plate.y, pos.z - plate.z));
      view.band.color.copy(silver).lerp(weights.get(plate.kg) ?? silver, near);
    }

    next.position.set(CLOUD_ZONE.x, lift.next, CLOUD_ZONE.z);
    if (lift.count > seen.count) {
      const record = lift.lifts[Math.min(lift.count, lift.lifts.length) - 1];
      seen.count = lift.count;
      // The judging at the end of a run has no line in the sky to flash.
      if (record && record.line > 0) {
        seen.flashAt = time;
        judged.position.set(CLOUD_ZONE.x, record.line, CLOUD_ZONE.z);
        if (record.good) judged.material.color.set(LINES.good);
        else judged.material.color.copy(threat);
      }
    }
    const flashing = time - seen.flashAt;
    judged.visible = flashing >= 0 && flashing < LINES.flash;
    if (judged.visible) judged.material.opacity = 0.95 * (1 - flashing / LINES.flash) * (0.75 + 0.25 * Math.cos(flashing * 24));

    for (let i = 0; i < bellViews.length; i++) {
      const view = bellViews[i];
      const bell = thrown.bells[i];
      const flying = bell.phase !== 0;
      view.holder.visible = view.trail.visible = flying;
      // The ring stays only while the bell is still coming, and goes the moment it is decided.
      view.aim.visible = bell.phase === 1 && bell.result === 0;
      if (!flying) continue;
      const age = time - bell.at;
      const index = BELLS.kg.indexOf(bell.kg);
      view.holder.position.set(bell.x, bell.y, bell.z);
      view.holder.scale.setScalar(BELL_LOOK.size[index < 0 ? 0 : index]);
      view.holder.rotation.set(age * BELL_LOOK.tumble, Math.atan2(bell.aimX - bell.fromX, bell.aimZ - bell.fromZ), 0);
      // The embers lie back along the way it came, up toward where it was thrown from.
      const ux = bell.fromX - bell.aimX;
      const uy = bell.fromY - bell.aimY;
      const uz = bell.fromZ - bell.aimZ;
      const length = Math.hypot(ux, uy, uz) || 1;
      const travelled = Math.hypot(bell.x - bell.fromX, bell.y - bell.fromY, bell.z - bell.fromZ);
      for (let k = 0; k < BELL_LOOK.trail; k++) {
        // Never back past where it was thrown from.
        const back = Math.min(k * BELL_LOOK.gap, travelled);
        view.places[k * 3] = bell.x + (ux / length) * back;
        view.places[k * 3 + 1] = bell.y + (uy / length) * back;
        view.places[k * 3 + 2] = bell.z + (uz / length) * back;
      }
      view.trail.geometry.attributes.position.needsUpdate = true;
      if (view.aim.visible) {
        view.aim.position.set(bell.aimX, bell.aimY + CLOUD_STRIKE.rise, bell.aimZ);
        view.closing.scale.setScalar(1 + (BELL_LOOK.closing - 1) * clamp(1 - age / BELLS.lead, 0, 1));
      }
    }
  }

  function reset() {
    if (root) root.visible = false;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root?.removeFromParent();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    geometries.clear();
    materials.clear();
    plateViews.length = bellViews.length = 0;
    root = next = judged = null;
  }

  return {
    begin, update, reset, dispose,
    get root() { return root; },
    get loaded() { return loaded; },
  };
}
