import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlightInput } from '../flight/models.ts';
import type { RunWorld } from './models.ts';
import { induceFailure } from '../flight/flight.ts';
import { createRecoveryGuide } from '../coaching/recovery-guide.ts';
import { createCloudbaseRun, CLOUD_STRIKE } from './cloudbase-state.ts';
import { RUN, createRunWorld, startRun, stepRun } from './run-step.ts';
import { BREAK } from './trick-tables.ts';
import { STRIKER, STRIKE_FOLD } from './strike-fold.ts';
import { GLIDERS, planFor } from './gliders.ts';
import { TST, createReferencePilot } from './pilots.ts';

// Strikes flown on the gliders: the half a strike comes from folds, as far as its striker folds it,
// and the pilot keeps the controls to fly it out (wing-folds.js, strike-fold.js). The classic wing,
// which no run flies but whose halves never fold, keeps the scripted fold. Flown well clear of the
// ground, with no ravens or kettlebells of the sky's own.
const UP: FlightInput = { controlMode: 'brakes', leftBrake: 0, rightBrake: 0 };

function aloft(wing: string) {
  const world = startRun(createRunWorld({ sky: createCloudbaseRun({ hazards: false }), wing }), 7);
  world.g.pilot.pos.y += 1400; world.g.canopy.pos.y += 1400;
  for (let i = 0; i < 2 / RUN.step; i++) stepRun(world, UP);
  return world;
}

// A strike from `side` of the pilot (−1 left, 1 right) by `kind`, called between steps.
function strikeFrom(world: RunWorld, side: number, kind: number) {
  const { g } = world, q = g.canopy.q;
  const rightX = 1 - 2 * (q.y * q.y + q.z * q.z), rightZ = 2 * (q.x * q.z - q.w * q.y);
  return world.sky.strike(-1, { x: g.pos.x + side * 3 * rightX, z: g.pos.z + side * 3 * rightZ }, kind);
}

test('a strike folds the half it came from, as far as its striker folds it, and leaves the pilot the controls', () => {
  for (const wing of GLIDERS) for (const side of [-1, 1]) for (const kind of [STRIKER.raven, STRIKER.bell, STRIKER.beast]) {
    const world = aloft(wing), { g, sky } = world;
    const strikes = sky.state.pilot.strikes;
    assert.ok(strikeFrom(world, side, kind));
    stepRun(world, UP);
    const folded = side < 0 ? g.foldLeft : g.foldRight, open = side < 0 ? g.foldRight : g.foldLeft;
    assert.ok(Math.abs(folded - STRIKE_FOLD[kind]) < 0.05, `${wing} ${side} ${kind}: folded ${folded}`);
    assert.equal(open, 0, 'the other half flies on');
    assert.equal(sky.state.pilot.collapse, 0, 'no scripted fold');
    assert.equal(sky.state.pilot.shield, CLOUD_STRIKE.shield - RUN.step, 'shielded as ever');
    assert.equal(sky.state.pilot.strikes, strikes + 1);
    assert.equal(world.controls.locked, false); assert.equal(world.controls.controlMode, 'brakes', 'the hands are the pilot\'s');
    assert.equal(world.air.hazardSink, 0, 'the fold sinks the wing, not the sky');
  }
});

test('a wing whose halves never fold, the classic wing, keeps the scripted fold', () => {
  const world = aloft('classic');
  assert.ok(strikeFrom(world, 1, STRIKER.raven));
  stepRun(world, UP);
  assert.ok(world.sky.state.pilot.collapse > 0);
  assert.equal(world.controls.locked, true);
  assert.equal(world.g.foldLeft + world.g.foldRight, 0);
});

test('a strike bails the chain once and lights only its own light, however the fold is flown; a fold the pilot brings on lights control', () => {
  for (const wing of GLIDERS) {
    // Struck and flown out by the guide, or left alone for twenty seconds: one break, the strike's, and no control light.
    for (const flown of [true, false]) {
      const world = aloft(wing), guide = createRecoveryGuide();
      strikeFrom(world, -1, STRIKER.beast);
      const breaks = world.tricks.state.breaks;
      for (let i = 0; i < 20 / RUN.step; i++) {
        const advice = guide.step(world.g);
        stepRun(world, flown ? { controlMode: 'brakes', leftBrake: advice.left, rightBrake: advice.right, bar: advice.bar } : UP);
      }
      assert.equal(world.tricks.state.breaks, breaks + 1, `${wing} ${flown ? 'flown' : 'left'}`);
      assert.equal(world.tricks.state.broke, BREAK.strike);
      assert.equal(world.stalls, 0, `${wing}: no control light for a strike`);
    }
    // A half folded with no strike (one side of an uncaught surge, here started by hand) is the pilot's own doing.
    const world = aloft(wing);
    induceFailure(world.g, 'asym', 1, 0.5);
    stepRun(world, UP);
    assert.equal(world.tricks.state.broke, BREAK.fold, wing);
    assert.equal(world.stalls, 1, `${wing}: the control light`);
  }
});

test('flown with the fix, a struck glider is saved within seconds and loses less height than one left alone', () => {
  for (const wing of GLIDERS) for (const kind of [STRIKER.bell, STRIKER.beast]) {
    const height = (flown: boolean) => {
      const world = aloft(wing), guide = createRecoveryGuide(), start = world.g.pos.y;
      strikeFrom(world, 1, kind);
      const lagged: FlightInput[] = [];
      for (let i = 0; i < 15 / RUN.step; i++) {
        const advice = guide.step(world.g);
        lagged.push({ controlMode: 'brakes', leftBrake: advice.left, rightBrake: advice.right, bar: advice.bar });
        stepRun(world, flown ? lagged[Math.max(0, lagged.length - 10)] : UP);
      }
      return { lost: start - world.g.pos.y, saves: guide.advice.saves, seconds: guide.advice.saved.seconds };
    };
    const flown = height(true), left = height(false);
    assert.equal(flown.saves, 1, `${wing} ${kind}: saved`);
    assert.ok(flown.seconds < 6, `${wing} ${kind}: in ${flown.seconds} s`);
    // The A and the B refill by themselves before the fix can do much; the others want it.
    const slack = wing === 'en-a' || wing === 'en-b' ? 3 : 0;
    assert.ok(flown.lost < left.lost + slack, `${wing} ${kind}: ${flown.lost} m flown against ${left.lost} m left alone`);
  }
});

test('a medal bot flies a struck glider out of its fold by itself, a pilot\'s reaction late, and takes its own hands back after', () => {
  for (const wing of GLIDERS) for (const kind of [STRIKER.raven, STRIKER.beast]) {
    const world = aloft(wing), pilot = createReferencePilot({ ...TST, plan: planFor(wing) });
    const intent: FlightInput = { turn: 0, brake: false, bar: false };
    for (let i = 0; i < 2 / RUN.step; i++) stepRun(world, pilot.decide(world, intent));
    strikeFrom(world, kind === STRIKER.beast ? -1 : 1, kind);
    // The Beast's fold on a D in rough air can surge it hard and swing it a long while before it is saved.
    let direct = 0, handedBack = false;
    for (let i = 0; i < 16 / RUN.step; i++) {
      stepRun(world, pilot.decide(world, intent));
      if (intent.controlMode === 'brakes') direct += 1;
      else if (direct > 0) handedBack = true;
    }
    const { g } = world;
    assert.ok(direct > 0, `${wing} ${kind}: it flew the fix`);
    assert.equal(g.foldLeft + g.foldRight + g.cravatLeft + g.cravatRight, 0, `${wing} ${kind}: open again`);
    assert.ok(handedBack, `${wing} ${kind}: and flew on with its own hands once saved`);
  }
});
