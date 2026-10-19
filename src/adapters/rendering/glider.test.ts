import type { GliderPose, LitMesh } from './rendering.types.ts';
import { isMesh, isSkinnedMesh } from './mesh.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildGlider, flexWing } from './scenery.ts';
import { BRAKE, FLIGHT } from '../../domains/flight/flight.ts';
import { createTestLoader, loadModel } from '../../test/helpers/test-models.ts';

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

const close = (actual: number, expected: number, slack: number, what = '') => assert.ok(Math.abs(actual - expected) <= slack, `${what} ${actual} is within ${slack} of ${expected}`);
const smooth = (from: number, to: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
// Random numbers from 0 to 1 that come out the same on every run of the tests.
const dice = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const wingOf = (glider: ReturnType<typeof buildGlider>): LitMesh | null => {
  let wing: LitMesh | null = null;
  glider.group.traverse((part) => {
    if (isMesh(part) && !isSkinnedMesh(part)) wing ??= part;
  });
  return wing;
};
const boneOf = (glider: ReturnType<typeof buildGlider>, name: string) => glider.group.getObjectByName(name)!;
// Whether the wing's point at `i` in its surface is drawn exactly at `out`, as far as the 32-bit
// numbers the surface holds can say.
const drawnAt = (surface: { array: ArrayLike<number> }, i: number, out: THREE.Vector3) =>
  surface.array[i] === Math.fround(out.x) && surface.array[i + 1] === Math.fround(out.y) && surface.array[i + 2] === Math.fround(out.z);

// The real glider with its models in and a clock of its own. `fly` poses it for a while; `still`
// takes the swing out and draws it again without moving time, so that what `measure` reads is the
// arms and the wing alone. `rest` is the wing's resting shape, which its surface still holds until
// the first pose.
async function hangGlider() {
  const glider = buildGlider({ loadModel });
  assert.equal(await glider.ready, true);
  const surface = wingOf(glider)!.geometry.attributes.position;
  const rest = Float32Array.from(surface.array);
  let time = 0;
  const fly = (seconds: number, args: Partial<GliderPose> = {}, dt = STEP) => {
    for (let n = Math.round(seconds / dt); n > 0; n--) {
      time += dt;
      glider.pose({ ...CALM, dt, time, ...args });
    }
  };
  const still = (args: Partial<GliderPose> = {}) => {
    glider.sway.pitch = glider.sway.roll = 0;
    glider.pose({ ...CALM, dt: 0, time, ...args });
    return glider.measure({})!;
  };
  // The rough air's shimmer stilled, so that a reading of the trailing edge is the pull alone.
  const calmed = (args: Partial<GliderPose> = {}) => {
    glider.air.rough = 0;
    return still(args);
  };
  return { glider, surface, rest, fly, still, calmed };
}

// A glider whose models never arrive. Its pose still runs the swing (which only the models
// hang from), at next to no cost.
const swingOnly = () => buildGlider({ loadModel: () => new Promise(() => {}) });

// The pose as it was before the brake, the bar and the stall reached it, copied from scenery.js
// sum for sum, so that it can be held to the last digit: the swing, the roughness of the air,
// steering eased on each side, and the wing's surface.
function todaysPose() {
  const sway = { pitch: 0, pitchRate: 0, roll: 0, rollRate: 0, collapse: 0, lastBank: 0, lastLift: 0 };
  const air = { time: 0, rough: 0, brakeLeft: 0, brakeRight: 0, collapse: 0 };
  function pose({ dt, time, bank, pace, turn, lift, liftSide, landed }: GliderPose, collapse: number) {
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

function todaysWing(x: number, y: number, z: number, air: ReturnType<typeof todaysPose>['air'], out: THREE.Vector3) {
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
  return (name: string, turns: [THREE.Vector3Like, number][]) => {
    const bone = pilot.getObjectByName(name);
    const toLocal = bone!.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    const turned = bone!.quaternion.clone();
    for (const [about, angle] of turns) turned.premultiply(spin.setFromAxisAngle(axis.copy(about).applyQuaternion(toLocal), angle));
    return turned;
  };
}

const sameTurn = (actual: THREE.Quaternion, expected: THREE.Quaternion, what: string) => {
  for (const key of ['x', 'y', 'z', 'w'] as const) assert.ok(actual[key] === expected[key], `${what}.${key}: ${actual[key]} is ${expected[key]}`);
};

// Reads how far the rig has turned one of a glider's bones from its resting turn in the file, in
// radians about `about`, an axis of the pilot file's frame (positive by the right-hand rule), with
// the axis read off a pilot not yet turned to face forward, as the rig reads it. This is the arm
// by itself, whatever the body's lean does to the hand. True only of a bone turned about that one
// axis, so not of the right arm while it throws the reserve.
async function turnReader() {
  const pilot = await loadModel('pilot-skeleton', 2.7, 0.2);
  pilot.updateMatrixWorld(true);
  const axis = new THREE.Vector3();
  const frame = new THREE.Quaternion();
  const rest = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  return (glider: ReturnType<typeof buildGlider>, name: string, about: THREE.Vector3Like) => {
    const bone = pilot.getObjectByName(name);
    axis.copy(about).applyQuaternion(bone!.parent!.getWorldQuaternion(frame).invert());
    // The rig puts its turn in front of the resting one, so taking the resting turn back off leaves
    // the rig's, grown by however far the resting turn is from unit length, which the angle read
    // from it does not care about. The axis is a hair off unit length as well (the file's turns
    // are), and the rig builds its turn from it as it is, so that is undone too.
    spin.copy(boneOf(glider, name).quaternion).multiply(rest.copy(bone!.quaternion).invert());
    return 2 * Math.atan2((spin.x * axis.x + spin.y * axis.y + spin.z * axis.z) / axis.lengthSq(), spin.w);
  };
}

test('buildGlider asks the loader it is handed for every model, the reserve included, and measures nothing until they are in', async () => {
  const loader = createTestLoader();
  const glider = buildGlider({ loadModel: loader.loadModel });
  assert.equal(glider.measure({}), null);
  assert.equal(await glider.ready, true);
  glider.pose({ ...CALM, dt: STEP, time: STEP });
  const measured = glider.measure({});
  for (const key of ['handLeft', 'handRight', 'edgeLeft', 'edgeRight', 'tipLeft', 'tipRight'] as const) assert.ok(Number.isFinite(measured![key]), key);
  await glider.packReserve();
  assert.deepEqual(loader.calls, [['wing', 11.5, 0.2], ['pilot-skeleton', 2.7, 0.2], ['reserve', 7, 0.25]]);
});

test('a glider whose models fail keeps its stand-in, says so, and its pose still runs the swing', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  for (const load of [() => Promise.reject(new Error('404')), () => { throw new Error('no browser here'); }] as const) {
    const glider = buildGlider({ loadModel: load });
    assert.equal(await glider.ready, false);
    assert.equal(glider.measure({}), null);
    // The sling, the seat and the boxes, and no pilot.
    assert.equal(glider.group.children.length, 3);
    glider.group.traverse((part) => assert.ok(!isSkinnedMesh(part), 'no pilot model'));
    // Beside a twin that is not stalled, since a frame of ordinary air rocks it a hair as well.
    const twin = swingOnly();
    const args = { ...CALM, dt: STEP, time: STEP, flying: true, brake: 1, foldRight: 1 };
    glider.pose({ ...args, stall: 1 });
    twin.pose(args);
    const rocked = glider.sway.pitch - twin.sway.pitch;
    assert.ok(rocked >= 0.003, `without the models the stall still puts the swing's pitch ${rocked} further back`);
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
    for (const key of ['pitch', 'pitchRate', 'roll', 'rollRate', 'collapse'] as const) {
      assert.ok(glider.sway[key] === today.sway[key], `sway.${key} at frame ${n}`);
    }
    const { brakeLeft, brakeRight } = today.air;
    const steer = brakeRight - brakeLeft;
    const sweep = Math.sin(Math.PI * gear.throwing);
    const throwing: [THREE.Vector3, number][] = sweep > 0 ? [[RIGHT, -0.9 * sweep], [UP, -1.1 * sweep]] : [];
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
  close(hands!.handLeft, 0.216, 0.001, 'left hand');
  close(hands!.handRight, 0.216, 0.001, 'right hand');
  // A flight ends with the hands back exactly there, however the brake and the bar were left.
  fly(2, { flying: true, brake: 0.8, bar: 0.3, luff: 0.5, stall: 1 }, 0.1);
  fly(4, { landed: true }, 0.1);
  still({ landed: true });
  sameTurn(boneOf(glider, 'L_Upperarm').quaternion, turned('L_Upperarm', []), 'left arm after landing');
  sameTurn(boneOf(glider, 'R_Upperarm').quaternion, turned('R_Upperarm', []), 'right arm after landing');
  for (const key of ['brake', 'bar', 'rest', 'luff', 'stall', 'trail', 'trailLeft', 'trailRight'] as const) assert.equal(glider.air[key], 0, key);
});

test('full steering with no brake brings that hand down to where it has always gone, in the air or not', async () => {
  const { fly, still } = await hangGlider();
  // The hand heights today's pose gives with a full steer (the body's lean moves both hands).
  for (const flying of [false, true] as const) {
    fly(2, { flying, turn: 1 }, 0.1);
    close(still({ flying, turn: 1 }).handRight, -0.476, 0.002, `right hand, flying: ${flying}`);
    fly(2, { flying, turn: -1 }, 0.1);
    close(still({ flying, turn: -1 }).handLeft, -0.4747, 0.002, `left hand, flying: ${flying}`);
  }
  fly(2, { turn: 1 }, 0.1);
  close(still({ turn: 1 }).handLeft, 0.2919, 0.002, 'the free hand on the ground');
});

test('in the air the hands rest a little lower; the bar raises both well above that and a deep brake lowers both well below it, equally', async () => {
  const { glider, fly, still } = await hangGlider();
  const turnOf = await turnReader();
  const arms = (angle: number, what: string) => {
    for (const name of ['L_Upperarm', 'R_Upperarm'] as const) close(turnOf(glider, name, RIGHT), angle, 1e-9, `${name}, ${what}`);
  };
  fly(2, {}, 0.1);
  const handsOff = still();
  fly(2, { flying: true }, 0.1);
  const rest = still({ flying: true });
  arms(-0.2, 'resting while flying');
  close(rest!.handLeft, handsOff!.handLeft! - 0.17, 0.01, 'resting while flying');
  fly(2, { flying: true, bar: 1 }, 0.1);
  const bar = still({ flying: true, bar: 1 });
  // All of the way up to the most the arm may turn: the lower rest takes none of it.
  arms(0.55, 'on the bar');
  close(bar!.handLeft, 0.588, 0.003, 'left hand on the bar');
  fly(2, { flying: true, brake: 1 }, 0.1);
  const deep = still({ flying: true, brake: 1 });
  arms(-0.7, 'on the full brake');
  for (const side of ['handLeft', 'handRight'] as const) {
    assert.ok(bar![side] - rest![side] >= 0.3, `${side} is ${bar![side] - rest![side]} above the flying rest on the bar`);
    // The deep brake turns the arm to the -0.70 of a full steer, which is 0.44 m below the lower
    // resting hands and 0.61 m below the hands-off pose. Further down, the skin tears.
    assert.ok(rest![side] - deep![side] >= 0.4, `${side} is ${rest![side] - deep![side]} below the flying rest on the full brake`);
    assert.ok(handsOff![side] - deep![side] >= 0.5, `${side} is ${handsOff![side] - deep![side]} below the hands-off pose on the full brake`);
  }
  close(bar!.handLeft, bar!.handRight, 0.005, 'both hands on the bar');
  close(deep!.handLeft, deep!.handRight, 0.005, 'both hands on the full brake');
});

test('on the bar, a hand that brakes or steers comes down exactly where it would without the bar, and a free hand stays up', async () => {
  const { glider, fly, still } = await hangGlider();
  const turnOf = await turnReader();
  const sides = [['handLeft', 'L_Upperarm', -1], ['handRight', 'R_Upperarm', 1]] as const;
  // Each for long enough that everything eased has landed on what it was handed, so that the bar
  // is all that differs.
  for (const args of [{ brake: BRAKE.light }, { brake: 1 }, { turn: 1 }, { turn: -1 }] as const) {
    fly(3, { flying: true, ...args }, 0.1);
    const plain = still({ flying: true, ...args });
    const plainArms = sides.map(([, name]) => turnOf(glider, name, RIGHT));
    fly(3, { flying: true, bar: 1, ...args }, 0.1);
    const barred = still({ flying: true, bar: 1, ...args });
    sides.forEach(([hand, name, side], i) => {
      const arm = turnOf(glider, name, RIGHT);
      if (args.brake || side * args.turn! > 0) {
        close(arm, plainArms[i], 1e-12, `${name} with ${JSON.stringify(args)}`);
        close(barred![hand], plain![hand], 1e-9, `${hand} with ${JSON.stringify(args)}`);
      } else close(arm, 0.55, 1e-9, `the free ${name} with ${JSON.stringify(args)}`);
    });
  }
  // Pinned outright: on the bar with a full steer, the steering hand is where a full steer has
  // always put it.
  close(still({ flying: true, bar: 1, turn: -1 }).handLeft, -0.4747, 0.002, 'left hand on the bar, steering left');
});

test('a light brake already shows more than half of the deep brake in the hands, while the wing takes the brake as it is', async () => {
  const { fly, calmed } = await hangGlider();
  fly(2, { flying: true }, 0.1);
  const rest = calmed({ flying: true });
  fly(2, { flying: true, brake: BRAKE.light }, 0.1);
  const light = calmed({ flying: true, brake: BRAKE.light });
  fly(2, { flying: true, brake: 1 }, 0.1);
  const deep = calmed({ flying: true, brake: 1 });
  for (const side of ['handLeft', 'handRight'] as const) {
    const share = (rest![side] - light![side]) / (rest![side] - deep![side]);
    assert.ok(share >= 0.5 && share <= 0.7, `${side} shows ${share} of the deep brake at the light brake`);
  }
  for (const side of ['edgeLeft', 'edgeRight'] as const) close(light![side] / deep![side], BRAKE.light, 0.005, `${side} at the light brake`);
});

test('the inside hand stays lower than the outside one in a turn at every depth of brake, and on the full brake goes to the floor of the arm and no further', async () => {
  const { glider, fly, still } = await hangGlider();
  const turnOf = await turnReader();
  for (const turn of [1, 0.5, -0.5, -1] as const) {
    const [inside, outside] = turn > 0 ? ['Right', 'Left'] as const : ['Left', 'Right'] as const;
    for (let tenth = 0; tenth <= 10; tenth++) {
      const args = { flying: true, turn, brake: tenth / 10 };
      fly(1.2, args, 0.1);
      const hands = still(args);
      const what = `turning ${turn} on brake ${tenth / 10}`;
      // The arms by themselves first, since the body's lean alone puts the inside hand 0.08 m below
      // the outside one on a half steer and 0.16 m on a full one. The arms' smallest gap is on the
      // full brake, where the inside arm is held at the floor, 0.05 below the outside one's -0.70.
      const armIn = turnOf(glider, `${inside[0]}_Upperarm`, RIGHT);
      const armOut = turnOf(glider, `${outside[0]}_Upperarm`, RIGHT);
      assert.ok(armIn <= armOut - 0.04, `${what}: inside arm ${armIn}, outside arm ${armOut}`);
      assert.ok(hands![`hand${inside}`] < hands![`hand${outside}`] - 0.05, `${what}: inside ${hands![`hand${inside}`]}, outside ${hands![`hand${outside}`]}`);
      // Further down than -0.75 the skin of the arm tears.
      if (tenth === 10) close(armIn, -0.75, 1e-9, `${what}: inside arm`);
      // Pinned outright: the inside hand on the full brake with a full steer.
      if (tenth === 10 && Math.abs(turn) === 1) close(hands![`hand${inside}`], turn > 0 ? -0.5182 : -0.517, 0.002, `${what}: inside hand`);
    }
  }
});

test('the body leans and the head turns with the steering, whatever the brake is doing', async () => {
  const { glider, fly, still } = await hangGlider();
  const turnOf = await turnReader();
  // The waist and the chest lean toward the turn about the pilot's forward axis, and the head
  // turns to look into it about the upright one, as far as they always have: 0.06 and 0.4 of the
  // steering.
  const leaning = (steer: number, what: string) => {
    close(turnOf(glider, 'Spine01', FORWARD), steer * 0.06, 1e-9, `the waist, ${what}`);
    close(turnOf(glider, 'Spine02', FORWARD), steer * 0.06, 1e-9, `the chest, ${what}`);
    close(turnOf(glider, 'Head', UP), -steer * 0.4, 1e-9, `the head, ${what}`);
  };
  for (const brake of [0, BRAKE.light, 1] as const) {
    fly(3, { flying: true, brake }, 0.1);
    still({ flying: true, brake });
    leaning(0, `steering nothing on brake ${brake}`);
    fly(3, { flying: true, turn: 0.7, brake }, 0.1);
    still({ flying: true, turn: 0.7, brake });
    leaning(0.7, `steering 0.7 on brake ${brake}`);
  }
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
    for (const side of ['handLeft', 'handRight'] as const) {
      low[side] = Math.min(low[side], hands![side]);
      high[side] = Math.max(high[side], hands![side]);
    }
  }
  for (const side of ['handLeft', 'handRight'] as const) {
    assert.ok(low[side] - rest![side] >= 0.3, `${side} stays ${low[side] - rest![side]} above the flying rest`);
    assert.ok(high[side] - low[side] >= 0.03, `${side} flails over ${high[side] - low[side]}`);
  }
  // With the hands off the lines, neither the brake nor steering pulls the trailing edge, even
  // while the brake is still on its way up.
  fly(2, { flying: true, stall: 1, brake: 1, turn: 1 }, 0.1);
  const wing = calmed({ flying: true, stall: 1, brake: 1, turn: 1 });
  close(wing!.edgeLeft, 0, 1e-12, 'left edge, stalled');
  close(wing!.edgeRight, 0, 1e-12, 'right edge, stalled');
});

test('nearing a stall the hands tremble a few centimetres, and on a wing flying cleanly they keep still', async () => {
  const { glider, fly, still } = await hangGlider();
  const turnOf = await turnReader();
  // Settled first, then over a second, frame by frame: how far each arm turns and each hand moves,
  // the swing aside.
  const spread = (luff: number) => {
    fly(2, { flying: true, luff }, 0.1);
    const seen: Record<string, number[]> = { L_Upperarm: [], R_Upperarm: [], handLeft: [], handRight: [] };
    for (let n = 0; n < 60; n++) {
      fly(STEP, { flying: true, luff });
      const hands = still({ flying: true, luff });
      for (const key of Object.keys(seen)) seen[key].push(key in hands! ? hands![key as keyof typeof hands] : turnOf(glider, key, RIGHT));
    }
    return Object.fromEntries(Object.entries(seen).map(([key, values]) => [key, Math.max(...values) - Math.min(...values)]));
  };
  const trembling = spread(1);
  for (const arm of ['L_Upperarm', 'R_Upperarm'] as const) close(trembling[arm], 0.06, 0.006, `${arm} trembles`);
  for (const hand of ['handLeft', 'handRight'] as const) assert.ok(trembling[hand] >= 0.03 && trembling[hand] <= 0.08, `${hand} trembles over ${trembling[hand]} m`);
  const clean = spread(0);
  for (const [key, moved] of Object.entries(clean)) assert.equal(moved, 0, `${key} keeps still`);
});

test('the trailing edge comes down about 0.16 m on the working brake and 0.40 m on the full one, 0.24 m in the middle, and steering still adds on its side', async () => {
  const { surface, rest, fly, calmed } = await hangGlider();
  // The rearmost point of the middle of the wing, which no steering line reaches.
  let middle = -1;
  for (let i = 0; i < rest.length; i += 3) if (Math.abs(rest[i]) < 0.005 && (middle < 0 || rest[i + 2] < rest[middle + 2])) middle = i;
  const middleDrop = () => (rest[middle + 1] - surface.array[middle + 1]) * SPAN;

  fly(2, { flying: true }, 0.1);
  let wing = calmed({ flying: true });
  close(wing!.edgeLeft, 0, 1e-12, 'no brake, left');
  close(wing!.edgeRight, 0, 1e-12, 'no brake, right');
  fly(2, { flying: true, brake: BRAKE.light }, 0.1);
  wing = calmed({ flying: true, brake: BRAKE.light });
  close(wing!.edgeLeft, 0.4 * BRAKE.light, 0.005, 'working brake, left');
  close(wing!.edgeRight, 0.4 * BRAKE.light, 0.005, 'working brake, right');
  fly(2, { flying: true, brake: 1 }, 0.1);
  wing = calmed({ flying: true, brake: 1 });
  close(wing!.edgeLeft, 0.4, 0.005, 'full brake, left');
  close(wing!.edgeRight, 0.4, 0.005, 'full brake, right');
  close(middleDrop(), 0.24, 0.005, 'full brake, middle');

  // Steering alone pulls its own side as it always has (0.30 m there) and leaves the middle be;
  // on the full brake it adds a quarter of that on top.
  fly(2, { flying: true, turn: 1 }, 0.1);
  wing = calmed({ flying: true, turn: 1 });
  close(wing!.edgeRight, 0.301, 0.003, 'full steer, right');
  close(wing!.edgeLeft, 0, 1e-12, 'full steer, left');
  close(middleDrop(), 0, 1e-6, 'full steer, middle');
  fly(2, { flying: true, turn: 1, brake: 1 }, 0.1);
  wing = calmed({ flying: true, turn: 1, brake: 1 });
  close(wing!.edgeRight, 0.4 + 0.25 * 0.301, 0.006, 'full brake and steer, right');
  close(wing!.edgeLeft, 0.4, 0.005, 'full brake and steer, left');
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
  for (let i = 1; i < edges.length; i++) if (Math.sign(edges[i]! - middle) !== Math.sign(edges[i - 1]! - middle)) turns++;
  assert.ok(turns >= 6 && turns <= 8, `${turns} half-beats in a second`);
});

test('a fold with no side folds the wing exactly as the 404 scene always has, and an even fold of both halves is the same fold', async () => {
  const { glider, surface, rest } = await hangGlider();
  const today = todaysPose();
  const out = new THREE.Vector3();
  const matches = <T>(air: T, rule: (x: number, y: number, z: number, air: T, out: THREE.Vector3) => THREE.Vector3, what: string) => {
    for (let i = 0; i < rest.length; i += 3) {
      rule(rest[i], rest[i + 1], rest[i + 2], air, out);
      assert.ok(drawnAt(surface, i, out), `${what}: the wing's point ${i / 3}`);
    }
  };
  // The left tip, which a fold brings in by 62% give or take its thrash.
  let tip = 0;
  for (let i = 0; i < rest.length; i += 3) if (rest[i] > rest[tip]) tip = i;
  let time = 0;
  for (const collapse of [0.25, 0.6, 1] as const) {
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
    const [near, still] = foldRight > 0 ? [wing!.tipRight, wing!.tipLeft] : [wing!.tipLeft, wing!.tipRight];
    assert.ok(near! > 2.5, `the folded tip comes in ${near} m`);
    assert.equal(still, 0);
  }
});

test('however far either half folds, the cloth is never turned inside out along the span', () => {
  const out = new THREE.Vector3();
  // The thrash moves x by 0.04 * fold * sin(13 t + 40 z); at t = 0 it is at its worst one way and
  // the other on these two lines along the span.
  let least = Infinity;
  for (const z of [-Math.PI / 80, Math.PI / 80] as const) {
    for (let left = 0; left <= 1; left += 0.25) {
      for (let right = 0; right <= 1; right += 0.25) {
        for (const [collapse, ears] of [[0, 0], [0.5, 0], [0, 0.5], [0, 1], [0.5, 1]]) {
          const air = { time: 0, rough: 0, trail: 0, trailLeft: 0, trailRight: 0, luff: 0, collapse, foldLeft: left, foldRight: right, ears, tuck: ears };
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
  // fluttering as the load builds, and in an external strike one half folded.
  const stallFor = 2.9; // a visual severity/fold sequence, independent of flight timing
  const fly = ({ lift = 0, rough = 0, phase = 0, side = 0 }) => {
    const glider = swingOnly();
    const sling = glider.group.children[0];
    let speed = FLIGHT.speed.light;
    let brake = 1;
    let luff = 0;
    let foldLeft = 0;
    let foldRight = 0;
    const found = { before: -Infinity, peak: -Infinity, lowest: Infinity, rightLower: 0, frames: 0 };
    for (let n = 0; n < 10 / STEP; n++) {
      const t = n * STEP;
      const stalled = t >= 3 && t < 3 + stallFor;
      const want = t < 3 ? FLIGHT.speed.light : stalled ? 3 : FLIGHT.speed.trim;
      speed += (want - speed) * Math.min(1, STEP * (stalled ? 4 : 1.6));
      if (t >= 3) brake = Math.max(0, brake - STEP * 10);
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
    for (const side of [0, 1, -1] as const) {
      const rough = fly({ phase, side, lift: 5, rough: 1 });
      assert.ok(rough.peak < 0.45 && rough.lowest > -0.45, `in rough air the wing swings from ${rough.lowest} to ${rough.peak}`);
      if (side) assert.ok(side * rough.rightLower > 0.8 * rough.frames, `spinning ${side}, the folded side hangs lower in most frames`);
    }
  }
});

test('a gust on the tail rocks the glider harder, and leaves air that is rougher already as it was', () => {
  // How rough the air has become after ten seconds of it.
  const roughness = (args: Partial<GliderPose>) => {
    const glider = swingOnly();
    for (let n = 1; n <= 10 / STEP; n++) glider.pose({ ...CALM, dt: STEP, time: n * STEP, flying: true, ...args });
    return glider.air.rough;
  };
  close(roughness({}), 0.3, 1e-6, 'still air');
  close(roughness({ rough: 0.5 }), 0.65, 1e-6, 'half a gust');
  close(roughness({ rough: 1 }), 1, 1e-6, 'a full gust');
  close(roughness({ lift: 5, rough: 0.5 }), 1, 1e-6, 'a strong thermal with half a gust');
  // Sinking air has always been calmer than still air, and still is without a gust.
  close(roughness({ lift: -1.5 }), 0.09, 1e-6, 'sinking air');
  close(roughness({ lift: -1.5, rough: 0.5 }), 0.65, 1e-6, 'sinking air with half a gust');
});

test('a flutter, a steer or rough air easing out toward nothing lands on it, so that the wing stops working on it', async () => {
  const { glider, fly } = await hangGlider();
  // The game eases its flutter out at 6 a second and never quite reaches nothing; left as it was,
  // it would go on fluttering the wing by ever tinier amounts for the rest of the flight.
  let luff = 1;
  fly(1, { flying: true, luff, turn: 1 });
  for (let n = 0; n < 5 / STEP; n++) {
    luff += (0 - luff) * Math.min(1, STEP * 6);
    fly(STEP, { flying: true, luff });
  }
  assert.ok(luff > 0, 'the flutter handed in has not reached nothing');
  for (const key of ['luff', 'steerRight', 'trailRight'] as const) assert.equal(glider.air[key], 0, key);
  // A glider long on the ground: the shimmer of the air dies away to nothing.
  fly(15, { landed: true }, 0.1);
  assert.equal(glider.air.rough, 0, 'the roughness of the air');
});

test('direct brake travel moves only its own hand and trailing edge, then clears for keyboard poses', async () => {
  const { glider, fly, calmed } = await hangGlider();
  const draw = (leftBrake: number, rightBrake: number, controlMode: 'legacy' | 'brakes' = 'brakes') => {
    const args = { flying: true, controlMode, leftBrake, rightBrake };
    fly(4, args); return calmed(args);
  };
  const neutral = draw(0, 0);
  const left = draw(0.3, 0), right = draw(0, 0.3);
  assert.ok(left!.handLeft! < neutral!.handLeft! - 0.1);
  assert.ok(Math.abs(left!.handRight! - neutral!.handRight!) < 1e-5, JSON.stringify({ left, right, neutral }));
  assert.ok(right!.handRight! < neutral!.handRight! - 0.1);
  assert.ok(Math.abs(right!.handLeft! - neutral!.handLeft!) < 1e-5);
  assert.ok(Math.abs(left!.edgeLeft! - neutral!.edgeLeft!) > 0.05);
  assert.ok(Math.abs(left!.edgeRight! - neutral!.edgeRight!) < 1e-5);
  const legacy = draw(0.6, 0.6, 'legacy');
  assert.ok(Math.abs(legacy!.handLeft! - neutral!.handLeft!) < 1e-5);
  assert.ok(Math.abs(legacy!.edgeRight! - neutral!.edgeRight!) < 1e-5);
});

test('nothing it is handed, however wild, puts a number astray or turns an arm past where its skin tears', async () => {
  const { glider, surface } = await hangGlider();
  const turnOf = await turnReader();
  const roll = dice(11);
  const pick = (low: number, high: number) => low + (high - low) * roll();
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
      ears: pick(-0.2, 1.2), tuck: pick(-0.2, 1.2), heave: pick(-1.5, 1.5), swing: roll() < 0.5 ? pick(-2.5, 2.5) : undefined,
    });
    glider.measure(measured);
    for (const [key, value] of [...Object.entries(glider.sway), ...Object.entries(glider.air), ...Object.entries(measured)]) {
      assert.ok(Number.isFinite(value), `${key} is ${value} after pose ${n}`);
    }
    assert.ok(Math.abs(glider.sway.pitch) <= 0.5 && Math.abs(glider.sway.roll) <= 0.5);
    assert.ok(Math.abs(glider.sway.swing) <= 1.25, `the flight's swing drawn at ${glider.sway.swing}`);
    // Down to -0.75 and up to 0.55, the bar with a flail or a tremble on top included; the throw
    // of the reserve is a turn of its own on top of the right arm's.
    for (const name of glider.gear.throwing ? ['L_Upperarm'] : ['L_Upperarm', 'R_Upperarm']) {
      const arm = turnOf(glider, name, RIGHT);
      assert.ok(arm >= -0.75 - 1e-9 && arm <= 0.55 + 1e-9, `${name} turned ${arm} after pose ${n}`);
    }
  }
  assert.ok(surface.array.every(Number.isFinite), 'every point of the wing is a number');
  glider.group.traverse((part) => {
    if (part instanceof THREE.LineSegments) assert.ok(part.geometry.attributes.position.array.every(Number.isFinite), 'every line end is a number');
  });
});

test('big ears fold each tip down and in from 70% of the way out, leave the middle of the wing alone, and keep still in calm air', async () => {
  const { glider, rest, fly, still } = await hangGlider();
  fly(1.5, { flying: true, ears: 1 });
  const folded = still({ flying: true, ears: 1 });
  for (const side of ['Left', 'Right'] as const) {
    assert.ok(folded![`tip${side}`] > 0.8, `the ${side.toLowerCase()} tip comes in ${folded![`tip${side}`]} m`);
    assert.ok(folded![`drop${side}`] > 1, `and drops ${folded![`drop${side}`]} m`);
  }
  // Inside the hinges nothing moves for the ears.
  const out = new THREE.Vector3();
  const open = new THREE.Vector3();
  const without = { ...glider.air, ears: 0 };
  let checked = 0;
  for (let i = 0; i < rest.length; i += 3) {
    if (Math.abs(rest[i]) > 0.35) continue;
    flexWing(rest[i], rest[i + 1], rest[i + 2], glider.air, out);
    flexWing(rest[i], rest[i + 1], rest[i + 2], without, open);
    assert.ok(out.equals(open), `point ${i / 3} inside the hinges`);
    checked++;
  }
  assert.ok(checked > 2000, `${checked} points checked`);
  // In calm air the folded tips hang still: a while later they are where they were.
  glider.air.rough = 0;
  const now = still({ flying: true, ears: 1 });
  fly(0.7, { flying: true, ears: 1 });
  glider.air.rough = 0;
  const later = still({ flying: true, ears: 1 });
  assert.ok(Math.abs(later!.tipLeft! - now!.tipLeft!) < 1e-9 && Math.abs(later!.dropRight! - now!.dropRight!) < 1e-9);
  // Let go, they open again.
  fly(2, { flying: true });
  glider.air.rough = 0;
  const opened = still({ flying: true });
  assert.ok(Math.abs(opened!.tipLeft) < 1e-6 && Math.abs(opened!.dropLeft) < 1e-6);
});

test('with the ears in the hands come up to the outer lines, and steering no longer pulls a hand down to its brake', async () => {
  const { glider, fly, still } = await hangGlider();
  fly(1, { flying: true });
  const open = still({ flying: true });
  fly(1.5, { flying: true, turn: 1 });
  const steered = still({ flying: true, turn: 1 });
  fly(1.5, { flying: true, ears: 1, turn: 1 });
  const ears = still({ flying: true, ears: 1, turn: 1 });
  assert.ok(ears!.handLeft! > open!.handLeft! + 0.1 && ears!.handRight! > open!.handRight! + 0.1, `hands up: ${ears!.handLeft}, ${ears!.handRight}`);
  // Steering right pulls the right hand far down; with the ears in it stays up with the left, the
  // body's lean into the turn all that is left between them.
  const pulled = steered!.handLeft! - steered!.handRight!;
  const leaned = Math.abs(ears!.handLeft! - ears!.handRight!);
  assert.ok(leaned < pulled / 3, `${leaned} m between the hands with the ears in, ${pulled} m steering on the brakes`);
  // And the steering pulls no edge of the wing down.
  assert.deepEqual([glider.air.trailLeft, glider.air.trailRight], [0, 0]);
});

test('a tuck folds the leading edge down and back under the wing and leaves the trailing edge where it was', () => {
  const air = { time: 0, rough: 0, trail: 0, trailLeft: 0, trailRight: 0, luff: 0, collapse: 0, foldLeft: 0, foldRight: 0, ears: 0, tuck: 0 };
  const tucked = { ...air, tuck: 1 };
  const open = new THREE.Vector3();
  const under = new THREE.Vector3();
  const chord = 0.139;
  for (const x of [-0.4, 0, 0.25] as const) {
    flexWing(x, 0, chord, air, open);
    flexWing(x, 0, chord, tucked, under);
    assert.ok(under.y < open.y - 0.04 && under.z < open.z - 0.02, `the leading edge at ${x} folds down and back`);
    flexWing(x, 0, -chord, air, open);
    flexWing(x, 0, -chord, tucked, under);
    assert.ok(under.equals(open), `the trailing edge at ${x} stays`);
  }
});

test('the flight\'s own swing puts the wing ahead of or behind the pilot as it is, eased and stopped at 1.25 rad, and the pilot hangs under it', () => {
  const swung = swingOnly();
  const twin = swingOnly();
  const [sling, seat] = swung.group.children;
  const [twinSling, twinSeat] = twin.group.children;
  // Swung 0.8 rad ahead and held there a while, against a twin at rest: the air rocks them both alike.
  for (let i = 0; i < 120; i++) {
    swung.pose({ ...CALM, dt: STEP, time: i * STEP, flying: true, swing: -0.8 });
    twin.pose({ ...CALM, dt: STEP, time: i * STEP, flying: true, swing: 0 });
  }
  close(swung.sway.swing, -0.8, 1e-3, 'the swing as the flight has it:');
  close(sling.rotation.x - twinSling.rotation.x, -0.8, 1e-3, 'the wing ahead:');
  close(seat.rotation.x - twinSeat.rotation.x, -0.8 * 0.85, 1e-3, 'the pilot under it:');
  // Taken over at once by a strike or the autopilot, it is eased back, not snapped.
  swung.pose({ ...CALM, dt: STEP, time: 2, flying: true, swing: 0 });
  assert.ok(swung.sway.swing < -0.6, `${swung.sway.swing} a frame on`);
  for (let i = 0; i < 60; i++) swung.pose({ ...CALM, dt: STEP, time: 2 + i * STEP, flying: true, swing: 3 });
  close(swung.sway.swing, 1.25, 1e-3, 'stopped at');
  // Left out, as the hero picture and the 404 scene leave it, nothing of it is drawn.
  const backdrop = swingOnly();
  for (let i = 0; i < 60; i++) backdrop.pose({ ...CALM, dt: STEP, time: i * STEP, flying: true });
  assert.equal(backdrop.sway.swing, 0);
});

test('with the flight\'s own swing drawn, the bar still holds the wing ahead and the brake holds it back, eased there with no swing of its own', () => {
  const [fast, slow, twin] = [swingOnly(), swingOnly(), swingOnly()];
  const [[fastSling, fastSeat], [slowSling], [twinSling, twinSeat]] = [fast, slow, twin].map((glider) => glider.group.children);
  // 4.8 m/s over trim on the bar, and 2.5 under it on the full light brake, against a twin at
  // trim: the air rocks all three alike, so what is left is where each sits.
  let most = 0;
  for (let i = 0; i < 240; i++) {
    fast.pose({ ...CALM, dt: STEP, time: i * STEP, flying: true, swing: 0, pace: 4.8, bar: 1 });
    slow.pose({ ...CALM, dt: STEP, time: i * STEP, flying: true, swing: 0, pace: -2.5, brake: 1 });
    twin.pose({ ...CALM, dt: STEP, time: i * STEP, flying: true, swing: 0 });
    most = Math.min(most, fastSling.rotation.x - twinSling.rotation.x);
  }
  const ahead = fastSling.rotation.x - twinSling.rotation.x;
  close(ahead, -4.8 * 0.02, 1e-3, 'ahead on the bar:');
  assert.ok(most >= ahead - 1e-9, `never further ahead on the way: ${most} against ${ahead}`);
  close(fastSeat.rotation.x - twinSeat.rotation.x, ahead * 0.6, 1e-3, 'the pilot leaning along:');
  close(slowSling.rotation.x - twinSling.rotation.x, 2.5 * 0.02 + 0.02, 1e-3, 'back on the brake:');
});

test('the moment to turn in lifts the side of the wing over the core', () => {
  // Against a twin posed the same without it: the air rocks them both alike.
  const pair = () => {
    const both = [swingOnly(), swingOnly()];
    for (let i = 0; i < 300; i++) for (const glider of both) glider.pose({ ...CALM, dt: STEP, time: i * STEP, flying: true });
    return both;
  };
  // A heave toward the right lifts the right side first: the swing rolls that way.
  const [heaved, still] = pair();
  for (let i = 0; i < 12; i++) {
    heaved.pose({ ...CALM, dt: STEP, time: 5 + i * STEP, flying: true, heave: 1 - i / 12 });
    still.pose({ ...CALM, dt: STEP, time: 5 + i * STEP, flying: true });
  }
  assert.ok(heaved.sway.roll > still.sway.roll + 0.02, `rolled ${heaved.sway.roll} against ${still.sway.roll}`);
});


test('physical rendering places canopy and pilot independently, including an inversion', async () => {
  const glider = buildGlider({ loadModel });
  assert.equal(await glider.ready, true);
  const snapshot = { pilot: { pos: { x: 10, y: 90, z: 20 } }, canopy: { pos: { x: 12, y: 83, z: 20 }, q: { x: 0, y: 0, z: 1, w: 0 } }, yaw: 0 };
  const unchanged = JSON.stringify(snapshot);
  glider.posePhysical(snapshot, { ...CALM, dt: STEP, time: 1, flying: true });
  const [canopy, pilot] = glider.group.children;
  const v = new THREE.Vector3();
  canopy.getWorldPosition(v);
  assert.ok(v.distanceTo(new THREE.Vector3(12, 83, 20)) < 1e-6);
  pilot.getWorldPosition(v);
  assert.ok(v.distanceTo(new THREE.Vector3(10, 90, 20)) < 1e-6);
  assert.equal(JSON.stringify(snapshot), unchanged);
  glider.pose({ ...CALM, dt: STEP, time: 2 });
  assert.ok(canopy.position.y < 3, 'ordinary hero posing restores its own rig origin');
});

test('coordinated physical turns double torso lean in either direction without moving the simulation bodies', async () => {
  const glider = buildGlider({ loadModel });
  assert.equal(await glider.ready, true);
  const turnOf = await turnReader(), v = new THREE.Vector3();
  const snapshot = { pilot: { pos: { x: 10, y: 90, z: 20 } },
    canopy: { pos: { x: 12, y: 97, z: 21 }, q: { x: 0, y: 0, z: 0, w: 1 } }, yaw: 0.4 };
  const unchanged = JSON.stringify(snapshot);
  for (const side of [-1, 1] as const) {
    for (let n = 0; n < 300; n++) glider.posePhysical(snapshot,
      { ...CALM, flying: true, turn: side, brake: 0.4, dt: STEP, time: n * STEP, coordinatedLean: 0 });
    const [canopy, pilot] = glider.group.children;
    const seatRotation = pilot.quaternion.clone(), arm = turnOf(glider, 'L_Upperarm', RIGHT);
    for (const name of ['Spine01', 'Spine02'] as const) close(turnOf(glider, name, FORWARD), side * 0.06, 1e-9, `${name} ordinary lean`);
    glider.posePhysical(snapshot, { ...CALM, flying: true, turn: side, brake: 0.4,
      dt: STEP, time: 6, coordination: 1, coordinatedLean: side });
    for (const name of ['Spine01', 'Spine02'] as const) close(turnOf(glider, name, FORWARD), side * 0.12, 1e-9, `${name} coordinated lean`);
    close(turnOf(glider, 'L_Upperarm', RIGHT), arm, 1e-9, 'arm depth stays with its physical control');
    assert.ok(pilot.quaternion.equals(seatRotation), 'weight shift does not add a fictitious suspension rotation');
    canopy.getWorldPosition(v); close(v.distanceTo(new THREE.Vector3(12, 97, 21)), 0, 1e-9, 'canopy origin');
    pilot.getWorldPosition(v); close(v.distanceTo(new THREE.Vector3(10, 90, 20)), 0, 1e-9, 'pilot origin');
    assert.ok(canopy.quaternion.equals(new THREE.Quaternion(0, 0, 0, 1)), 'canopy orientation stays physical');
  }
  assert.equal(JSON.stringify(snapshot), unchanged);
});

test('coordinated torso lean follows physical rollout, remains still when paused and clears at rest', async () => {
  const glider = buildGlider({ loadModel });
  assert.equal(await glider.ready, true);
  const turnOf = await turnReader();
  const snapshot = { pilot: { pos: { x: 0, y: 100, z: 0 } },
    canopy: { pos: { x: 0, y: 107, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, yaw: 0 };
  for (let n = 0; n < 300; n++) glider.posePhysical(snapshot,
    { ...CALM, flying: true, turn: 1, coordinatedLean: 1, dt: STEP, time: n * STEP });
  let previous = turnOf(glider, 'Spine02', FORWARD);
  for (const lean of [0.8, 0.5, 0.2, 0] as const) {
    glider.posePhysical(snapshot, { ...CALM, flying: true, coordinatedLean: lean, dt: STEP, time: 6 });
    const actual = turnOf(glider, 'Spine02', FORWARD);
    assert.ok(actual > 0 && actual < previous, 'release eases towards neutral instead of snapping or adding a swing');
    close(actual, (glider.air.steerRight + lean) * 0.06, 1e-9, 'posture follows the already eased physical signal');
    const paused = boneOf(glider, 'Spine02').quaternion.clone();
    for (let n = 0; n < 10; n++) glider.posePhysical(snapshot,
      { ...CALM, flying: true, coordinatedLean: lean, dt: 0, time: 6 + n });
    assert.ok(boneOf(glider, 'Spine02').quaternion.equals(paused), 'rendering time does not advance a paused lean');
    previous = actual;
  }
  for (let n = 0; n < 300; n++) glider.posePhysical(snapshot,
    { ...CALM, flying: true, coordinatedLean: 0, dt: STEP, time: 7 + n * STEP });
  close(turnOf(glider, 'Spine01', FORWARD), 0, 1e-9, 'no input leaves the waist at rest');
  close(turnOf(glider, 'Spine02', FORWARD), 0, 1e-9, 'no input leaves the chest at rest');
  glider.posePhysical(snapshot, { ...CALM, flying: false, landed: true, coordinatedLean: 1, dt: 0, time: 15 });
  assert.equal(glider.air.coordinatedLean, 0, 'ground posing cannot keep a flight weight shift');
  glider.pose({ ...CALM, coordinatedLean: 1, dt: 0, time: 15 });
  assert.equal(glider.air.coordinatedLean, 0, 'the hero has no coordinated flight weight shift');
});

test('reduced decorative motion preserves coordinated posture and physical body positions', async () => {
  const glider = buildGlider({ loadModel });
  assert.equal(await glider.ready, true);
  const snapshot = { pilot: { pos: { x: 8, y: 100, z: -4 } },
    canopy: { pos: { x: 9, y: 107, z: -3 }, q: { x: 0, y: 0, z: 0, w: 1 } }, yaw: 0 };
  const details = { ...CALM, flying: true, turn: -1, coordinatedLean: -1, coordination: 1, rough: 0, heave: 0 };
  for (let n = 0; n < 300; n++) glider.posePhysical(snapshot, { ...details, dt: STEP, time: 0 });
  const chest = boneOf(glider, 'Spine02').quaternion.clone();
  const origins = glider.group.children.slice(0, 2).map(body => body.getWorldPosition(new THREE.Vector3()).toArray());
  glider.posePhysical(snapshot, { ...details, dt: 0, time: 100 });
  assert.ok(boneOf(glider, 'Spine02').quaternion.equals(chest), 'the lean is functional posture, independent of decorative time');
  assert.deepEqual(glider.group.children.slice(0, 2).map(body => body.getWorldPosition(new THREE.Vector3()).toArray()), origins);
});

test('model failure still renders separate physical canopy and pilot paths', async () => {
  const glider = buildGlider({ loadModel: async () => { throw new Error('fixture model unavailable'); } });
  assert.equal(await glider.ready, false);
  const snapshot = { pilot: { pos: { x: 0, y: 100, z: 0 } }, canopy: { pos: { x: 0, y: 93, z: 0 }, q: { x: 0, y: 0, z: 1, w: 0 } }, yaw: 0 };
  glider.posePhysical(snapshot, { ...CALM, dt: STEP, time: 1, flying: true });
  const fallback = glider.group.children.at(-1);
  assert.equal(fallback!.quaternion.w, 1, 'the entire fallback rig is never spun as one object');
  assert.ok([...(fallback!.children[1] as THREE.LineSegments).geometry.attributes.position.array].every(Number.isFinite));
});

test('the fallback shows mirrored coordinated posture without moving its physical body origins', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const glider = buildGlider({ loadModel: async () => { throw new Error('fixture model unavailable'); } });
  assert.equal(await glider.ready, false);
  const snapshot = { pilot: { pos: { x: 0, y: 100, z: 0 } },
    canopy: { pos: { x: 0, y: 107, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, yaw: 0 };
  glider.posePhysical(snapshot, { ...CALM, flying: true, dt: STEP, time: 0 });
  const [wing, cords, body, head] = glider.group.children.at(-1)!.children;
  const origins = [wing, body, head].map(part => part.getWorldPosition(new THREE.Vector3()).toArray());
  for (const side of [-1, 1] as const) {
    glider.posePhysical(snapshot, { ...CALM, flying: true, coordinatedLean: side, dt: STEP, time: 1 });
    close(new THREE.Euler().setFromQuaternion(body.quaternion).z, -side * 0.12, 1e-9, 'fallback torso lean');
    assert.deepEqual([wing, body, head].map(part => part.getWorldPosition(new THREE.Vector3()).toArray()), origins);
    assert.ok([...(cords as THREE.LineSegments).geometry.attributes.position.array].every(Number.isFinite));
  }
  glider.posePhysical(snapshot, { ...CALM, flying: true, coordinatedLean: NaN, dt: STEP, time: 2 });
  assert.ok(body.quaternion.equals(new THREE.Quaternion()), 'missing or invalid telemetry leaves a finite neutral posture');
});
