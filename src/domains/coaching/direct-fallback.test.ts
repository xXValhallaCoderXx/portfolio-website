import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlightInput } from '../flight/models.ts';
import type { CoachingAdapter } from './models.ts';
import { createFlight } from '../flight/flight.ts';
import { centeringControls } from '../flight/thermal-centering.ts';
import { frameInput, inputFrame } from '../good-lift/recorder.ts';
import { actionMessage } from './coach-actions.ts';
import { createLiftGuide } from './lift-guide.ts';
import { CLASSIC_COACH_WING } from './coach-wing.ts';

const environment = (side: number): CoachingAdapter => ({
  navigation: true, heightAt: () => 0, sources: () => [], inside: () => true,
  recoveryPoint: () => ({ x: side * 100, z: -100 }),
  sampleAir: (_pos, out) => Object.assign(out, { windX: 0, windZ: 0, windY: 0, thermal: 0, ridge: 0, lee: 0 }),
});

for (const side of [-1, 0, 1]) {
  test(`direct no-route recovery ${side} asks for the ordinary pair its safety forecast flies`, () => {
    const g = createFlight({ x: 0, y: 1000, z: 0 }), before = structuredClone(g);
    const adapter = environment(side), guide = createLiftGuide(adapter);
    const input: FlightInput = { controlMode: 'brakes', leftBrake: 0, rightBrake: 0 };
    guide.step(1 / 60, { g, input, clock: 0, air: adapter.sampleAir(g.pos, {})! });
    const message = guide.route!;
    assert.equal(message.context, 'search'); assert.equal(message.phase, 'blocked');
    assert.equal(message.action, side < 0 ? 'left' : side > 0 ? 'right' : 'straight');
    const predicted = centeringControls(input, side, false);
    assert.deepEqual(message.brakeTargets, { left: predicted.leftBrake, right: predicted.rightBrake, tolerance: 0.07 });
    assert.equal(actionMessage(message, frameInput(inputFrame(predicted))).accepted, true,
      'the same byte-quantized pair is accepted by the visible instruction');
    assert.deepEqual(message.hold, side ? [side < 0 ? 'left' : 'right'] : []);
    assert.deepEqual(g, before, 'forecasting and presenting the fallback cannot move the actual wing');
  });
}

test('legacy no-route recovery retains normal-brake requests', () => {
  const g = createFlight({ x: 0, y: 1000, z: 0 }), adapter = environment(0), guide = createLiftGuide(adapter);
  guide.step(1 / 60, { g, input: {}, clock: 0, air: adapter.sampleAir(g.pos, {})! });
  assert.equal(guide.route!.brakeTargets, undefined);
  assert.equal(guide.route!.action, 'straight');
  assert.deepEqual(guide.route!.hold, ['brake']);
});

test('a glider with no safe plan home still turns for the middle, firmly; the classic wing is left as it was', () => {
  // An arena so tight that every forecast leaves it: no route to lift, and no escape plan that stays clear.
  const boxed = (side: number, glider: boolean): CoachingAdapter => ({ ...environment(side), inside: () => false,
    ...(glider ? { wing: () => CLASSIC_COACH_WING } : {}) });
  const input: FlightInput = { controlMode: 'brakes', leftBrake: 0, rightBrake: 0 };
  for (const side of [-1, 0, 1]) {
    const g = createFlight({ x: 0, y: 1000, z: 0 }), adapter = boxed(side, true), guide = createLiftGuide(adapter);
    guide.step(1 / 60, { g, input, clock: 0, air: adapter.sampleAir(g.pos, {})! });
    const message = guide.route!;
    assert.equal(message.phase, 'blocked');
    assert.equal(message.action, side < 0 ? 'left' : side > 0 ? 'right' : 'straight', `toward the middle, ${side}`);
    const firm = centeringControls(input, side, true);
    assert.deepEqual(message.brakeTargets, { left: firm.leftBrake, right: firm.rightBrake, tolerance: 0.07 });
    assert.match(message.detail!, /back toward the middle/);
  }
  const g = createFlight({ x: 0, y: 1000, z: 0 }), adapter = boxed(1, false), guide = createLiftGuide(adapter);
  guide.step(1 / 60, { g, input, clock: 0, air: adapter.sampleAir(g.pos, {})! });
  assert.equal(guide.route!.action, 'release-all', 'the classic wing still levels with hands up');
  assert.equal(guide.route!.brakeTargets, undefined);
});
