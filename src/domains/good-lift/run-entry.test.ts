import type { AirSample } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY, createEntry } from './run-entry.ts';
import { CLOUD_HUNT, CLOUD_ZONE, createCloudbaseRun } from './cloudbase-state.ts';
import { thermalProfile } from '../flight/atmosphere.ts';

const STEP = 1 / 60;
// Use the real soaring profile; the integration below independently checks it through the sky.
const lift = (d: number) => CLOUD_HUNT.s * thermalProfile(d, CLOUD_HUNT.r, CLOUD_HUNT.core);
const R = CLOUD_HUNT.r;
// Preserve the fixture's fractions of its original 60 m profile while flying at actual trim speed.
const metres = (legacy: number) => legacy / 60 * R;

// Flies straight north at trim (11.5 m/s) past a core at the origin, `off` metres to its right (the
// core on the pilot's left when `off` is negative), from five-sixths of its radius short of it to
// the same distance past, through a thermal whose flock turns `dir`. `yawRate` is the turn the glider reports, `strength` the
// thermal's and `riding(z)` whether it is flying in it there. Returns where along the pass (m, 0
// abeam the core) each call came, and which way each said to turn.
function pass({ off, dir = 1, yawRate = 0, strength = 1, riding = () => true, entry = createEntry() }: {off: number; dir?: number; yawRate?: number; strength?: number; riding?: (position: number) => boolean; entry?: ReturnType<typeof createEntry>}) {
  const calls = [];
  for (let z = metres(50); z > -metres(50); z -= 11.5 * STEP) {
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
  assert.deepEqual(pass({ off: -metres(3), dir: 1 }).calls, []);
});

test('passing a core on the flock\'s side calls the turn-in once, toward the core, inside the broad core as lift levels off', () => {
  // A pass at 2/15 of the radius to the flock's side, beyond ENTRY.side.
  for (const [off, dir] of [[-metres(8), 1], [metres(8), -1]]) {
    const { calls } = pass({ off, dir });
    assert.equal(calls.length, 1, `${off} m off, the flock turning ${dir}`);
    assert.equal(calls[0].way, dir);
    assert.ok(Math.abs(calls[0].at) <= metres(20), `called ${calls[0].at.toFixed(1)} m past abeam`);
  }
  // A pass just beyond the minimum side fraction still counts.
  assert.equal(pass({ off: -ENTRY.side * R - 0.1, dir: 1 }).calls.length, 1);
});

test('passing the core on the side away from the flock\'s turn, or beyond its useful core, calls nothing', () => {
  assert.deepEqual(pass({ off: metres(8), dir: 1 }).calls, [], 'the core on the left of a flock turning right');
  assert.deepEqual(pass({ off: -metres(8), dir: -1 }).calls, [], 'the core on the right of a flock turning left');
  assert.deepEqual(pass({ off: -metres(35), dir: 1 }).calls, [], 'too wide: the lift never gets near enough');
});

test('a glider already turning, or half a circle into the thermal, is never called, and a fold, a stall, cloud or a new thermal starts it over', () => {
  assert.deepEqual(pass({ off: -metres(8), yawRate: ENTRY.straight }).calls, [], 'turning already');
  // Half a circle turned in this thermal before the pass.
  const entry = createEntry();
  entry.step(STEP, 10, 1, 0, 0, 1, true);
  for (let i = 0; i < Math.ceil(ENTRY.settle / 1.05 / STEP); i++) entry.step(STEP, 10, 1, 1.05, 0, 1, true);
  assert.deepEqual(pass({ off: -metres(8), entry }).calls, [], 'half a circle in');
  // Out of the thermal (a fold, a stall, cloud, or another thermal) everything starts over: called
  // in one pass, called again in the next.
  const again = createEntry();
  assert.equal(pass({ off: -metres(8), entry: again }).calls.length, 1);
  assert.equal(pass({ off: -metres(8), entry: again }).calls.length, 0, 'once a thermal');
  again.step(STEP, 0, 1, 0, 0, 1, false);
  assert.equal(pass({ off: -metres(8), entry: again }).calls.length, 1, 'and again once it has started over');
  // Riding stopping part way through the pass, just before the core, calls nothing that pass.
  assert.deepEqual(pass({ off: -metres(8), riding: (z: number) => z > metres(25) || z < -metres(30) }).calls, []);
});

test('a thermal too far gone to fly into calls nothing', () => {
  assert.deepEqual(pass({ off: -metres(8), strength: ENTRY.weak - 0.01 }).calls, []);
  // At its full strength's share it still calls, its lift scaled away.
  assert.equal(pass({ off: -metres(8), strength: ENTRY.weak + 0.1 }).calls.length, 1);
});

test('on a hunted thermal of the sky itself, a straight pass beside its core on the flock\'s side calls it once, toward the core, and a pass through its middle calls nothing', () => {
  // One hunted thermal at full strength in the middle of the zone, in still air with nothing else.
  const sky = createCloudbaseRun({ hazards: false, wind: false });
  sky.reset(80, 1);
  for (const thermal of sky.state.thermals) thermal.live = false;
  const core = Object.assign(sky.state.thermals[2], { live: true, strength: 1, move: 0, x: CLOUD_ZONE.x, z: CLOUD_ZONE.z });
  const air: AirSample = {};
  const pos = { x: 0, y: 300, z: 0 };
  const calls = (off: number) => {
    const entry = createEntry();
    const said = [];
    for (let z = metres(50); z > -metres(50); z -= 11.5 * STEP) {
      pos.x = core.x + off;
      pos.z = core.z + z;
      sky.sample(pos, 0, air);
      const way = entry.step(STEP, air.lift!, core.strength, 0, air.liftSide!, core.dir, true);
      if (way) said.push(way);
    }
    return said;
  };
  // The core on the flock's side: to the right of a pilot flying north if the flock turns right.
  const beside = -metres(8) * core.dir;
  assert.deepEqual(calls(beside), [core.dir]);
  assert.deepEqual(calls(0), []);
  assert.deepEqual(calls(-beside), []);
});
