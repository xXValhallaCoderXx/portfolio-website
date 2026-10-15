import * as THREE from 'three';
import { CLOUD_ZONE, CLOUD_MILESTONES, CLOUD_POOL, CLOUD_STRIKE } from './cloudbase-state.js';
import { RAVEN, createRavens } from './ravens.js';

export { CLOUD_MILESTONES, CLOUD_POOL, CLOUD_STRIKE, createCloudbaseRun } from './cloudbase-state.js';

// Self-light handed to loadModel for the storm cloud, so that the underside a climbing pilot
// flies up toward is dark grey and not black.
export const CLOUD_GLOW = 0.3;

// Sparks rise through a window `span` metres tall that starts `below` the pilot. The launch
// column is lit from anywhere. A hunted thermal is only a short stretch of sparks, and it and its
// ring show in full within `sight[0]` metres of its axis and not at all beyond `sight[1]`: from
// further off it is the ravens that give it away. Ansuz's blessing (meet-runes.js) stretches both
// by BLESSING.sparks, and draws the sparks as large as they would be that much nearer.
const SPARKS = { launch: { span: 240, below: 100 }, hunted: { span: 120, below: 40 }, sight: [46, 85] };

// A storm cloud is drawn `swell` times the size of its hazard, because the cloud in the file is
// waisted and overhangs and would otherwise leave half of the hazard in clear air. The file is 1
// long, `tall` high and `deep` across, standing on its origin; `centre` moves the middle of its
// bulk onto the middle of the hazard. Clouds more than `reach` above or below the pilot are not
// drawn, and one in the camera's way is thinned to `thin`. "In the way" is judged against an
// ellipsoid `clear` times the drawn size, because the cloud in the file is lobed: against one of
// the drawn size, lobes still hid the glider on about one sight line in five. Measured against
// the real mesh from the chase camera, 1.3 leaves one hidden in a hundred and 1.15 one in twenty.
const STORM = { swell: 1.3, tall: 0.563, deep: 0.741, centre: [-0.074, -0.222, 0], reach: 320, thin: 0.22, clear: 1.3 };

// The fog's surface is see-through and drawn late, so it paints over every see-through thing
// drawn before it at 93%, in front of it or not, because none of them writes depth. That is right
// for what the fog swallows. The glow that is always held above the fog is drawn later still, so
// that it shows against the fog when the pilot looks down on it.
export const ORDER = Object.freeze({ fog: 1, aboveFog: 2 });

// The fog's surface is a disc `radius` metres across its middle, over the zone's centre: solid
// out to `edge` of that radius and fading to nothing at its rim. The glide ring (run-glide.js) is
// drawn only where it lies over it.
export const FOG_SURFACE = Object.freeze({ radius: CLOUD_ZONE.r * 1.15, edge: 0.83 });

// Lightning (run-lightning.js) lights the cloud it leaves from within: for a moment that cloud wears
// a copy of its material whose own light rises from CLOUD_GLOW by up to `glow`, toward the bolt's
// pale violet `tint`. That light comes through the file's own picture, which is dark underneath:
// rendered at night with the glow pass, half as much hardly showed. And for a moment every hunted
// thermal shows as if close: its sparks are then never drawn smaller than `flare` pixels across,
// so that from a long way off they are still seen.
export const CLOUD_LIT = Object.freeze({ glow: 4.5, tint: 0xd7dbff, flare: 3 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};

// Whether the straight line from `eye` to the point (px, py, pz) touches a cloud, which includes
// either end being inside it. `grow` is how many times the size of its hazard the cloud is taken
// to be. Both ends are moved into the cloud's own space and squashed by its radii, where the
// cloud is the unit sphere about the origin; the nearest point of the line to the origin settles it.
function inTheWay(cloud, grow, eye, px, py, pz) {
  const cos = Math.cos(cloud.turn);
  const sin = Math.sin(cloud.turn);
  const rx = cloud.rx * grow;
  const ry = cloud.ry * grow;
  const rz = cloud.rz * grow;
  let dx = eye.x - cloud.x;
  let dz = eye.z - cloud.z;
  const ax = (dx * cos - dz * sin) / rx;
  const ay = (eye.y - cloud.y) / ry;
  const az = (dx * sin + dz * cos) / rz;
  dx = px - cloud.x;
  dz = pz - cloud.z;
  const bx = (dx * cos - dz * sin) / rx - ax;
  const by = (py - cloud.y) / ry - ay;
  const bz = (dx * sin + dz * cos) / rz - az;
  const length = bx * bx + by * by + bz * bz;
  const along = length > 0 ? clamp(-(ax * bx + ay * by + az * bz) / length, 0, 1) : 0;
  const nx = ax + bx * along;
  const ny = ay + by * along;
  const nz = az + bz * along;
  return nx * nx + ny * ny + nz * nz < 1;
}

// Every object here belongs to the optional game. Nothing is built until its first explicit
// begin(), and reset() hides the whole group without touching the fjord's scene or fog settings.
//
// `loadModel` is scenery.js's loader, handed in because it cannot run outside a browser. Without
// it, or until the models arrive, or if they never do, ravens are paper darts and storm clouds
// are plain lumps.
export function createCloudbase({ scene, loadModel = null }) {
  let root = null;
  let disposed = false;
  let ready = null;
  let fog = null;
  let floor = null;
  let boundary = null;
  let flock = null;
  const loaded = { raven: false, clouds: false };
  const thermalViews = [];
  const threatViews = [];
  const cloudViews = [];
  // Lightning's doing: the cloud slot struck and how brightly it is lit (0 to 1), the level its
  // lit copies were last set to, and how much of every hunted thermal shows from anywhere (0 to 1).
  // The lit copies of the clouds' materials in use: the stand-in's, then the file's.
  const struck = { slot: -1, level: 0, shown: -1 };
  let revealed = 0;
  let lits = [];
  // Only what this view makes itself goes in these two. Geometry, materials and pictures that
  // come from loadModel stay with its cache, like those of every other model in the game.
  const materials = new Set();
  const geometries = new Set();
  const ownGeometry = (geometry) => { geometries.add(geometry); return geometry; };
  const ownMaterial = (material) => { materials.add(material); return material; };
  const transparent = { transparent: true, depthWrite: false, fog: false };

  function ring(radius, color, opacity) {
    const points = Array.from({ length: 96 }, (_, i) => {
      const angle = i / 96 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    });
    return new THREE.LineLoop(ownGeometry(new THREE.BufferGeometry().setFromPoints(points)),
      ownMaterial(new THREE.LineBasicMaterial({ color, opacity, ...transparent })));
  }

  function build() {
    root = new THREE.Group();
    root.name = 'Cloudbase';
    scene.add(root);

    // A luminous, opaque-looking top and a deep skirt make the approaching fog readable from
    // above and from its edge. The fragment waves need no textures, canvas or extra downloads.
    const fogMaterial = ownMaterial(new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 uvPosition; void main() { uvPosition = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 uvPosition; uniform float time;
        void main() {
          vec2 p = (uvPosition - 0.5) * 2.0;
          float edge = 1.0 - smoothstep(${FOG_SURFACE.edge.toFixed(2)}, 1.0, length(p));
          float cloud = sin(p.x * 22.0 + time * 0.13) * sin(p.y * 18.0 - time * 0.11);
          cloud += 0.5 * sin((p.x + p.y) * 37.0 + time * 0.19);
          vec3 color = mix(vec3(0.22, 0.36, 0.51), vec3(0.64, 0.78, 0.86), 0.55 + cloud * 0.13);
          gl_FragColor = vec4(color, edge * 0.93);
        }`,
      side: THREE.DoubleSide,
      ...transparent,
    }));
    fog = new THREE.Mesh(ownGeometry(new THREE.CircleGeometry(FOG_SURFACE.radius, 64)), fogMaterial);
    fog.rotation.x = -Math.PI / 2;
    fog.position.set(CLOUD_ZONE.x, 0, CLOUD_ZONE.z);
    fog.renderOrder = ORDER.fog;
    root.add(fog);
    floor = new THREE.Mesh(ownGeometry(new THREE.CylinderGeometry(CLOUD_ZONE.r * 1.15, CLOUD_ZONE.r * 1.2, 90, 48, 1, true)),
      ownMaterial(new THREE.MeshBasicMaterial({ color: 0x526f88, opacity: 0.55, side: THREE.DoubleSide, ...transparent })));
    floor.position.set(CLOUD_ZONE.x, -45, CLOUD_ZONE.z);
    root.add(floor);

    const particleGeometry = ownGeometry(new THREE.BufferGeometry());
    const seeds = new Float32Array(72 * 3);
    // A fixed sequence keeps the columns stable on retries and avoids per-frame randomness.
    for (let i = 0; i < 72; i++) {
      const angle = i * 2.399963229728653;
      const radius = 6 + ((i * 17) % 23);
      seeds[i * 3] = Math.cos(angle) * radius;
      seeds[i * 3 + 1] = i / 72 * 240;
      seeds[i * 3 + 2] = Math.sin(angle) * radius;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    // Slot 0 is the launch column, the one thermal that stands tall. The others are hunted and
    // have no column: where each one is, and whether it shows at all, is read from the run on
    // every frame, because they move.
    for (let i = 0; i < CLOUD_POOL.thermals; i++) {
      const hunted = i > 0;
      let column = null;
      if (!hunted) {
        column = new THREE.Mesh(ownGeometry(new THREE.CylinderGeometry(24, 24, 1800, 20, 1, true)), ownMaterial(new THREE.MeshBasicMaterial({
          color: 0xffbd69, opacity: 0.035, side: THREE.DoubleSide, ...transparent,
        })));
        column.name = `column-${i}`;
        root.add(column);
      }
      const points = new THREE.Points(particleGeometry, ownMaterial(new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 }, strength: { value: 0 }, near: { value: 0 }, sight: { value: 1 }, flare: { value: 0 },
          span: { value: hunted ? SPARKS.hunted.span : SPARKS.launch.span },
        },
        // `sight` is how far Ansuz lets the sparks be seen (they are drawn larger for their distance by
        // as much), and `flare` (0 to 1) is lightning's: it holds them to a larger least size.
        vertexShader: `uniform float time; uniform float span; uniform float sight; uniform float flare; varying float edge;
          void main() {
            vec3 p = position;
            p.y = mod(p.y * span / 240.0 + time * 15.0, span);
            edge = smoothstep(0.0, 22.0, p.y) * (1.0 - smoothstep(span - 28.0, span, p.y));
            vec4 view = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = clamp(170.0 * sight / max(1.0, -view.z), 1.0 + ${(CLOUD_LIT.flare - 1).toFixed(1)} * flare, 7.0);
          }`,
        fragmentShader: `uniform float strength; uniform float near; varying float edge;
          void main() {
            float distance = length(gl_PointCoord - 0.5) * 2.0;
            gl_FragColor = vec4(1.0, 0.76, 0.36, (1.0 - smoothstep(0.0, 1.0, distance)) * strength * near * edge * 0.85);
          }`,
        ...transparent,
      })));
      points.name = `sparks-${i}`;
      // The shader moves sparks beyond their static geometry bounds.
      points.frustumCulled = false;
      // One metre across, and stretched to its thermal's radius when it is placed.
      const core = ring(1, 0xffc777, 0.32);
      core.name = `core-${i}`;
      // Neither is ever placed below the fog, so both can be drawn after it. The column stays in
      // the ordinary order: it stands in the fog, which has to cover the foot of it.
      points.renderOrder = core.renderOrder = ORDER.aboveFog;
      root.add(points, core);
      thermalViews.push({ hunted, column, points, core, phase: i * 37, below: hunted ? SPARKS.hunted.below : SPARKS.launch.below });
    }

    CLOUD_MILESTONES.forEach((altitude, i) => {
      const marker = ring(CLOUD_ZONE.r, [0x7cefd3, 0xb9bbff, 0xffd69a][i % 3], 0.48);
      marker.position.set(CLOUD_ZONE.x, altitude, CLOUD_ZONE.z);
      root.add(marker);
    });
    boundary = ring(CLOUD_ZONE.r, 0x7d9bb9, 0.18);
    boundary.position.set(CLOUD_ZONE.x, 80, CLOUD_ZONE.z);
    root.add(boundary);

    // Ravens are never under the fog, so their marks are drawn after it as well.
    flock = createRavens({ count: CLOUD_POOL.ravens, sites: CLOUD_POOL.thermals, order: ORDER.aboveFog, ownGeometry, ownMaterial });
    root.add(flock.group);
    // A raven about to cross the pilot's path from above gets a ring the size of a strike, drawn
    // at the height of the pilot's chest straight below it: stay out of the ring and it misses.
    // Two are enough; the simulation rarely marks more than one bird at a time.
    for (let i = 0; i < 2; i++) {
      const mark = ring(CLOUD_STRIKE.radius, RAVEN.threat, 0.9);
      // Lit like the mark on the bird itself, so that the ring glows as well: see RAVEN.flare.
      mark.material.color.multiplyScalar(RAVEN.flare);
      mark.name = `threat-${i}`;
      mark.visible = false;
      mark.renderOrder = ORDER.aboveFog;
      root.add(mark);
      threatViews.push(mark);
    }

    // Every cloud wears one of the same two materials: the solid one, or a dithered see-through
    // copy for a cloud that would otherwise hide the glider from the camera. Dithering keeps a
    // thinned cloud in the ordinary depth-sorted pass, so nothing needs sorting by hand. The one
    // lightning leaves wears a third for a moment, lit from within (litCopy).
    const lump = ownGeometry(new THREE.IcosahedronGeometry(0.5, 1));
    const solid = ownMaterial(new THREE.MeshStandardMaterial({
      color: 0x6f6a8c, roughness: 1, metalness: 0, flatShading: true, emissive: 0x6f6a8c, emissiveIntensity: CLOUD_GLOW,
    }));
    const veil = ownMaterial(solid.clone());
    veil.alphaHash = true;
    veil.opacity = STORM.thin;
    const lit = litCopy(solid);
    lits = [lit];
    for (let i = 0; i < CLOUD_POOL.clouds; i++) {
      const holder = new THREE.Group();
      holder.name = `cloud-${i}`;
      holder.visible = false;
      const mesh = new THREE.Mesh(lump, solid);
      mesh.scale.set(1, STORM.tall, STORM.deep);
      holder.add(mesh);
      root.add(holder);
      // Odd slots are mirrored, so that two clouds side by side are not plainly the same cloud.
      cloudViews.push({ holder, mirror: i % 2 ? -1 : 1, thin: false, lit: false, parts: [{ mesh, solid, veil, lit }] });
    }
  }

  // A copy of a cloud's material that glows with lightning: the same picture and the same light of
  // its own, toward the bolt's colour, made brighter while a strike lasts. It is the same kind of
  // material as the one it copies, so wearing it costs no new shader.
  function litCopy(material) {
    const lit = ownMaterial(material.clone());
    lit.emissive.set(CLOUD_LIT.tint);
    return lit;
  }

  // Puts the cloud from the file in every holder in place of its lump.
  function adoptClouds(model) {
    // One see-through copy and one lit copy for each material in the file (it has one). Both
    // share the file's picture, which shows through the dither and glows when lit.
    const veils = new Map();
    const glows = new Map();
    model.traverse((part) => {
      if (!part.isMesh || veils.has(part.material)) return;
      const veil = ownMaterial(part.material.clone());
      veil.alphaHash = true;
      veil.opacity = STORM.thin;
      veils.set(part.material, veil);
      glows.set(part.material, litCopy(part.material));
    });
    if (!veils.size) throw new Error('The cloud file has nothing to draw.');
    lits = [...glows.values()];
    struck.shown = -1;
    model.position.set(STORM.centre[0], STORM.centre[1], STORM.centre[2]);
    for (let i = 0; i < cloudViews.length; i++) {
      const view = cloudViews[i];
      // A plain clone shares the file's geometry and material; the cloud has no skeleton to keep.
      const cloud = i ? model.clone() : model;
      view.holder.clear();
      view.holder.add(cloud);
      view.parts.length = 0;
      cloud.traverse((part) => {
        if (part.isMesh) view.parts.push({ mesh: part, solid: part.material, veil: veils.get(part.material), lit: glows.get(part.material) });
      });
      view.thin = view.lit = false;
    }
  }

  // Asks for the models once. Whatever happens, the promise settles quietly: a file that fails
  // leaves its stand-ins up, and one that arrives after dispose() is dropped untouched.
  function load() {
    if (!loadModel) return Promise.resolve();
    // loadModel may throw instead of rejecting; inside an async function both end up the same.
    const ask = async (name, size, selfLight) => loadModel(name, size, selfLight);
    const ravens = Promise.all(Array.from({ length: CLOUD_POOL.ravens }, () => ask('raven', RAVEN.span, RAVEN.glow)))
      .then((models) => {
        if (disposed) return;
        loaded.raven = flock.adopt(models);
        if (!loaded.raven) console.warn('The raven model has no wing bones; keeping the stand-ins.');
      })
      .catch((error) => console.warn('The raven model did not load; keeping the stand-ins.', error));
    const clouds = ask('clouds', 1, CLOUD_GLOW)
      .then((model) => {
        if (disposed) return;
        adoptClouds(model);
        loaded.clouds = true;
      })
      .catch((error) => console.warn('The storm cloud model did not load; keeping the stand-ins.', error));
    return Promise.all([ravens, clouds]).then(() => {});
  }

  // A cloud in the camera's way is thinned whether lightning has lit it or not: the glider is seen first.
  function wear(view, thin, lit) {
    view.thin = thin;
    view.lit = lit;
    for (let i = 0; i < view.parts.length; i++) {
      const part = view.parts[i];
      part.mesh.material = thin ? part.veil : lit ? part.lit : part.solid;
    }
  }

  // Builds on the first call and shows the group on every call. What comes back settles once the
  // models have taken the place of the stand-ins, or have failed to; the game does not wait for it.
  function begin() {
    if (disposed) return Promise.resolve();
    if (!root) {
      build();
      ready = load();
    }
    root.visible = true;
    // Nothing of the last run may show before this one's first update.
    flock.clear();
    for (let i = 0; i < threatViews.length; i++) threatViews[i].visible = false;
    for (let i = 0; i < cloudViews.length; i++) {
      cloudViews[i].holder.visible = false;
      wear(cloudViews[i], false, false);
    }
    struck.slot = -1;
    struck.level = 0;
    revealed = 0;
    for (let i = 0; i < thermalViews.length; i++) {
      const view = thermalViews[i];
      view.points.visible = view.core.visible = false;
      if (view.column) view.column.visible = false;
    }
    return ready;
  }

  // `time` is the run's clock, `pos` the pilot, `run` the run (or its bare state) and `eye` the
  // camera's position if clouds in its way should be thinned. `sight` is how many times as far as
  // usual a hunted thermal's sparks and ring are seen: BLESSING.sparks under Ansuz, otherwise 1.
  // Nothing is allocated here.
  function update(time, pos, run, eye = null, sight = 1) {
    if (!root || !root.visible || disposed) return;
    const state = run.state ?? run;
    const fogHeight = state.fogHeight;
    fog.position.y = fogHeight;
    fog.material.uniforms.time.value = time;
    floor.position.y = fogHeight - 45;
    boundary.position.y = Math.max(fogHeight + 3, pos.y - 8);

    for (let i = 0; i < thermalViews.length; i++) {
      const view = thermalViews[i];
      const thermal = state.thermals[i];
      // While a flock is still on its way, `x, z` is only where the lift is going to be.
      const strength = thermal.live && thermal.move === 0 ? thermal.strength : 0;
      const far = view.hunted ? sight : 1;
      const near = view.hunted ? 1 - smoothstep(SPARKS.sight[0] * far, SPARKS.sight[1] * far, Math.hypot(pos.x - thermal.x, pos.z - thermal.z)) : 1;
      // While lightning lasts, a hunted thermal shows from anywhere as if close by; lift that is
      // not there yet (its flock still on the way) has nothing to show.
      const seen = Math.max(near, revealed);
      const lit = strength * seen > 0.01;
      if (view.column) {
        view.column.visible = lit;
        view.column.position.set(thermal.x, 900, thermal.z);
        view.column.material.opacity = 0.035 * strength;
      }
      view.points.visible = view.core.visible = lit;
      view.points.material.uniforms.strength.value = strength;
      view.points.material.uniforms.near.value = seen;
      view.points.material.uniforms.sight.value = far;
      view.points.material.uniforms.flare.value = view.hunted ? revealed : 0;
      view.points.material.uniforms.time.value = time + view.phase;
      view.core.material.opacity = 0.32 * strength * seen;
      // The sparks wrap in a window around the pilot, with independent phases. Only object
      // transforms change; particle buffers and materials are reused throughout the run.
      view.points.position.set(thermal.x, Math.max(fogHeight, pos.y - view.below), thermal.z);
      view.points.rotation.y = time * 0.12 + i;
      view.core.position.set(thermal.x, Math.max(fogHeight + 2, pos.y - 10), thermal.z);
      view.core.scale.set(thermal.r, 1, thermal.r);
    }

    flock.update(time, state);
    const chest = pos.y + CLOUD_STRIKE.rise;
    let marked = 0;
    for (let i = 0; i < state.ravens.length && marked < threatViews.length; i++) {
      const raven = state.ravens[i];
      if (!raven.threat) continue;
      threatViews[marked].position.set(raven.x, chest, raven.z);
      threatViews[marked].visible = true;
      marked += 1;
    }
    for (; marked < threatViews.length; marked++) threatViews[marked].visible = false;

    for (let i = 0; i < cloudViews.length; i++) {
      const view = cloudViews[i];
      const cloud = state.clouds[i];
      const grow = cloud.fade * STORM.swell;
      const shown = cloud.fade > 0.01 && Math.abs(cloud.y - pos.y) < STORM.reach && cloud.y + cloud.ry * grow > fogHeight;
      view.holder.visible = shown;
      if (!shown) continue;
      view.holder.position.set(cloud.x, cloud.y, cloud.z);
      view.holder.rotation.y = cloud.turn;
      view.holder.scale.set(view.mirror * 2 * cloud.rx * grow, (2 * cloud.ry * grow) / STORM.tall, (2 * cloud.rz * grow) / STORM.deep);
      // The pilot is taken to be at the chest, the point the simulation tests for cloud.
      const thin = eye !== null && inTheWay(cloud, grow * STORM.clear, eye, pos.x, chest, pos.z);
      const lit = !thin && i === struck.slot && struck.level > 0;
      if (thin !== view.thin || lit !== view.lit) wear(view, thin, lit);
    }
    // Only the struck cloud wears the lit copies, so their light can follow the strike's.
    if (struck.level !== struck.shown) {
      struck.shown = struck.level;
      for (let i = 0; i < lits.length; i++) lits[i].emissiveIntensity = CLOUD_GLOW + CLOUD_LIT.glow * struck.level;
    }
  }

  /**
   * Lightning's doing, for the next update: storm cloud `slot` (or -1, none) lit from within at
   * `level` (0 to 1).
   */
  function light(slot, level) {
    struck.slot = slot;
    struck.level = level > 0 ? Math.min(1, level) : 0;
  }

  /** How much every hunted thermal shows from anywhere at the next update, 0 to 1: lightning's glimpse. */
  function reveal(amount) {
    revealed = amount > 0 ? Math.min(1, amount) : 0;
  }

  /** Whether storm cloud `slot` was drawn whole at the last update: shown, and not thinned for the camera. */
  function shown(slot) {
    const view = cloudViews[slot];
    return !!view && view.holder.visible && !view.thin;
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
    // Each raven that arrived has a skeleton of its own, which is nobody else's to release.
    flock?.dispose();
    geometries.clear();
    materials.clear();
    thermalViews.length = threatViews.length = cloudViews.length = 0;
    lits = [];
    root = fog = floor = boundary = flock = null;
  }

  return {
    begin, update, reset, dispose, light, reveal, shown,
    get root() { return root; },
    get loaded() { return loaded; },
  };
}
