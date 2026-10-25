import type { FlightState, Vector3 } from '../flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLIDERS, GLIDER_HANDLING, GLIDER_NAMES, GLIDER_NOMINAL, GLIDER_TABLES, canRotate, gliderCard, coachWingFor, guidanceFor, isGlider, nominalFor, planFor } from './gliders.ts';
import { FLIGHT } from '../flight/flight.ts';
import { PHYSICS, wingTable } from '../flight/flight-physics.ts';
import { createFlight, physicsEnergy, stepFlight } from '../flight/flight.ts';
import { holdSteady, pair, pitchRinging, stallOnset, thermalClimb } from '../../test/helpers/flight-lab.ts';

// The gliders as they fly in still air, measured by the flight lab. Real classes differ little at
// trim: what tells them apart is the bar, the brakes' climb, the swing, the stall and the energy.
const make = (id: string) => (pos: Vector3) => createFlight(pos, id);
const measured = Object.fromEntries(GLIDERS.map(id => [id, {
  trim: holdSteady(pair(0), { make: make(id) }),
  bar: holdSteady({ controlMode: 'brakes', leftBrake: 0, rightBrake: 0, bar: true }, { make: make(id) }),
  climb: thermalClimb(pair(0.5, 0.2), { make: make(id) }),
  ring: pitchRinging(pair(0.6), { make: make(id) }),
  turn: holdSteady(pair(0.3, 0), { make: make(id) }),
  stall: stallOnset(pair(1), { make: make(id) }),
}]));
const near = (actual: number, expected: number, tolerance: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual.toFixed(3)} is not ${expected} ± ${tolerance}`);

test('five gliders are registered by id, named, and flown by their own tables', () => {
  assert.deepEqual([...GLIDERS], ['en-a', 'en-b', 'en-c', 'en-d', 'acro']);
  for (const id of GLIDERS) {
    assert.equal(wingTable(id), GLIDER_TABLES[id]);
    assert.ok(GLIDER_NAMES[id].name && GLIDER_NAMES[id].badge && GLIDER_NAMES[id].role);
    assert.notDeepEqual(GLIDER_TABLES[id], PHYSICS);
    assert.ok(GLIDER_TABLES[id].feel!.pitchDamping > 0);
    assert.equal(createFlight({ x: 0, y: 1000, z: 0 }, id).physical.wing, id);
  }
  assert.ok(isGlider('en-c') && !isGlider('classic') && !isGlider('en-x') && !isGlider(3));
});

test('each glider trims, glides and runs on the bar as its class should', () => {
  const expected = {
    'en-a': { trim: 11.0, glide: 8.1, bar: 13.2, barGlide: 6.9 },
    'en-b': { trim: 11.5, glide: 8.5, bar: 14.2, barGlide: 7.2 },
    'en-c': { trim: 11.85, glide: 9.3, bar: 15.7, barGlide: 7.6 },
    'en-d': { trim: 12.2, glide: 9.8, bar: 17.1, barGlide: 8.0 },
    'acro': { trim: 12.0, glide: 7.7, bar: 12.7, barGlide: 7.6 },
  };
  for (const id of GLIDERS) {
    const { trim, bar } = measured[id], want = expected[id];
    near(trim.air, want.trim, 0.1, `${id} trim speed`);
    near(trim.glide, want.glide, 0.15, `${id} trim glide`);
    near(bar.air, want.bar, 0.15, `${id} bar speed`);
    near(bar.glide, want.barGlide, 0.2, `${id} bar glide`);
  }
  // Glide and speed rise through the classes; the acro wing keeps energy, not glide.
  const order = ['en-a', 'en-b', 'en-c', 'en-d'] as const;
  for (let i = 1; i < order.length; i++) {
    assert.ok(measured[order[i]].trim.glide > measured[order[i - 1]].trim.glide);
    assert.ok(measured[order[i]].bar.air > measured[order[i - 1]].bar.air);
  }
  assert.ok(measured.acro.trim.glide < measured['en-a'].trim.glide);
});

test('each glider\'s nominal flight is what the solver measures, and the classic wing\'s is FLIGHT', () => {
  for (const id of GLIDERS) {
    const { trim, bar } = measured[id], want = GLIDER_NOMINAL[id];
    near(trim.air, want.speed.trim, 0.05, `${id} nominal trim speed`);
    near(trim.sink, want.sink.trim, 0.03, `${id} nominal trim sink`);
    near(bar.air, want.speed.bar, 0.1, `${id} nominal bar speed`);
    near(bar.sink, want.sink.bar, 0.05, `${id} nominal bar sink`);
    near(holdSteady(pair(0.6), { make: make(id) }).air, want.speed.light, 0.1, `${id} nominal light-brake speed`);
    assert.equal(nominalFor(id), want);
  }
  assert.equal(nominalFor('classic').speed.trim, FLIGHT.speed.trim);
  assert.equal(nominalFor('classic').sink.trim, FLIGHT.sink.trim);
});

test('the easier the wing, the better it climbs and the sooner its swing settles', () => {
  const order = ['en-a', 'en-b', 'en-c', 'en-d', 'acro'] as const;
  for (let i = 1; i < order.length; i++) assert.ok(measured[order[i]].climb < measured[order[i - 1]].climb, `${order[i]} climbs less`);
  assert.ok(measured['en-a'].ring.settle <= 15, `the A settles in ${measured['en-a'].ring.settle} s`);
  for (const id of GLIDERS) {
    assert.ok(measured[id].ring.settle < 35, `${id} settles in ${measured[id].ring.settle} s`);
    assert.ok(measured[id].ring.surge > -9, `${id} surges ${measured[id].ring.surge}°`);
  }
  assert.ok(measured['en-a'].ring.settle < measured['en-d'].ring.settle);
});

test('the A cannot be stalled by any pull; the others stall sooner the higher their class', () => {
  const a = make('en-a');
  assert.equal(stallOnset(pair(1), { seconds: 15, make: a }), Infinity, 'a full pull held');
  assert.equal(stallOnset(pair(1, 0), { seconds: 15, make: a }), Infinity, 'one hand full');
  const fromSlow = a({ x: 0, y: 5000, z: 0 });
  for (let i = 0; i < 300; i++) stepFlight(fromSlow, pair(0.6), {}, 1 / 60);
  for (let i = 0; i < 900; i++) { stepFlight(fromSlow, pair(1), {}, 1 / 60); assert.equal(fromSlow.stall, 0); }
  const pumped = a({ x: 0, y: 5000, z: 0 });
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 120; i++) { stepFlight(pumped, pair(1), {}, 1 / 60); assert.equal(pumped.stall, 0); }
    for (let i = 0; i < 180; i++) stepFlight(pumped, pair(0), {}, 1 / 60);
  }
  const onset = (id: string) => stallOnset(pair(1), { seconds: 10, make: make(id) });
  assert.ok(onset('en-b') < 4 && onset('en-c') < onset('en-b') && onset('en-d') < onset('en-c'));
  assert.ok(onset('acro') <= onset('en-d'));
});

test('the pitch damping only ever takes energy away, in every glider', () => {
  for (const id of GLIDERS) {
    const g: FlightState = createFlight({ x: 0, y: 3000, z: 0 }, id);
    let energy = physicsEnergy(g), seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 3600; i++) {
      const hands = i % 90 === 0 ? pair(Math.round(random() * 10) / 10, Math.round(random() * 10) / 10) : null;
      stepFlight(g, hands ?? { controlMode: 'brakes', leftBrake: g.leftBrakeTarget / 0.6, rightBrake: g.rightBrakeTarget / 0.6 }, {}, 1 / 60);
      const next = physicsEnergy(g);
      assert.ok(next <= energy + 0.001, `${id} gained ${next - energy} J at step ${i}`);
      energy = next;
    }
  }
});

test('each glider handles as the hangar says, and its bars rank the classes as they fly', () => {
  for (const id of GLIDERS) {
    const flies = GLIDER_HANDLING[id], seen = measured[id];
    near(seen.climb, flies.climb, 0.05, `${id} climb`);
    near(seen.turn.rate, flies.turn, 0.5, `${id} turn on one light hand`);
    near(seen.ring.settle, flies.settle, 0.5, `${id} settle`);
    if (Number.isFinite(flies.stall)) near(seen.stall, flies.stall, 0.05, `${id} full-pull stall`);
    else assert.equal(seen.stall, Infinity, `${id} never stalls`);
    const card = gliderCard(id);
    for (const bar of [card.glide, card.climb, card.agility, card.forgiveness]) assert.ok(bar >= 0 && bar <= 1, `${id} ${bar}`);
  }
  const card = Object.fromEntries(GLIDERS.map((id) => [id, gliderCard(id)]));
  const ranks = (bar: 'glide' | 'climb' | 'agility' | 'forgiveness') => [...GLIDERS].sort((a, b) => card[b][bar] - card[a][bar]);
  assert.deepEqual(ranks('glide'), ['en-d', 'en-c', 'en-b', 'en-a', 'acro']);
  assert.deepEqual(ranks('climb'), ['en-a', 'en-b', 'en-c', 'en-d', 'acro']);
  assert.deepEqual(ranks('agility'), ['acro', 'en-d', 'en-c', 'en-b', 'en-a']);
  assert.deepEqual(ranks('forgiveness').slice(0, 3), ['en-a', 'en-b', 'en-c'], 'the D and the acro forgive least');
  // What each can be taken into: a full stall from the B up, a helicopter from the C, a SAT on the acro alone.
  assert.deepEqual(GLIDERS.map((id) => [card[id].stalls, card[id].heli, card[id].sat]),
    [[false, false, false], [true, false, false], [true, true, false], [true, true, false], [true, true, true]]);
});

test('a pilot plans each glider\'s circles as wide as its own turns are, against the classic wing\'s 25 and 21 m', () => {
  const circle = (id: string, brake: boolean) => holdSteady({ turn: 1, brake }, { make: make(id) }).radius;
  const hands = circle('classic', false), braked = circle('classic', true);
  assert.deepEqual(planFor('classic'), { trim: FLIGHT.speed.trim, circle: 25, braked: 21 });
  for (const id of GLIDERS) {
    near(planFor(id).circle, 25 * circle(id, false) / hands, 0.15, `${id} hands-up circle`);
    near(planFor(id).braked, 21 * circle(id, true) / braked, 0.15, `${id} braked circle`);
    assert.equal(planFor(id).trim, GLIDER_NOMINAL[id].speed.trim);
  }
});

test('the coach reckons with each glider\'s own speeds, sink and turn, and with the classic wing as it always has', () => {
  const turn = (id: string) => holdSteady(pair(0.5, 0), { make: make(id) }).rate;
  const classic = turn('classic');
  assert.equal(coachWingFor('classic'), null);
  for (const id of GLIDERS) {
    const wing = coachWingFor(id)!, nominal = GLIDER_NOMINAL[id];
    assert.deepEqual([wing.trimSpeed, wing.barSpeed, wing.lightSpeed, wing.trimSink], [nominal.speed.trim, nominal.speed.bar, nominal.speed.light, nominal.sink.trim]);
    near(wing.turnRate, FLIGHT.turn.trim * turn(id) / classic, 0.01, `${id} planned turn`);
  }
});


test('a glider rolls into a turn as quickly as it can: its pitch damping fades as the canopy yaws, and the A is still the slowest', () => {
  // On the thermal hands (0.2 and 0.5), the course turned in the first 10 s: about the classic wing's 127°.
  const turned = (id: string) => {
    const g = createFlight({ x: 0, y: 3000, z: 0 }, id);
    for (let i = 0; i < 300; i++) stepFlight(g, pair(0), {}, 1 / 60);
    let total = 0, last = g.track ?? g.yaw;
    for (let i = 0; i < 600; i++) {
      stepFlight(g, pair(0.2, 0.5), {}, 1 / 60);
      const now = g.track ?? g.yaw;
      total += Math.atan2(Math.sin(now - last), Math.cos(now - last));
      last = now;
    }
    return Math.abs(total) * 180 / Math.PI;
  };
  const degrees = Object.fromEntries(GLIDERS.map(id => [id, turned(id)]));
  for (const id of GLIDERS) assert.ok(degrees[id] >= 100, `${id} turns ${degrees[id].toFixed(0)}° in 10 s`);
  for (const id of GLIDERS) if (id !== 'en-a') assert.ok(degrees[id] > degrees['en-a'], `the A turns in slowest: ${JSON.stringify(degrees)}`);
});

test('only wings whose halves stall by themselves can be taken into a helicopter, and the SAT only at any speed', () => {
  assert.deepEqual(canRotate('classic'), { heli: false, sat: false });
  assert.deepEqual(canRotate('en-a'), { heli: false, sat: false });
  assert.deepEqual(canRotate('en-b'), { heli: false, sat: false });
  assert.deepEqual(canRotate('en-c'), { heli: true, sat: false });
  assert.deepEqual(canRotate('en-d'), { heli: true, sat: false });
  assert.deepEqual(canRotate('acro'), { heli: true, sat: true });
});

test('a run tells the A and the B a failure\'s fix, the others only its name, and the classic wing nothing new', () => {
  assert.deepEqual(GLIDERS.map(guidanceFor), ['fix', 'fix', 'name', 'name', 'name']);
  assert.equal(guidanceFor('classic'), null);
});
