import * as THREE from 'three';
import { ZONES } from './terrain.js';
import { loadModel } from './scenery.js';

// What a missing page turns into: the wing collapses, and the visitor either throws the reserve in
// time and ends up hanging in a tree, or does not and is fished out of the fjord by the longship.

// Heights are metres above the fjord, speeds are m/s.
const FALL = { from: 150, tooLate: 42, speed: 24 };
const TREE_HEIGHT = 17;
const STREAKS = 40;
const DROPS = 70;

const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
// Shoots a little past 1 and settles back, like fabric snapping open.
const snapOpen = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/**
 * `g` is the glider's flight state, `view` is the size of the picture in pixels, `harbour` is where
 * the longship is moored, `fade(change)` cuts the picture to black around a change, and
 * `onStage(name)` reports each beat of the story: gliding, falling, late, thrown, splash, tree (the
 * dry ending) and aboard (the wet one).
 */
export function createLost({ scene, camera, g, glider, view, harbour, fade, onStage }) {
  const { gear } = glider;
  const { ship, berth } = harbour;
  const [ox, oz] = harbour.out;
  const hall = ZONES.find((zone) => zone.id === 'about');

  // The fall happens over the water off the hall's shore; the tree stands by the hall's door.
  const water = new THREE.Vector3(harbour.x + ox * 28, 0, harbour.z + oz * 28);
  const tree = new THREE.Vector3(hall.x + ox * 9, hall.h, hall.z + 17);
  const post = new THREE.Vector3(hall.x + ox * 1, hall.h, hall.z + 23);
  // The pilot ends up hanging beside the trunk, on the side the camera can see.
  const hang = new THREE.Vector3(tree.x + ox * 3.4, tree.y + TREE_HEIGHT * 0.45, tree.z + 1.6);
  const hangYaw = Math.atan2(ox * 0.6, -0.8); // facing the camera, out over the water

  // ---- props that only exist for this scene

  const props = new THREE.Group();
  props.visible = false;
  scene.add(props);
  let dressed = null;
  function dress() {
    dressed ??= Promise.all([loadModel('pine-tree', TREE_HEIGHT, 0.05), loadModel('signpost', 4.6, 0.14)])
      .then(([pine, sign]) => {
        pine.position.copy(tree);
        sign.position.copy(post);
        sign.rotation.y = -0.45;
        props.add(pine, sign);
      })
      .catch((error) => console.warn('The 404 props did not load.', error));
  }

  // Streaks of air rushing up past the pilot, which is what makes the fall read as a fall.
  const streakSeeds = Array.from({ length: STREAKS }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 3 + Math.random() * 12,
    phase: Math.random() * 34,
    length: 1.5 + Math.random() * 2.5,
  }));
  const streaks = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3)),
    new THREE.LineBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false }),
  );
  streaks.frustumCulled = false;
  scene.add(streaks);

  // The splash: a burst of drops and a ring spreading over the water.
  const drops = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 3), 3)),
    new THREE.PointsMaterial({ color: 0xdff3ff, size: 0.55, transparent: true, opacity: 0, depthWrite: false }),
  );
  drops.frustumCulled = false;
  const dropSpeeds = new Float32Array(DROPS * 3);
  const ripple = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2), 0, Math.sin((i / 48) * Math.PI * 2))),
    ),
    new THREE.LineBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0 }),
  );
  scene.add(drops, ripple);
  let splashAge = Infinity;

  // ---- the story

  let stage = 'off';
  let clock = 0;
  let fallRate = 0;
  let spin = 0;
  let late = false;
  let cutting = false;
  let jump = true; // the camera jumps to its next spot instead of gliding there
  const landing = new THREE.Vector3(); // where the fall met the water
  const alongside = new THREE.Vector3(); // where the longship pulls up
  let framing = 0; // how far the picture has slid up and to the right, clear of the page's text

  function enter(next, report = true) {
    stage = next;
    clock = 0;
    if (report) onStage(next);
  }

  function reset() {
    stage = 'off';
    gear.collapse = gear.stow = gear.throwing = 0;
    if (glider.reserve) glider.reserve.visible = false;
    glider.group.visible = true;
    ship.position.x = berth.x;
    ship.position.z = berth.z;
    props.visible = false;
    streaks.material.opacity = drops.material.opacity = ripple.material.opacity = 0;
    splashAge = Infinity;
    framing = 0;
    camera.clearViewOffset();
  }

  function begin() {
    reset();
    dress();
    glider.packReserve().catch((error) => console.warn('The reserve did not load.', error));
    props.visible = true;
    g.pos.set(water.x, FALL.from, water.z);
    g.yaw = 0;
    g.yawRate = g.bank = 0;
    fallRate = -1.2;
    spin = 0;
    late = cutting = false;
    jump = true;
    enter('gliding');
  }

  function throwReserve() {
    if (stage !== 'falling' || late) return;
    enter('thrown');
  }

  function openReserve() {
    const canopy = glider.reserve;
    if (canopy) {
      canopy.visible = true;
      canopy.position.set(0.4, 6.5, 0.6);
      canopy.rotation.set(0, 0, 0);
      canopy.scale.setScalar(0.02);
    }
    enter('open', false);
  }

  function splash() {
    landing.set(g.pos.x, 0, g.pos.z);
    alongside.set(landing.x - ox * 3, 0, landing.z - 5);
    const at = drops.geometry.attributes.position;
    for (let i = 0; i < DROPS; i++) {
      const around = Math.random() * Math.PI * 2;
      const out = 1.5 + Math.random() * 5;
      at.setXYZ(i, landing.x, 0.2, landing.z);
      dropSpeeds.set([Math.cos(around) * out, 6 + Math.random() * 9, Math.sin(around) * out], i * 3);
    }
    ripple.position.set(landing.x, 0.15, landing.z);
    splashAge = 0;
    jump = true;
    enter('splash');
  }

  function update(dt, time) {
    if (stage === 'off') return;
    clock += dt;
    const canopy = glider.reserve;

    if (stage === 'gliding') {
      // A calm second of ordinary flight before it all goes wrong.
      g.pos.z -= 9 * dt;
      g.pos.y += fallRate * dt;
      if (clock > 1.1) enter('falling');
    } else if (stage === 'falling' || stage === 'thrown') {
      gear.collapse = Math.min(1, gear.collapse + dt * 3.5);
      fallRate += ((stage === 'thrown' ? -15 : -FALL.speed) - fallRate) * Math.min(1, dt * 1.6);
      spin += (2.8 - spin) * Math.min(1, dt * 2);
      g.yaw += spin * dt;
      g.bank = 0.45 * Math.sin(clock * 5.3);
      g.pos.y += fallRate * dt;
      if (stage === 'thrown') {
        gear.throwing = Math.min(1, clock / 0.55);
        if (clock >= 0.55) openReserve();
      } else if (!late && g.pos.y < FALL.tooLate) {
        late = true;
        onStage('late');
      }
      if (g.pos.y <= 1.2) splash();
    } else if (stage === 'open') {
      // The canopy snaps open, the spin dies and the wrecked wing is gathered in.
      if (canopy) canopy.scale.setScalar(Math.max(0.02, snapOpen(Math.min(1, clock / 0.4))));
      fallRate += (-6 - fallRate) * Math.min(1, dt * 5);
      spin *= Math.exp(-dt * 3);
      g.yaw += spin * dt;
      g.bank *= Math.exp(-dt * 3);
      gear.stow = Math.min(1, clock / 0.7);
      g.pos.y += fallRate * dt;
      if (clock > 1.2 && !cutting) {
        cutting = true;
        // Cut to moments later, drifting down over the tree, however high the reserve came out.
        fade(() => {
          g.pos.set(hang.x + ox * 4, hang.y + 21, hang.z + 5);
          g.yaw = hangYaw;
          g.bank = 0;
          jump = true;
          enter('drifting', false);
        });
      }
    } else if (stage === 'drifting') {
      g.pos.y -= 6.5 * dt;
      g.pos.x += (hang.x - g.pos.x) * Math.min(1, dt * 1.2);
      g.pos.z += (hang.z - g.pos.z) * Math.min(1, dt * 1.2);
      g.bank = 0.14 * Math.sin(clock * 2.1);
      if (canopy) canopy.rotation.z = 0.1 * Math.sin(time * 2.3);
      if (g.pos.y <= hang.y) {
        g.pos.copy(hang);
        enter('tree');
      }
    } else if (stage === 'tree') {
      // Snagged: the pilot swings to a stop while the canopy settles over the treetop.
      g.bank = 0.16 * Math.sin(clock * 2.4) * Math.exp(-clock * 0.35);
      if (canopy) {
        const settle = ease(Math.min(1, clock / 0.9));
        const top = new THREE.Vector3(tree.x - g.pos.x, tree.y + TREE_HEIGHT - 2.5 - g.pos.y, tree.z - g.pos.z).applyAxisAngle(UP, g.yaw);
        canopy.position.set(lerp(0.4, top.x, settle), lerp(6.5, top.y, settle), lerp(0.6, top.z, settle));
        canopy.rotation.set(0.45 * settle, 0, 0.3 * settle);
        canopy.scale.set(1, 1 - 0.35 * settle, 1);
      }
    } else if (stage === 'splash') {
      g.pos.y = Math.max(-4, g.pos.y - 6 * dt);
      if (clock > 0.25) glider.group.visible = false;
      if (clock > 0.9) enter('rescue', false);
    } else if (stage === 'rescue') {
      // The longship leaves its berth and pulls up beside the spot.
      const t = ease(Math.min(1, clock / 2.4));
      ship.position.x = lerp(berth.x, alongside.x, t);
      ship.position.z = lerp(berth.z, alongside.z, t);
      if (clock >= 2.6) {
        glider.group.visible = true;
        gear.stow = 1;
        g.yaw = Math.atan2(ox, -oz);
        g.bank = 0;
        enter('aboard');
      }
    }
    if (stage === 'aboard') {
      // Sat on deck toward the stern, riding the ship's bob.
      g.pos.set(ship.position.x - ox * 4, ship.position.y + 2.9, ship.position.z - oz * 4);
    }

    const dropping = stage === 'falling' || stage === 'thrown' || stage === 'open' || stage === 'drifting';
    g.vy = stage === 'drifting' ? -6.5 : dropping ? fallRate : 0;

    // Air streaks, strongest at full falling speed.
    const rush = stage === 'falling' || stage === 'thrown' ? Math.min(1, Math.abs(fallRate) / FALL.speed) : 0;
    streaks.material.opacity += (rush * 0.5 - streaks.material.opacity) * Math.min(1, dt * 6);
    if (streaks.material.opacity > 0.01) {
      const at = streaks.geometry.attributes.position;
      streakSeeds.forEach((seed, i) => {
        const x = g.pos.x + Math.cos(seed.angle) * seed.radius;
        const z = g.pos.z + Math.sin(seed.angle) * seed.radius;
        const y = g.pos.y + ((seed.phase + time * 46) % 34) - 17;
        at.setXYZ(i * 2, x, y, z);
        at.setXYZ(i * 2 + 1, x, y + seed.length, z);
      });
      at.needsUpdate = true;
    }

    if (splashAge < 2) {
      splashAge += dt;
      const at = drops.geometry.attributes.position;
      for (let i = 0; i < DROPS; i++) {
        dropSpeeds[i * 3 + 1] -= 18 * dt;
        at.setXYZ(
          i,
          at.getX(i) + dropSpeeds[i * 3] * dt,
          Math.max(0, at.getY(i) + dropSpeeds[i * 3 + 1] * dt),
          at.getZ(i) + dropSpeeds[i * 3 + 2] * dt,
        );
      }
      at.needsUpdate = true;
      drops.material.opacity = Math.max(0, 1 - splashAge / 1.3);
      ripple.scale.setScalar(1 + splashAge * 10);
      ripple.material.opacity = Math.max(0, 0.8 - splashAge * 0.5);
    }
  }

  // ---- the camera

  const from = new THREE.Vector3();
  const at = new THREE.Vector3();

  /** Points the camera for the current beat. Call once per frame in place of the usual chase. */
  function aim(dt) {
    let follow = 2.5;
    if (stage === 'drifting' || stage === 'tree') {
      from.set(tree.x + ox * 15, tree.y + 8, tree.z + 18);
      at.set(tree.x - ox * 1.5, tree.y + TREE_HEIGHT * 0.64, tree.z + 1);
    } else if (stage === 'splash' || stage === 'rescue' || stage === 'aboard') {
      from.set(landing.x + ox * 21, 5, landing.z + 17);
      at.set(landing.x, 2.5, landing.z - 3);
    } else {
      // Out over the water and a little below, looking back up at the pilot and the shore behind.
      from.set(g.pos.x + ox * 21, g.pos.y - 2, g.pos.z + 15);
      at.set(g.pos.x, g.pos.y + 3.5, g.pos.z);
      follow = 7;
    }
    if (jump) camera.position.copy(from);
    else camera.position.lerp(from, 1 - Math.exp(-dt * follow));
    jump = false;
    if (stage === 'falling' || stage === 'thrown') {
      // The faster the fall, the harder the picture shakes.
      const shake = (0.3 * Math.abs(fallRate)) / FALL.speed;
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(at);
    // Each ending puts its text over the lower left, so the picture slides up and to the right.
    const ended = stage === 'drifting' || stage === 'tree' || stage === 'rescue' || stage === 'aboard';
    framing += ((ended ? 1 : 0) - framing) * Math.min(1, dt * 3);
    camera.setViewOffset(view.width, view.height, -0.2 * view.width * framing, 0.1 * view.height * framing, view.width, view.height);
  }

  return { begin, throwReserve, update, aim, reset };
}
