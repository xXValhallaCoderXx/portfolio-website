import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY, createEntry } from './run-entry.js';
import { CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.js';

const STEP = 1 / 60;
const ease = (value) => value * value * (3 - 2 * value);
// A hunted thermal's lift at `d` metres from its middle, as the sky lays it out: 1.47 times its
// 19.25 m/s at the middle, fading over the whole of its 38 m.
const lift = (d) => 19.25 * 1.47 * ease(Math.min(1, Math.max(0, 1 - d / 38)));
const R = 38;

// Flies straight north at trim (11.5 m/s) past a core at the origin, `off` metres to its right (the
// core on the pilot's left when `off` is negative), from 50 m short of it to 50 m past, through a
// thermal whose flock turns `dir`. `yawRate` is the turn the glider reports, `strength` the
// thermal's and `riding(z)` whether it is flying in it there. Returns where along the pass (m, 0
// abeam the core) each call came, and which way each said to turn.
function pass({ off, dir = 1, yawRate = 0, strength = 1, riding = () => true, entry = createEntry() }) {
  const calls = [];
  for (let z = 50; z > -50; z -= 11.5 * STEP) {
    const d = Math.hypot(off, z);
    // The core's side as the sky works it out: how far to the right of the heading it lies, over the
    // radius. Flying north, the core at x = 0 is `off` metres to the left of a pilot at x = off.
    const side = -off / R;
    const way = entry.step(STEP, lift(d) * strength, strength, yawRate, side, dir, riding(z));
    if (way) calls.push({ at: -z, way });
  }
  return { calls, entry };
}

test('flying straight through the middle of a hunted core calls no turn-in, however fast the lift builds', () => {
  for (const dir of [1, -1]) assert.deepEqual(pass({ off: 0, dir }).calls, []);
  // Nor a pass so near the middle that the core is hardly to either side.
  assert.deepEqual(pass({ off: -3, dir: 1 }).calls, []);
});

test('passing a core 8 m to the flock\'s side calls the turn-in once, toward the core, within a couple of metres of abeam', () => {
  // The core 8 m to the right of a flock turning right, and 8 m to the left of one turning left.
  for (const [off, dir] of [[-8, 1], [8, -1]]) {
    const { calls } = pass({ off, dir });
    assert.equal(calls.length, 1, `${off} m off, the flock turning ${dir}`);
    assert.equal(calls[0].way, dir);
    assert.ok(calls[0].at >= 0 && calls[0].at <= 3, `called ${calls[0].at.toFixed(1)} m past abeam`);
  }
  // As near as 4.6 m to its side still counts.
  assert.equal(pass({ off: -ENTRY.side * R - 0.1, dir: 1 }).calls.length, 1);
});

test('passing the core on the side away from the flock\'s turn, or 14 m wide of it, calls nothing', () => {
  assert.deepEqual(pass({ off: 8, dir: 1 }).calls, [], 'the core on the left of a flock turning right');
  assert.deepEqual(pass({ off: -8, dir: -1 }).calls, [], 'the core on the right of a flock turning left');
  assert.deepEqual(pass({ off: -14, dir: 1 }).calls, [], 'too wide: the lift never gets near enough');
});

test('a glider already turning, or half a circle into the thermal, is never called, and a fold, a stall, cloud or a new thermal starts it over', () => {
  assert.deepEqual(pass({ off: -8, yawRate: ENTRY.straight }).calls, [], 'turning already');
  // Half a circle turned in this thermal before the pass.
  const entry = createEntry();
  entry.step(STEP, 10, 1, 0, 0, 1, true);
  for (let i = 0; i < Math.ceil(ENTRY.settle / 1.05 / STEP); i++) entry.step(STEP, 10, 1, 1.05, 0, 1, true);
  assert.deepEqual(pass({ off: -8, entry }).calls, [], 'half a circle in');
  // Out of the thermal (a fold, a stall, cloud, or another thermal) everything starts over: called
  // in one pass, called again in the next.
  const again = createEntry();
  assert.equal(pass({ off: -8, entry: again }).calls.length, 1);
  assert.equal(pass({ off: -8, entry: again }).calls.length, 0, 'once a thermal');
  again.step(STEP, 0, 1, 0, 0, 1, false);
  assert.equal(pass({ off: -8, entry: again }).calls.length, 1, 'and again once it has started over');
  // Riding stopping part way through the pass, just before the core, calls nothing that pass.
  assert.deepEqual(pass({ off: -8, riding: (z) => z > 5 || z < -20 }).calls, []);
});

test('a thermal too far gone to fly into calls nothing', () => {
  assert.deepEqual(pass({ off: -8, strength: ENTRY.weak - 0.01 }).calls, []);
  // At its full strength's share it still calls, its lift scaled away.
  assert.equal(pass({ off: -8, strength: ENTRY.weak + 0.1 }).calls.length, 1);
});

test('on a hunted thermal of the sky itself, a straight pass 8 m beside its core on the flock\'s side calls it once, toward the core, and a pass through its middle calls nothing', () => {
  // One hunted thermal at full strength in the middle of the zone, in still air with nothing else.
  const sky = createCloudbaseRun({ hazards: false, wind: false });
  sky.reset(80, 1);
  for (const thermal of sky.state.thermals) thermal.live = false;
  const core = Object.assign(sky.state.thermals[1], { live: true, strength: 1, move: 0, x: CLOUD_ZONE.x, z: CLOUD_ZONE.z });
  const air = {};
  const pos = { x: 0, y: 300, z: 0 };
  const calls = (off) => {
    const entry = createEntry();
    const said = [];
    for (let z = 50; z > -50; z -= 11.5 * STEP) {
      pos.x = core.x + off;
      pos.z = core.z + z;
      sky.sample(pos, 0, air);
      const way = entry.step(STEP, air.lift, core.strength, 0, air.liftSide, core.dir, true);
      if (way) said.push(way);
    }
    return said;
  };
  // The core on the flock's side: to the right of a pilot flying north if the flock turns right.
  const beside = -8 * core.dir;
  assert.deepEqual(calls(beside), [core.dir]);
  assert.deepEqual(calls(0), []);
  assert.deepEqual(calls(-beside), []);
});
