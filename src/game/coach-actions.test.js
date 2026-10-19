import test from 'node:test';
import assert from 'node:assert/strict';
import { actionMessage } from './coach-actions.js';
import { thermalRideIdentity, createRunCoachEnvironment, runCoachHazard, runCoachWarning } from './coach-run.js';
import { BELL_RESULT } from './bells.js';
import { createCloudbaseRun } from './cloudbase-state.js';

const direct = (leftBrake, rightBrake) => ({ controlMode: 'brakes', leftBrake, rightBrake });
test('direct pulls acknowledge graded side turns and require both hands for a bilateral catch', () => {
  for (const side of ['left', 'right']) {
    const input = side === 'left' ? direct(0.30, 0) : direct(0, 0.30);
    const circle = actionMessage({ action: side, hold: [side, 'brake'], release: [side === 'left' ? 'right' : 'left', 'bar'],
      brakeDepth: 'working' }, input);
    assert.equal(circle.accepted, true);
    assert.deepEqual(circle.hold, [side]);
    assert.match(circle.title, /PULL .* BRAKE/);
    assert.equal(actionMessage({ action: 'brake', brakeDepth: 'working' }, input).accepted, false);
    assert.equal(actionMessage({ action: 'release-all' }, input).accepted, false);
  }
  assert.equal(actionMessage({ action: 'brake', brakeDepth: 'working' }, direct(2 / 3, 2 / 3)).accepted, true);
  assert.equal(actionMessage({ action: 'brake', brakeDepth: 'working' }, direct(1, 1)).accepted, false);
  assert.equal(actionMessage({ action: 'release-all' }, direct(0, 0)).accepted, true);
});
test('direct thermal cues require a blended pull and retain gentle bilateral brake while easing', () => {
  for (const side of ['left', 'right']) {
    const other = side === 'left' ? 'right' : 'left';
    const fields = { action: side, context: 'thermal', brakeDepth: 'working',
      hold: [side, 'brake'], release: [other, 'bar'] };
    const blended = side === 'left' ? direct(.50, .20) : direct(.20, .50);
    const accepted = actionMessage(fields, blended);
    assert.equal(accepted.accepted, true);
    assert.match(accepted.title, /PULL DOWN \+/);
    assert.match(accepted.detail, /keep some brake on both/);
    assert.equal(actionMessage(fields, side === 'left' ? direct(.30, 0) : direct(0, .30)).accepted, false);
    assert.equal(actionMessage(fields, side === 'left' ? direct(.20, .50) : direct(.50, .20)).accepted, false);
    const ease = { action: 'straight', context: 'thermal', brakeDepth: 'working',
      hold: ['brake'], release: ['left', 'right', 'bar'] };
    const eased = actionMessage(ease, direct(.20, .20));
    assert.equal(eased.accepted, true);
    assert.match(eased.detail, /gentle downward pull/);
    assert.equal(actionMessage(ease, direct(0, 0)).accepted, false);
    assert.equal(actionMessage(ease, direct(.6, .6)).accepted, false);
    assert.equal(actionMessage(eased, direct(.20, .20)).accepted, true, 'resolving a cue again retains its eased brake target');
  }
});
test('direct deep pulls and easing never request double taps, and keep recovery phase advice', () => {
  const deep = actionMessage({ action: 'deep-brake' }, direct(2 / 3, 2 / 3));
  assert.equal(deep.title, 'PULL BOTH BRAKES DEEP');
  assert.doesNotMatch(deep.title + deep.detail, /tap|Space| X/);
  assert.equal(deep.accepted, false);
  assert.equal(actionMessage({ action: 'deep-brake' }, direct(1, 0)).accepted, false);
  assert.equal(actionMessage({ action: 'deep-brake' }, direct(1, 1)).accepted, true);
  const ease = actionMessage({ action: 'brake', brakeDepth: 'working', state: 'recover',
    detail: 'Wait underneath the wing.' }, direct(1, 1));
  assert.equal(ease.title, 'EASE BOTH TO WORKING BRAKE');
  assert.match(ease.detail, /Wait underneath the wing/);
  const widen = { action: 'straight', hold: ['brake'], release: ['left', 'right', 'bar'] };
  assert.equal(actionMessage(widen, direct(.3, 0)).accepted, false);
  assert.equal(actionMessage(widen, direct(0, 0)).accepted, true);
});

test('reversal instructions release the opposing control before acknowledging the new one', () => {
  const request = { action: 'left', title: 'REVERSE LEFT NOW', detail: 'The swing is returning.' };
  const raw = { right: true, left: true };
  const message = actionMessage(request, raw);
  assert.equal(message.title, 'RELEASE RIGHT, THEN LEFT');
  assert.equal(message.accepted, false, 'the speed-bar chord is not a correct left turn');
  assert.deepEqual(message.hold, ['left']); assert.deepEqual(message.release, ['right']);
  assert.equal(actionMessage(request, { left: true }).title, 'HOLD LEFT');
  assert.equal(actionMessage(request, { left: true }).accepted, true);
  assert.deepEqual(raw, { right: true, left: true });
});
test('straightening and recovery distinguish letting go from a held input', () => {
  assert.equal(actionMessage({ action: 'straight' }, { right: true }).title, 'RELEASE THE TURN');
  assert.equal(actionMessage({ action: 'straight' }, {}).title, 'HOLD THIS LINE');
  assert.equal(actionMessage({ action: 'release-all' }, { brake: true }).accepted, false);
  const catchWing = actionMessage({ action: 'brake' }, { brake: true, bar: true });
  assert.deepEqual(catchWing.release, ['bar']); assert.equal(catchWing.accepted, false);
  assert.equal(actionMessage({ action: 'none', hold: ['bar'] }, { left: true, right: true }).accepted, true);
  assert.deepEqual(actionMessage({ action: 'brake' }, { left: true, right: true }).release, ['bar', 'left', 'right']);
  const circle = actionMessage({ action: 'right', hold: ['right', 'brake'], release: ['left', 'bar'] }, { left: true, right: true });
  assert.deepEqual(circle.release, ['left', 'bar']);
  assert.ok(!circle.release.includes('right'), 'ending the bar chord must not contradict the requested thermal turn');
});
test('deep shaping and working catches acknowledge the requested brake depth only', () => {
  const shape = { action: 'deep-brake', detail: 'Build the backward swing.' };
  const raw = Object.freeze({ brake: true });
  assert.equal(actionMessage(shape, {}).title, 'PULL DEEP BRAKE');
  assert.equal(actionMessage(shape, raw).title, 'RELEASE, THEN DEEP BRAKE');
  assert.equal(actionMessage(shape, raw).accepted, false);
  const deep = actionMessage(shape, { brake: true, deepBrake: true });
  assert.equal(deep.title, 'HOLD DEEP BRAKE'); assert.equal(deep.brakeDepth, 'deep'); assert.equal(deep.accepted, true);
  assert.equal(actionMessage(shape, { deepBrake: true }).accepted, true, 'the explicit deep shortcut implies braking');
  const catchWing = { action: 'brake', title: 'PRESS BRAKE', brakeDepth: 'working' };
  assert.equal(actionMessage(catchWing, { brake: true }).accepted, true);
  assert.equal(actionMessage(catchWing, { deepBrake: true }).accepted, false);
  assert.equal(actionMessage(catchWing, { deepBrake: true }).title, 'RELEASE DEEP BRAKE, THEN BRAKE');
  assert.equal(actionMessage({ action: 'release-all' }, { deepBrake: true }).accepted, false);
  const ears = actionMessage(shape, { brake: true, deepBrake: true, ears: true });
  assert.equal(ears.accepted, false); assert.equal(ears.title, 'RELEASE EARS, THEN BRAKE');
  assert.ok(ears.release.includes('ears'), 'the higher-priority descent control must be released first');
  assert.deepEqual(raw, { brake: true });
});

test('thermal titles stay stable on acceptance while conflicting controls still get an explicit remedy', () => {
  for (const direction of ['left', 'right']) {
    const opposite = direction === 'left' ? 'right' : 'left';
    const circle = { action: direction, stableTitle: true, brakeDepth: 'working',
      title: `CIRCLE ${direction.toUpperCase()} + NORMAL BRAKE`, hold: [direction, 'brake'], release: [opposite, 'bar'] };
    const accepted = actionMessage(circle, { [direction]: true, brake: true });
    assert.equal(accepted.title, circle.title); assert.equal(accepted.accepted, true);
    const ease = { ...circle, action: 'straight', title: `EASE ${direction.toUpperCase()} · KEEP BRAKE`,
      hold: ['brake'], release: ['left', 'right', 'bar'] };
    assert.equal(actionMessage(ease, { [direction]: true, brake: true }).title, ease.title);
    assert.equal(actionMessage(ease, { brake: true }).title, ease.title);
    assert.equal(actionMessage(ease, { brake: true }).accepted, true);
    assert.equal(actionMessage(circle, { [opposite]: true }).title,
      `RELEASE ${opposite.toUpperCase()}, THEN ${direction.toUpperCase()}`);
    assert.equal(actionMessage(circle, { deepBrake: true }).title, 'RELEASE DEEP BRAKE, THEN BRAKE');
  }
});
test('a drifting thermal keeps one presentation identity until its slot is reborn', () => {
  const thermal = { generation: 2, x: 18, z: 20 };
  const identity = thermalRideIdentity(1, thermal);
  for (let i = 0; i < 100; i++) {
    thermal.x += 0.35; thermal.z -= 0.2;
    assert.equal(thermalRideIdentity(1, thermal), identity);
  }
  thermal.generation++;
  assert.notEqual(thermalRideIdentity(1, thermal), identity);
  assert.notEqual(thermalRideIdentity(2, thermal), thermalRideIdentity(1, thermal));
  assert.equal(thermalRideIdentity(0, thermal), null);
});
test('the Good Lift adapter reads the live sky without advancing or changing it', () => {
  const sky = createCloudbaseRun(); sky.reset(100, 1);
  const adapter = createRunCoachEnvironment(sky), before = JSON.stringify(sky.state);
  const point = { x: 85, y: 100, z: 280 };
  assert.equal(adapter.sampleAir(point, {}).windY, sky.sample(point, 0, {}).windY);
  assert.equal(adapter.sources().length, sky.state.thermals.length);
  assert.ok(adapter.inside(point, 20)); assert.equal(adapter.inside({ x: 320, y: 100, z: 80 }, 20), false);
  adapter.cloudDepth(point); adapter.fog().speedAt(0, 0);
  assert.equal(JSON.stringify(sky.state), before);
});

test('kettlebell advice never requests the unavailable speed bar with ears deployed', () => {
  const world = { g: { ears: 0 }, controls: { ears: false }, sky: { state: { pilot: { cloud: 0, danger: 0 } } },
    bells: { state: { warning: 0, bells: [{ result: BELL_RESULT.pending, circling: true }] } } };
  assert.deepEqual(runCoachHazard(world).hold, ['bar']);
  world.controls.ears = true;
  assert.equal(runCoachHazard(world).title, 'LEAVE YOUR LINE');
  world.controls.ears = false; world.g.ears = 0.5;
  assert.equal(runCoachHazard(world).title, 'LEAVE YOUR LINE');
});

test('fog and cloud-base warnings accompany guidance, while a gust releases the brake', () => {
  const world = { g: { pos: { y: 100 }, lift: 4, vy: 3, brake: 0 }, controls: {},
    sky: { state: { fogHeight: 30, pilot: { headroom: Infinity, cloud: 0, danger: 0, gustIn: Infinity } } } };
  assert.equal(runCoachWarning(world).context, 'FOG CLOSE');
  assert.match(runCoachWarning(world).detail, /Keep climbing/);
  world.sky.state.fogHeight = 0; world.sky.state.pilot.headroom = 60;
  assert.equal(runCoachWarning(world).context, 'CLOUD ABOVE');
  world.sky.state.pilot.headroom = Infinity;
  assert.equal(runCoachWarning(world), null);
  world.sky.state.pilot.gustIn = 10; world.g.brake = 0.8;
  assert.equal(runCoachHazard(world).action, 'release-brake');
});
