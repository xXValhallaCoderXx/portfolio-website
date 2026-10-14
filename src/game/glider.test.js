import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildGlider, flexWing } from './scenery.js';
import { BRAKE, FLIGHT, STALL } from './flight.js';
import { createTestLoader, loadModel } from './test-models.js';

// Every test that looks at the pilot or the wing builds the real glider from public/models/, since
// how far a hand moves is only true of the real arm, and where the trailing edge is only of the
// real wing. Heights are metres in the glider's frame, angles radians.
const STEP = 1 / 60;
// The old arguments at their quietest: level, at trim, in still air, off the ground.
const CALM = { bank: 0, pace: 0, turn: 0, lift: 0, liftSide: 0, landed: false };
// The pilot file's own axes, about which the rig turns its bones.
const FORWARD = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(0, 0, 1);
// The wing file is 1 wide; the game draws it this many metres across.
const SPAN = 11.5;

const close = (actual, expected, slack, what = '') => assert.ok(Math.abs(actual - expected) <= slack, `${what} ${actual} is within ${slack} of ${expected}`);
const smooth = (from, to, x) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
// Random numbers from 0 to 1 that come out the same on every run of the tests.
const dice = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const wingOf = (glider) => {
  let wing = null;
  glider.group.traverse((part) => {
    if (part.isMesh && !part.isSkinnedMesh) wing ??= part;
  });
  return wing;
};
const boneOf = (glider, name) => glider.group.getObjectByName(name);
// Whether the wing's point at `i` in its surface is drawn exactly at `out`, as far as the 32-bit
// numbers the surface holds can say.
const drawnAt = (surface, i, out) =>
  surface.array[i] === Math.fround(out.x) && surface.array[i + 1] === Math.fround(out.y) && surface.array[i + 2] === Math.fround(out.z);

// The real glider with its models in and a clock of its own. `fly` poses it for a while; `still`
// takes the swing out and draws it again without moving time, so that what `measure` reads is the
// arms and the wing alone. `rest` is the wing's resting shape, which its surface still holds until
// the first pose.
async function hangGlider() {
  const glider = buildGlider({ loadModel });
  assert.equal(await glider.ready, true);
  const surface = wingOf(glider).geometry.attributes.position;
  const rest = Float32Array.from(surface.array);
  let time = 0;
  const fly = (seconds, args = {}, dt = STEP) => {
    for (let n = Math.round(seconds / dt); n > 0; n--) {
      time += dt;
      glider.pose({ ...CALM, dt, time, ...args });
    }
  };
  const still = (args = {}) => {
    glider.sway.pitch = glider.sway.roll = 0;
    glider.pose({ ...CALM, dt: 0, time, ...args });
    return glider.measure({});
  };
  // The rough air's shimmer stilled, so that a reading of the trailing edge is the pull alone.
  const calmed = (args = {}) => {
    glider.air.rough = 0;
    return still(args);
  };
  return { glider, surface, rest, fly, still, calmed };
}

// A glider whose models never arrive. Its pose still swings it, at next to no cost.
const swingOnly = () => buildGlider({ loadModel: () => new Promise(() => {}) });

// The pose as it was before the brake, the bar and the stall reached it, copied from scenery.js
// sum for sum, so that it can be held to the last digit: the swing, the roughness of the air,
// steering eased on each side, and the wing's surface.
function todaysPose() {
  const sway = { pitch: 0, pitchRate: 0, roll: 0, rollRate: 0, collapse: 0, lastBank: 0, lastLift: 0 };
  const air = { time: 0, rough: 0, brakeLeft: 0, brakeRight: 0, collapse: 0 };
  function pose({ dt, time, bank, pace, turn, lift, liftSide, landed }, collapse) {
    const { clamp } = THREE.MathUtils;
    const step = Math.min(dt, 0.1);
    if (!(step > 0)) return;
    const bankRate = clamp((bank - sway.lastBank) / step, -3, 3);
    const liftRate = clamp((lift - sway.lastLift) / step, -20, 20);
    sway.lastBank = bank;
    sway.lastLift = lift;
    air.time = time;
    air.collapse = collapse;
    air.rough += ((landed ? 0 : 0.3 + Math.min(1, lift / 5) * 0.7) - air.rough) * Math.min(1, step * 2);
    const ease = Math.min(1, step * 6);
    air.brakeLeft += (Math.min(1, Math.max(0, -turn) + 0) - air.brakeLeft) * ease;
    air.brakeRight += (Math.min(1, Math.max(0, turn) + 0) - air.brakeRight) * ease;
    const pull = 2.8 ** 2;
    const drag = 2 * 0.35 * 2.8;
    const gust = 0.55 * air.rough;
    const pitchRest = -pace * 0.02;
    const rollRest = -bankRate * 0.1;
    const pitchPush = liftRate * 0.06 + gust * (Math.sin(time * 1.7) * 0.6 + Math.sin(time * 3.1 + 1.3) * 0.4);
    const rollPush = liftRate * liftSide * 0.06 + gust * (Math.sin(time * 1.3 + 2.1) * 0.6 + Math.sin(time * 2.7 + 0.5) * 0.4);
    const slices = Math.ceil(step * 90);
    const h = step / slices;
    for (let i = 0; i < slices; i++) {
      sway.pitchRate += (pull * (pitchRest - sway.pitch) - drag * sway.pitchRate + pitchPush) * h;
      sway.pitch = clamp(sway.pitch + sway.pitchRate * h, -0.5, 0.5);
      sway.rollRate += (pull * (rollRest - sway.roll) - drag * sway.rollRate + rollPush) * h;
      sway.roll = clamp(sway.roll + sway.rollRate * h, -0.5, 0.5);
    }
    sway.collapse += ((landed ? -1.25 : 0) - sway.collapse) * Math.min(1, step * 5);
  }
  return { sway, air, pose };
}

function todaysWing(x, y, z, air, out) {
  const reach = Math.min(1, Math.abs(x) * 2);
  const aft = THREE.MathUtils.clamp(0.5 - z / (2 * 0.139), 0, 1);
  const brake = x > 0 ? air.brakeLeft : air.brakeRight;
  const lift =
    -0.035 * brake * smooth(0.08, 0.5, reach) * aft * aft * aft +
    0.012 * air.rough * reach * reach * reach * Math.sin(air.time * 9 + x * 14) +
    0.004 * air.rough * Math.sin(x * 46 + air.time * 5) * Math.sin(aft * Math.PI) +
    0.008 * air.rough * reach * reach * Math.sin(air.time * 1.7);
  const fold = air.collapse;
  if (fold <= 0) return out.set(x, y + lift, z);
  const thrash = Math.sin(air.time * 17 + x * 31) * Math.cos(air.time * 11 + z * 43);
  return out.set(
    x * (1 - 0.62 * fold) + fold * 0.04 * Math.sin(air.time * 13 + z * 40),
    y + lift - fold * (0.2 * reach * reach - 0.05 * thrash),
    z * (1 - 0.35 * fold) + fold * 0.05 * thrash,
  );
}

// Where today's rig turns a bone: from its resting turn in the file, about axes of the pilot
// file's frame, which the rig reads off a pilot not yet turned to face forward.
async function todaysBones() {
  const pilot = await loadModel('pilot-skeleton', 2.7, 0.2);
  pilot.updateMatrixWorld(true);
  const spin = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  return (name, turns) => {
    const bone = pilot.getObjectByName(name);
    const toLocal = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const turned = bone.quaternion.clone();
    for (const [about, angle] of turns) turned.premultiply(spin.setFromAxisAngle(axis.copy(about).applyQuaternion(toLocal), angle));
    return turned;
  };
}

const sameTurn = (actual, expected, what) => {
  for (const key of ['x', 'y', 'z', 'w']) assert.ok(actual[key] === expected[key], `${what}.${key}: ${actual[key]} is ${expected[key]}`);
};

test('buildGlider asks the loader it is handed for every model, the reserve included, and measures nothing until they are in', async () => {
  const loader = createTestLoader();
  const glider = buildGlider({ loadModel: loader.loadModel });
  assert.equal(glider.measure({}), null);
  assert.equal(await glider.ready, true);
  glider.pose({ ...CALM, dt: STEP, time: STEP });
  const measured = glider.measure({});
  for (const key of ['handLeft', 'handRight', 'edgeLeft', 'edgeRight', 'tipLeft', 'tipRight']) assert.ok(Number.isFinite(measured[key]), key);
  await glider.packReserve();
  assert.deepEqual(loader.calls, [['wing', 11.5, 0.2], ['pilot-skeleton', 2.7, 0.2], ['reserve', 7, 0.25]]);
});

test('a glider whose models fail keeps its stand-in, says so, and still swings', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  for (const load of [() => Promise.reject(new Error('404')), () => { throw new Error('no browser here'); }]) {
    const glider = buildGlider({ loadModel: load });
    assert.equal(await glider.ready, false);
    assert.equal(glider.measure({}), null);
    // The sling, the seat and the boxes, and no pilot.
    assert.equal(glider.group.children.length, 3);
    glider.group.traverse((part) => assert.ok(!part.isSkinnedMesh, 'no pilot model'));
    glider.pose({ ...CALM, dt: STEP, time: STEP, flying: true, brake: 1, stall: 1, foldRight: 1 });
    assert.ok(glider.sway.pitch > 0, 'the stall still rocks the stand-in back');
  }
  assert.equal(warn.mock.callCount(), 2);
});

test('pose with only the old arguments, as the hero picture and the 404 scene call it, moves the glider exactly as before', async () => {
  const { glider, surface, rest } = await hangGlider();
  const today = todaysPose();
  const turned = await todaysBones();
  const out = new THREE.Vector3();
  const roll = dice(7);
  let time = 0;
  let args = { ...CALM };
  for (let n = 0; n < 300; n++) {
    // Every so often the steering, bank, air and speed change, steering past full and lift below
    // nothing included, and now and then a frame is paused or arrives late.
    const dt = n % 47 === 0 ? 0 : n % 29 === 0 ? 0.25 : STEP;
    time += dt;
    if (n % 40 === 0) {
      args = {
        bank: roll() - 0.5, pace: roll() * 6 - 3, turn: roll() * 2.4 - 1.2, lift: roll() * 8 - 2,
        liftSide: roll() < 0.5 ? -1 : 1, landed: roll() < 0.2,
      };
    }
    // Sinking air, which has always been calmer than still air, in the air and on the ground.
    if (n >= 40 && n < 80) Object.assign(args, { lift: -1.5, landed: n >= 70 });
    // The 404 scene's emergency, staged on the gear the way lost.js does it.
    const gear = {
      collapse: n > 100 && n < 220 ? Math.min(1, (n - 100) / 30) : 0,
      throwing: n > 150 && n < 190 ? (n - 150) / 40 : 0,
      stow: n > 250 ? Math.min(1, (n - 250) / 30) : 0,
    };
    Object.assign(glider.gear, gear);
    glider.pose({ dt, time, ...args });
    today.pose({ dt, time, ...args }, gear.collapse);

    assert.deepEqual(glider.gear, gear, 'pose leaves the gear to whoever stages the emergency');
    for (const key of ['pitch', 'pitchRate', 'roll', 'rollRate', 'collapse']) {
      assert.ok(glider.sway[key] === today.sway[key], `sway.${key} at frame ${n}`);
    }
    const { brakeLeft, brakeRight } = today.air;
    const steer = brakeRight - brakeLeft;
    const sweep = Math.sin(Math.PI * gear.throwing);
    const throwing = sweep > 0 ? [[RIGHT, -0.9 * sweep], [UP, -1.1 * sweep]] : [];
    sameTurn(boneOf(glider, 'L_Upperarm').quaternion, turned('L_Upperarm', [[RIGHT, -brakeLeft * 0.7]]), 'left arm');
    sameTurn(boneOf(glider, 'R_Upperarm').quaternion, turned('R_Upperarm', [[RIGHT, -brakeRight * 0.7], ...throwing]), 'right arm');
    sameTurn(boneOf(glider, 'Spine01').quaternion, turned('Spine01', [[FORWARD, steer * 0.06]]), 'waist');
    sameTurn(boneOf(glider, 'Spine02').quaternion, turned('Spine02', [[FORWARD, steer * 0.06]]), 'chest');
    sameTurn(boneOf(glider, 'Head').quaternion, turned('Head', [[UP, -steer * 0.4]]), 'head');
    if (n % 15 === 0) {
      for (let i = 0; i < rest.length; i += 3) {
        todaysWing(rest[i], rest[i + 1], rest[i + 2], today.air, out);
        assert.ok(drawnAt(surface, i, out), `the wing's point ${i / 3} at frame ${n}`);
      }
    }
  }
});

test('on the ground or in the hero picture, with nothing pulled, the pilot hangs exactly in the hands-off pose of the file', async () => {
  const { glider, fly, still } = await hangGlider();
  const turned = await todaysBones();
  fly(2, {}, 0.1);
  const hands = still();
  sameTurn(boneOf(glider, 'L_Upperarm').quaternion, turned('L_Upperarm', []), 'left arm');
  sameTurn(boneOf(glider, 'R_Upperarm').quaternion, turned('R_Upperarm', []), 'right arm');
  close(hands.handLeft, 0.216, 0.001, 'left hand');
  close(hands.handRight, 0.216, 0.001, 'right hand');
  // A flight ends with the hands back exactly there, however the brake and the bar were left.
  fly(2, { flying: true, brake: 0.8, bar: 0.3, luff: 0.5, stall: 1 }, 0.1);
  fly(4, { landed: true }, 0.1);
  still({ landed: true });
  sameTurn(boneOf(glider, 'L_Upperarm').quaternion, turned('L_Upperarm', []), 'left arm after landing');
  sameTurn(boneOf(glider, 'R_Upperarm').quaternion, turned('R_Upperarm', []), 'right arm after landing');
  for (const key of ['brake', 'bar', 'rest', 'luff', 'stall', 'trail', 'trailLeft', 'trailRight']) assert.equal(glider.air[key], 0, key);
});

test('full steering with no brake brings that hand down to where it has always gone, in the air or not', async () => {
  const { fly, still } = await hangGlider();
  // The hand heights today's pose gives with a full steer (the body's lean moves both hands).
  for (const flying of [false, true]) {
    fly(2, { flying, turn: 1 }, 0.1);
    close(still({ flying, turn: 1 }).handRight, -0.476, 0.002, `right hand, flying: ${flying}`);
    fly(2, { flying, turn: -1 }, 0.1);
    close(still({ flying, turn: -1 }).handLeft, -0.4747, 0.002, `left hand, flying: ${flying}`);
  }
  fly(2, { turn: 1 }, 0.1);
  close(still({ turn: 1 }).handLeft, 0.2919, 0.002, 'the free hand on the ground');
});

test('in the air the hands rest a little lower; the bar raises both well above that and a deep brake lowers both well below it, equally', async () => {
  const { fly, still } = await hangGlider();
  fly(2, {}, 0.1);
  const handsOff = still();
  fly(2, { flying: true }, 0.1);
  const rest = still({ flying: true });
  close(rest.handLeft, handsOff.handLeft - 0.17, 0.01, 'resting while flying');
  fly(2, { flying: true, bar: 1 }, 0.1);
  const bar = still({ flying: true, bar: 1 });
  fly(2, { flying: true, brake: 1 }, 0.1);
  const deep = still({ flying: true, brake: 1 });
  for (const side of ['handLeft', 'handRight']) {
    assert.ok(bar[side] - rest[side] >= 0.3, `${side} is ${bar[side] - rest[side]} above the flying rest on the bar`);
    // The deep brake turns the arm to the -0.70 of a full steer, which is 0.44 m below the lower
    // resting hands and 0.61 m below the hands-off pose. Further down, the skin tears.
    assert.ok(rest[side] - deep[side] >= 0.4, `${side} is ${rest[side] - deep[side]} below the flying rest on the full brake`);
    assert.ok(handsOff[side] - deep[side] >= 0.5, `${side} is ${handsOff[side] - deep[side]} below the hands-off pose on the full brake`);
  }
  close(bar.handLeft, bar.handRight, 0.005, 'both hands on the bar');
  close(deep.handLeft, deep.handRight, 0.005, 'both hands on the full brake');
});

test('a light brake already shows more than half of the deep brake in the hands, while the wing takes the brake as it is', async () => {
  const { fly, calmed } = await hangGlider();
  fly(2, { flying: true }, 0.1);
  const rest = calmed({ flying: true });
  fly(2, { flying: true, brake: BRAKE.light }, 0.1);
  const light = calmed({ flying: true, brake: BRAKE.light });
  fly(2, { flying: true, brake: 1 }, 0.1);
  const deep = calmed({ flying: true, brake: 1 });
  for (const side of ['handLeft', 'handRight']) {
    const share = (rest[side] - light[side]) / (rest[side] - deep[side]);
    assert.ok(share >= 0.5 && share <= 0.7, `${side} shows ${share} of the deep brake at the light brake`);
  }
  for (const side of ['edgeLeft', 'edgeRight']) close(light[side] / deep[side], BRAKE.light, 0.005, `${side} at the light brake`);
});

test('the inside hand stays lower than the outside one in a turn at every depth of brake', async () => {
  const { fly, still } = await hangGlider();
  for (const turn of [1, 0.5, -0.5, -1]) {
    for (let tenth = 0; tenth <= 10; tenth++) {
      const args = { flying: true, turn, brake: tenth / 10 };
      fly(0.8, args, 0.1);
      const hands = still(args);
      const inside = turn > 0 ? hands.handRight : hands.handLeft;
      const outside = turn > 0 ? hands.handLeft : hands.handRight;
      assert.ok(inside < outside - 0.05, `turning ${turn} on brake ${tenth / 10}: inside ${inside}, outside ${outside}`);
    }
  }
});

test('the body leans and the head turns with the steering, whatever the brake is doing', async () => {
  const { glider, fly, still } = await hangGlider();
  const names = ['Spine01', 'Spine02', 'Head'];
  const leaning = () => names.map((name) => boneOf(glider, name).quaternion.toArray());
  fly(3, { flying: true, turn: 0.7 }, 0.1);
  still({ flying: true, turn: 0.7 });
  const free = leaning();
  assert.ok(free[0][3] < 0.9999, 'the body does lean');
  fly(3, { flying: true, turn: 0.7, brake: 1 }, 0.1);
  still({ flying: true, turn: 0.7, brake: 1 });
  // Component by component: the file's resting turns are not quite of unit length, which throws
  // an angle worked out from them far further off than the turns themselves are.
  leaning().forEach((turned, i) => turned.forEach((value, k) => close(value, free[i][k], 1e-9, `${names[i]}[${k}]`)));
});

test('a stall throws both hands up from the deep brake and keeps them flailing', async () => {
  const { glider, fly, still, calmed } = await hangGlider();
  fly(2, { flying: true }, 0.1);
  const rest = still({ flying: true });
  fly(1, { flying: true, brake: 1, luff: 0.8 });
  fly(0.4, { flying: true, stall: 1, luff: 1 });
  const low = { handLeft: Infinity, handRight: Infinity };
  const high = { handLeft: -Infinity, handRight: -Infinity };
  for (let n = 0; n < 60; n++) {
    fly(STEP, { flying: true, stall: 1, luff: 1 });
    const hands = glider.measure({});
    for (const side of ['handLeft', 'handRight']) {
      low[side] = Math.min(low[side], hands[side]);
      high[side] = Math.max(high[side], hands[side]);
    }
  }
  for (const side of ['handLeft', 'handRight']) {
    assert.ok(low[side] - rest[side] >= 0.3, `${side} stays ${low[side] - rest[side]} above the flying rest`);
    assert.ok(high[side] - low[side] >= 0.03, `${side} flails over ${high[side] - low[side]}`);
  }
  // With the hands off the lines, neither the brake nor steering pulls the trailing edge, even
  // while the brake is still on its way up.
  fly(2, { flying: true, stall: 1, brake: 1, turn: 1 }, 0.1);
  const wing = calmed({ flying: true, stall: 1, brake: 1, turn: 1 });
  close(wing.edgeLeft, 0, 1e-12, 'left edge, stalled');
  close(wing.edgeRight, 0, 1e-12, 'right edge, stalled');
});

test('the trailing edge comes down about 0.14 m on the light brake and 0.40 m on the full one, 0.24 m in the middle, and steering still adds on its side', async () => {
  const { surface, rest, fly, calmed } = await hangGlider();
  // The rearmost point of the middle of the wing, which no steering line reaches.
  let middle = -1;
  for (let i = 0; i < rest.length; i += 3) if (Math.abs(rest[i]) < 0.005 && (middle < 0 || rest[i + 2] < rest[middle + 2])) middle = i;
  const middleDrop = () => (rest[middle + 1] - surface.array[middle + 1]) * SPAN;

  fly(2, { flying: true }, 0.1);
  let wing = calmed({ flying: true });
  close(wing.edgeLeft, 0, 1e-12, 'no brake, left');
  close(wing.edgeRight, 0, 1e-12, 'no brake, right');
  fly(2, { flying: true, brake: BRAKE.light }, 0.1);
  wing = calmed({ flying: true, brake: BRAKE.light });
  close(wing.edgeLeft, 0.14, 0.005, 'light brake, left');
  close(wing.edgeRight, 0.14, 0.005, 'light brake, right');
  fly(2, { flying: true, brake: 1 }, 0.1);
  wing = calmed({ flying: true, brake: 1 });
  close(wing.edgeLeft, 0.4, 0.005, 'full brake, left');
  close(wing.edgeRight, 0.4, 0.005, 'full brake, right');
  close(middleDrop(), 0.24, 0.005, 'full brake, middle');

  // Steering alone pulls its own side as it always has (0.30 m there) and leaves the middle be;
  // on the full brake it adds a quarter of that on top.
  fly(2, { flying: true, turn: 1 }, 0.1);
  wing = calmed({ flying: true, turn: 1 });
  close(wing.edgeRight, 0.301, 0.003, 'full steer, right');
  close(wing.edgeLeft, 0, 1e-12, 'full steer, left');
  close(middleDrop(), 0, 1e-6, 'full steer, middle');
  fly(2, { flying: true, turn: 1, brake: 1 }, 0.1);
  wing = calmed({ flying: true, turn: 1, brake: 1 });
  close(wing.edgeRight, 0.4 + 0.25 * 0.301, 0.006, 'full brake and steer, right');
  close(wing.edgeLeft, 0.4, 0.005, 'full brake and steer, left');
});

test('nearing a stall the trailing edge flutters about 0.14 m three or four times a second', async () => {
  const { glider, fly, calmed } = await hangGlider();
  fly(1, { flying: true, luff: 1 });
  const edges = [];
  for (let n = 0; n < 60; n++) {
    fly(STEP, { flying: true, luff: 1 });
    const rough = glider.air.rough;
    edges.push(calmed({ flying: true, luff: 1 }).edgeLeft);
    glider.air.rough = rough;
  }
  const middle = (Math.max(...edges) + Math.min(...edges)) / 2;
  close(Math.max(...edges) - middle, 0.14, 0.01, 'the flutter');
  let turns = 0;
  for (let i = 1; i < edges.length; i++) if (Math.sign(edges[i] - middle) !== Math.sign(edges[i - 1] - middle)) turns++;
  assert.ok(turns >= 6 && turns <= 8, `${turns} half-beats in a second`);
});

test('a fold with no side folds the wing exactly as the 404 scene always has, and an even fold of both halves is the same fold', async () => {
  const { glider, surface, rest } = await hangGlider();
  const today = todaysPose();
  const out = new THREE.Vector3();
  const matches = (air, rule, what) => {
    for (let i = 0; i < rest.length; i += 3) {
      rule(rest[i], rest[i + 1], rest[i + 2], air, out);
      assert.ok(drawnAt(surface, i, out), `${what}: the wing's point ${i / 3}`);
    }
  };
  // The left tip, which a fold brings in by 62% give or take its thrash.
  let tip = 0;
  for (let i = 0; i < rest.length; i += 3) if (rest[i] > rest[tip]) tip = i;
  let time = 0;
  for (const collapse of [0.25, 0.6, 1]) {
    for (let n = 0; n < 20; n++) {
      time += STEP;
      glider.gear.collapse = collapse;
      glider.pose({ ...CALM, dt: STEP, time, turn: 0.4 });
      today.pose({ ...CALM, dt: STEP, time, turn: 0.4 }, collapse);
    }
    matches(today.air, todaysWing, `collapse ${collapse}`);
    // Pinned outright as well, so that the copy of today's rule cannot drift along with the rule.
    close(surface.array[tip], rest[tip] * (1 - 0.62 * collapse), 0.04 * collapse + 1e-6, `the left tip at collapse ${collapse}`);
  }
  // A raven strike reaches the wing as an even fold of both halves, and folds it no differently.
  glider.gear.collapse = 0;
  for (let n = 0; n < 20; n++) {
    time += STEP;
    glider.pose({ ...CALM, dt: STEP, time, flying: true, foldLeft: 0.6, foldRight: 0.6 });
  }
  matches({ ...glider.air, collapse: 0.6, foldLeft: 0, foldRight: 0 }, flexWing, 'an even fold');
});

test('a fold of one half leaves the far half exactly where an open wing has it, and brings the near tip in', async () => {
  const { glider, surface, rest, fly } = await hangGlider();
  const out = new THREE.Vector3();
  // The pilot's right half is the file's -x half.
  for (const [foldLeft, foldRight, far] of [[0, 0.85, 1], [0.85, 0, -1]]) {
    fly(1.5, { flying: true, foldLeft, foldRight, stall: 1, luff: 1 });
    const open = { ...glider.air, foldLeft: 0, foldRight: 0 };
    let checked = 0;
    for (let i = 0; i < rest.length; i += 3) {
      if (far * rest[i] < 0.2) continue;
      flexWing(rest[i], rest[i + 1], rest[i + 2], open, out);
      assert.ok(drawnAt(surface, i, out), `the far half's point ${i / 3} is still`);
      checked++;
    }
    assert.ok(checked > 2000, `${checked} points of the far half checked`);
    const wing = glider.measure({});
    const [near, still] = foldRight > 0 ? [wing.tipRight, wing.tipLeft] : [wing.tipLeft, wing.tipRight];
    assert.ok(near > 2.5, `the folded tip comes in ${near} m`);
    assert.equal(still, 0);
  }
});

test('however far either half folds, the cloth is never turned inside out along the span', () => {
  const out = new THREE.Vector3();
  // The thrash moves x by 0.04 * fold * sin(13 t + 40 z); at t = 0 it is at its worst one way and
  // the other on these two lines along the span.
  let least = Infinity;
  for (const z of [-Math.PI / 80, Math.PI / 80]) {
    for (let left = 0; left <= 1; left += 0.25) {
      for (let right = 0; right <= 1; right += 0.25) {
        for (const collapse of [0, 0.5]) {
          const air = { time: 0, rough: 0, trail: 0, trailLeft: 0, trailRight: 0, luff: 0, collapse, foldLeft: left, foldRight: right };
          let before = -Infinity;
          for (let i = 0; i <= 2000; i++) {
            const x = -0.5 + i / 2000;
            const now = flexWing(x, 0, z, air, out).x;
            least = Math.min(least, (now - before) * 2000);
            before = now;
          }
        }
      }
    }
  }
  // dx'/dx: 1 where nothing folds; it may not reach 0 anywhere.
  assert.ok(least > 0.1, `x' grows with x everywhere, at least ${least} times as fast`);
});

test('a stall rocks the wing back well clear of its stops, and a fold on one side rolls the wing toward it', () => {
  // A deep brake into a stall and out again, as flight.js and the game hand it to pose: airspeed
  // falling to the stall's and coming back, the brake let go as the wing goes, the cloth
  // fluttering as the load builds, and in a spin the inside half folded.
  const stallFor = STALL.harsh.time + STALL.surge;
  const fly = ({ lift = 0, rough = 0, phase = 0, side = 0 }) => {
    const glider = swingOnly();
    const sling = glider.group.children[0];
    let speed = FLIGHT.speed.deep;
    let brake = 1;
    let luff = 0;
    let foldLeft = 0;
    let foldRight = 0;
    const found = { before: -Infinity, peak: -Infinity, lowest: Infinity, rightLower: 0, frames: 0 };
    for (let n = 0; n < 10 / STEP; n++) {
      const t = n * STEP;
      const stalled = t >= 3 && t < 3 + stallFor;
      const want = t < 3 ? FLIGHT.speed.deep : stalled ? FLIGHT.speed.stall : FLIGHT.speed.trim;
      speed += (want - speed) * Math.min(1, STEP * (stalled ? FLIGHT.ease.stall : FLIGHT.ease.speed));
      if (t >= 3) brake = Math.max(0, brake - STEP * BRAKE.dump);
      luff = t < 3 ? t / 3 : stalled ? 1 : Math.max(0, luff - STEP * 6);
      const folding = stalled && t < 3 + stallFor - 0.35 ? (side ? 0.85 : 0.45) : 0;
      const left = side < 0 || !side ? folding : 0;
      const right = side > 0 || !side ? folding : 0;
      foldLeft += (left - foldLeft) * Math.min(1, STEP * (left > foldLeft ? 18 : 4));
      foldRight += (right - foldRight) * Math.min(1, STEP * (right > foldRight ? 18 : 4));
      glider.pose({
        ...CALM, dt: STEP, time: phase + t, pace: speed - FLIGHT.speed.trim, lift, liftSide: 1,
        flying: true, brake, luff, stall: stalled ? 1 : 0, foldLeft, foldRight, rough,
      });
      const { pitch } = glider.sway;
      if (t < 3) found.before = Math.max(found.before, pitch);
      found.peak = Math.max(found.peak, pitch);
      found.lowest = Math.min(found.lowest, pitch);
      if (stalled && t > 3.5) {
        // Which tip of the wing hangs lower, in the glider's frame: +x is the pilot's right.
        const tipRight = new THREE.Vector3(5, 6, 0).applyEuler(sling.rotation).y;
        const tipLeft = new THREE.Vector3(-5, 6, 0).applyEuler(sling.rotation).y;
        found.rightLower += tipRight < tipLeft ? 1 : -1;
        found.frames++;
      }
    }
    return found;
  };
  for (let phase = 0; phase < 6; phase += 0.75) {
    const calm = fly({ phase });
    assert.ok(calm.peak - calm.before >= 0.1, `the stall rocks the wing back from ${calm.before} to ${calm.peak}`);
    assert.ok(calm.peak < 0.42, `in still air the wing rocks back to ${calm.peak}`);
    // The roughest air there is, a strong thermal (a gust on the tail makes it no rougher), with
    // the wing stalled straight or spinning either way.
    for (const side of [0, 1, -1]) {
      const rough = fly({ phase, side, lift: 5, rough: 1 });
      assert.ok(rough.peak < 0.45 && rough.lowest > -0.45, `in rough air the wing swings from ${rough.lowest} to ${rough.peak}`);
      if (side) assert.ok(side * rough.rightLower > 0.8 * rough.frames, `spinning ${side}, the folded side hangs lower in most frames`);
    }
  }
});

test('nothing it is handed, however wild, puts a number astray', async () => {
  const { glider, surface } = await hangGlider();
  const roll = dice(11);
  const pick = (low, high) => low + (high - low) * roll();
  const measured = {};
  let time = 0;
  for (let n = 0; n < 200; n++) {
    const dt = roll() < 0.1 ? 0 : pick(0, 0.3);
    time += dt;
    Object.assign(glider.gear, { collapse: roll() < 0.3 ? roll() : 0, throwing: roll() < 0.1 ? roll() : 0, stow: roll() < 0.1 ? roll() : 0 });
    // Everything a little past its range now and then, as a careless caller might hand it over.
    glider.pose({
      dt, time, bank: pick(-1, 1), pace: pick(-12, 8), turn: pick(-1.5, 1.5), lift: pick(-6, 12),
      liftSide: roll() < 0.5 ? -1 : 1, landed: roll() < 0.1,
      flying: roll() < 0.8, brake: pick(-0.2, 1.2), bar: pick(-0.2, 1.2), luff: pick(-0.2, 1.2), stall: roll() < 0.3 ? 1 : 0,
      foldLeft: pick(-0.2, 1.2), foldRight: pick(-0.2, 1.2), rough: pick(-0.2, 1.2),
    });
    glider.measure(measured);
    for (const [key, value] of [...Object.entries(glider.sway), ...Object.entries(glider.air), ...Object.entries(measured)]) {
      assert.ok(Number.isFinite(value), `${key} is ${value} after pose ${n}`);
    }
    assert.ok(Math.abs(glider.sway.pitch) <= 0.5 && Math.abs(glider.sway.roll) <= 0.5);
  }
  assert.ok(surface.array.every(Number.isFinite), 'every point of the wing is a number');
  glider.group.traverse((part) => {
    if (part.isLineSegments) assert.ok(part.geometry.attributes.position.array.every(Number.isFinite), 'every line end is a number');
  });
});
