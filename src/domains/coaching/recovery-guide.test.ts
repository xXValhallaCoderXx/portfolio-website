import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlightState } from '../flight/models.ts';
import { createFlight, induceFailure, stepFlight } from '../flight/flight.ts';
import { keyboardBrakes } from '../flight/brake-input.ts';
import { GLIDERS } from '../good-lift/gliders.ts';
import { classify, createRecoveryGuide, RECOVERY } from './recovery-guide.ts';
import { LAB_STEP, pair } from '../../test/helpers/flight-lab.ts';
import { flyFailure, guided } from '../../test/helpers/test-failures.ts';

const fresh = () => createFlight({ x: 0, y: 3000, z: 0 }, 'en-c');

test('the guide names the worst failure first, and a full stall or a rotation flown on purpose is none', () => {
  const g = fresh();
  assert.equal(classify(g), '');
  g.foldRight = 0.3; assert.equal(classify(g), 'asym');
  g.foldRight = RECOVERY.folded; assert.equal(classify(g), '', 'a fold too small to answer');
  g.foldRight = 0.3; g.tuck = 0.4; assert.equal(classify(g), 'frontal');
  g.stall = 0.6; assert.equal(classify(g), 'stall');
  assert.equal(classify(g, false, { spin: 0, stalling: true }), 'frontal', 'a full stall asked for is a trick');
  g.stall = 0; g.physical.sepL = 1; g.canopy.omega.y = 2; assert.equal(classify(g), 'spin');
  assert.equal(classify(g, false, { spin: 0, stalling: false }), 'frontal', 'a helicopter or a SAT is flown on purpose until a trick watch calls it a spin');
  assert.equal(classify(g, true, { spin: 0, stalling: false }), 'spin', 'in trouble already, a half that goes is a spin');
  assert.equal(classify(g, false, { spin: 1, stalling: false }), 'spin');
  g.cravatLeft = 1; assert.equal(classify(g), 'cravat');
  g.deepStall = 1; assert.equal(classify(g), 'deep');
  g.twisted = 0.5; assert.equal(classify(g), 'twist');
});

// Every pair of hands a keyboard gives, and the bar.
const KEYS = ['KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyS', 'ShiftLeft'];
const CHORDS = new Set(Array.from({ length: 1 << KEYS.length }, (_, bits) => {
  const brakes = keyboardBrakes(new Set(KEYS.filter((_, i) => bits & (1 << i))));
  return `${brakes.leftBrake},${brakes.rightBrake}`;
}));

test('every pair of hands the guide asks for is a key chord, so a keyboard can fly every recovery', () => {
  const asked = new Set<string>();
  let bar = false;
  for (const wing of GLIDERS) for (const [kind, size] of [['asym', 0.5], ['asym', 0.85], ['frontal', undefined], ['spin', undefined],
    ['deep', undefined], ['cravat', undefined], ['twist', undefined]] as const)
    for (const side of [-1, 1]) {
      const guide = createRecoveryGuide(), g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
      if (!induceFailure(g, kind, side, size)) continue;
      for (let i = 0; i < 12 * 60; i++) {
        const advice = guide.step(g);
        asked.add(`${advice.left},${advice.right}`);
        // The bar is only ever asked for with both hands up, the only way it acts.
        if (advice.bar) { bar = true; assert.equal(advice.left + advice.right, 0); }
        stepFlight(g, { ...pair(advice.left, advice.right), bar: advice.bar }, {}, LAB_STEP);
      }
    }
  for (const hands of asked) assert.ok(CHORDS.has(hands), `${hands} is no key chord`);
  for (const hands of ['0,0', '0.3,0', '0,0.3', '0.82,0', '0,0.82', '0.6,0.6']) assert.ok(asked.has(hands), `it asks for ${hands}`);
  assert.ok(bar, 'and the speed bar');
});

test('two guides that see the same flight say the same, step for step', () => {
  const g = createFlight({ x: 0, y: 3000, z: 0 }, 'en-d'), one = createRecoveryGuide(), two = createRecoveryGuide();
  induceFailure(g, 'asym', -1, 0.7);
  for (let i = 0; i < 10 * 60; i++) {
    const a = structuredClone(one.step(g)), b = two.step(g);
    assert.deepEqual(a, b);
    stepFlight(g, pair(a.left, a.right), {}, LAB_STEP);
  }
});

test('an episode is saved once the wing flies level and straight again, with what began it, its seconds and the metres it cost', () => {
  for (const wing of ['en-a', 'en-d']) for (const side of [-1, 1]) {
    const guide = createRecoveryGuide(), g = createFlight({ x: 0, y: 3000, z: 0 }, wing);
    let said: FlightState['pos'] | null = null;
    induceFailure(g, 'asym', side, 0.6);
    const start = g.pos.y;
    for (let i = 0; i < 12 * 60 && !said; i++) {
      const advice = guide.step(g);
      if (advice.saves) said = { ...g.pos };
      stepFlight(g, pair(advice.left, advice.right), {}, LAB_STEP);
    }
    const { saved, episode, first, escalations } = guide.advice;
    assert.ok(said, `${wing} ${side} saved`);
    assert.equal(episode, 1); assert.equal(first, 'asym'); assert.equal(escalations, 0);
    assert.deepEqual([saved.event, saved.side], ['asym', side]);
    assert.ok(saved.seconds > 0.3 && saved.seconds < 4, `${wing}: ${saved.seconds} s`);
    assert.ok(saved.lost >= 0 && saved.lost <= start - said!.y + 0.5, `${wing}: ${saved.lost} m`);
    assert.equal(guide.trouble, false);
    guide.reset();
    assert.deepEqual([guide.advice.episode, guide.advice.saves, guide.advice.event], [0, 0, '']);
  }
});

test('a guide followed late still flies out of a spin', () => {
  for (const wing of ['en-c', 'en-d', 'acro']) for (const side of [-1, 1]) {
    const flight = flyFailure(wing, 'spin', { side, hands: guided(0.3) });
    assert.ok(flight.seconds < 4, `${wing} ${side}: ${flight.seconds} s`);
    assert.deepEqual(flight.seen, ['spin']);
  }
});
