import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { brakeDragPoint, brakeRegionPoints, coachDragTarget, createTravelCue, cueBrake, dragCuePoint, dragTravel, flightControlLayout, groundTurn, recoveryTarget } from './flight-cues.ts';
import { createFlightView } from './flight-view.ts';
import { createFlight, stepFlight } from '../../../domains/flight/flight.ts';
import { createBrakeDrag, dragBrakes } from '../../../domains/flight/brake-drag.ts';
import { actionMessage } from '../../../domains/coaching/coach-actions.ts';
import { createRecorder, frameInput, inputFrame } from '../../../domains/good-lift/recorder.ts';
import { createFlightCoach } from '../../../domains/coaching/flight-coach.ts';
import { createSwingWatch } from '../../../domains/coaching/swing-watch.ts';

const close = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const velocity = (heading: number, speed = 10) => ({ x: Math.sin(heading) * speed, y: -1, z: -Math.cos(heading) * speed });
const pose = (from = 0, to = from) => ({ pilot: { pos: { x: 0, y: 100, z: 0 }, vel: velocity(to) },
  motion: { from: velocity(from), to: velocity(to), seconds: 1 / 60, discontinuity: false } });
const facts = () => ({ blocked: false, noseYaw: 0, forwardAirspeed: 10, stall: 0, collapse: 0, inverted: false, recovering: false, wingPhase: 'flying' });
const camera = () => { const cam = new PerspectiveCamera(60, 1.6, 0.5, 1000); cam.position.set(0, 125, 40); cam.lookAt(0, 100, -12); return cam; };
const direct = (leftBrake = 0, rightBrake = 0) => ({ controlMode: 'brakes' as const, leftBrake, rightBrake, bar: false, ears: false });
const circle = (side: 'left' | 'right') => actionMessage({ state: 'lift', context: 'thermal', phase: 'circle', action: side, brakeDepth: 'working',
  hold: [side, 'brake'], release: [side === 'left' ? 'right' : 'left', 'bar'] }, direct());
const easing = () => actionMessage({ state: 'lift', context: 'thermal', phase: 'ease', action: 'straight', brakeDepth: 'working',
  hold: ['brake'], release: ['left', 'right', 'bar'] }, direct());

test('travel projects twelve metres along ground velocity, independently of wind-relative heading', () => {
  const g = createFlight({ x: 0, y: 100, z: 0 });
  Object.assign(g.pilot.vel, { x: 6, y: 3, z: -8 });
  g.track = -0.4; g.windX = 12; g.windZ = -2;
  const view = createFlightView(g), drawn = view.sample(1), cue = createTravelCue();
  const at = cue.sample(drawn, facts(), camera(), 1280, 800, 1 / 60);
  assert.ok(at);
  close(at.world.x, 7.2); close(at.world.z, -9.6); close(at.world.y, 100);
  close(at.heading, Math.atan2(6, 8));
  assert.notEqual(at.heading, drawn.yaw);
});

test('turn indication uses consecutive velocity endpoints, both signs and compass wrap', () => {
  close(groundTurn(pose(0, 0.01).motion), 0.6);
  close(groundTurn(pose(0, -0.01).motion), -0.6);
  close(groundTurn(pose(Math.PI - 0.005, -Math.PI + 0.005).motion), 0.6);
  close(groundTurn(pose(-Math.PI + 0.005, Math.PI - 0.005).motion), -0.6);
  assert.equal(groundTurn({ ...pose().motion, from: velocity(0, 1) }), 0);
  assert.equal(groundTurn({ ...pose(0, 0.5).motion, discontinuity: true }), 0);
});

test('travel eases for 0.12 seconds, takes the short arc, and reduced motion is immediate', () => {
  const cue = createTravelCue(), cam = camera();
  cue.sample(pose(), facts(), cam, 1280, 800, 0.12);
  const eased = cue.sample(pose(0.3), facts(), cam, 1280, 800, 0.12);
  assert.ok(eased);
  close(eased.heading, 0.3 * (1 - Math.exp(-1)));
  close(cue.sample(pose(-0.3), facts(), cam, 1280, 800, 0.001, true)!.heading, -0.3);
  cue.reset();
  const south = { ...facts(), noseYaw: Math.PI };
  cue.sample(pose(Math.PI - 0.01), south, cam, 1280, 800, 0.12);
  const wrapped = cue.sample(pose(-Math.PI + 0.01), south, cam, 1280, 800, 0.12);
  assert.ok(wrapped);
  assert.ok(Math.abs(Math.atan2(Math.sin(wrapped.heading - Math.PI), Math.cos(wrapped.heading - Math.PI))) < 0.01);
});

test('slow/reverse movement, pauses, stalls, collapse, inversion and recovery suppress and reset travel', () => {
  const cam = camera(), cue = createTravelCue();
  const suppressions = [{ blocked: true }, { forwardAirspeed: -1 }, { stall: 0.01 }, { collapse: 0.01 },
    { inverted: true }, { recovering: true }, ...['stall-entry', 'full-stall', 'backfly', 'exit-surge', 'frontal', 'frontal-reopening'].map(wingPhase => ({ wingPhase }))];
  for (const blocked of suppressions) {
    assert.ok(cue.sample(pose(), facts(), cam, 1280, 800, 0.12));
    assert.equal(cue.sample(pose(), { ...facts(), ...blocked }, cam, 1280, 800, 0.12), null);
    close(cue.sample(pose(0.3), facts(), cam, 1280, 800, 0.001)!.heading, 0.3, 1e-8);
  }
  const slow = pose(); slow.pilot.vel = velocity(0, 1.99);
  assert.equal(cue.sample(slow, facts(), cam, 1280, 800, 0.12), null);
  assert.equal(cue.sample(pose(Math.PI), facts(), cam, 1280, 800, 0.12), null, 'backward ground travel is hidden even with positive airspeed');
});

test('projection rejects points behind the camera, outside the viewport and beyond the far plane', () => {
  const cue = createTravelCue(), cam = camera(), sample = pose();
  cam.lookAt(0, 125, 100);
  assert.equal(cue.sample(sample, facts(), cam, 1280, 800, 0.12), null);
  cam.lookAt(0, 100, -12);
  sample.pilot.pos.x = 1000;
  assert.equal(cue.sample(sample, facts(), cam, 1280, 800, 0.12), null);
  sample.pilot.pos.x = 0; sample.pilot.pos.z = -2000;
  assert.equal(cue.sample(sample, facts(), cam, 1280, 800, 0.12), null);
});

test('velocity interpolation preserves consumers, reuses storage and snaps turn history on a teleport', () => {
  const g = createFlight({ x: 0, y: 100, z: 0 }), view = createFlightView(g);
  Object.assign(g.pilot.vel, velocity(0)); view.capture();
  Object.assign(g.pilot.vel, velocity(0.01));
  const at = view.sample(0.5), stored = at.motion;
  close(at.pilot.vel.x, (velocity(0).x + velocity(0.01).x) / 2);
  close(groundTurn(at.motion), 0.6);
  for (let i = 0; i < 100; i++) assert.equal(view.sample(i / 100).motion, stored);
  g.pos.x += 100;
  const reset = view.sample(0.5);
  assert.equal(reset.pilot.pos.x, g.pos.x); assert.equal(groundTurn(reset.motion), 0);
  assert.equal(reset.motion.discontinuity, true);
});

test('all quantized brake pairs round trip through the actual mouse, touch and pen drag mapping', () => {
  for (const type of ['mouse', 'touch', 'pen']) for (const left of [0, 0.2, 0.5, 2 / 3, 1]) for (const right of [0, 0.2, 0.5, 2 / 3, 1]) {
    const expected = frameInput(inputFrame(direct(left, right)));
    const point = brakeDragPoint(expected.leftBrake, expected.rightBrake, type);
    const actual = frameInput(inputFrame({ ...direct(), ...dragBrakes(point.dx, point.dy, type) }));
    assert.deepEqual(actual, expected, `${type} ${left}/${right}`);
    assert.equal(cueBrake(left), expected.leftBrake);
  }
});

test('thermal targets mirror 0.50/0.20 and easing targets 0.20/0.20, accepted by the existing coach', () => {
  for (const type of ['mouse', 'touch']) for (const side of ['left', 'right'] as const) {
    const message = circle(side), target = coachDragTarget(message, type, direct());
  assert.ok(target);
    assert.equal(target.leftBrake, cueBrake(side === 'left' ? 0.50 : 0.20));
    assert.equal(target.rightBrake, cueBrake(side === 'right' ? 0.50 : 0.20));
    assert.equal(actionMessage(message, { ...direct(), ...dragBrakes(target.dx, target.dy, type) }).accepted, true);
    assert.equal(Math.sign(target.dx), side === 'left' ? -1 : 1);
    const eased = coachDragTarget(easing(), type, direct());
  assert.ok(eased);
    assert.equal(eased.leftBrake, 0.2); assert.equal(eased.rightBrake, 0.2); assert.equal(eased.dx, 0);
    assert.equal(actionMessage(easing(), { ...direct(), ...dragBrakes(eased.dx, eased.dy, type) }).accepted, true);
  }
});

test('ordinary side, bilateral working/deep and release suggestions obey coach acceptance', () => {
  for (const side of ['left', 'right'] as const) {
    const message = actionMessage({ action: side }, direct()), target = coachDragTarget(message);
  assert.ok(target);
    assert.equal(target.dy, 0); assert.equal(target[`${side}Brake`], cueBrake(0.3));
    assert.equal(actionMessage(message, { ...direct(), ...target }).accepted, true);
  }
  for (const [action, amount] of [['brake', 2 / 3], ['deep-brake', 1]] as [string, number][]) {
    const target = coachDragTarget(actionMessage({ action }, direct()));
  assert.ok(target);
    assert.equal(target.leftBrake, amount); assert.equal(target.rightBrake, amount);
  }
  for (const type of ['mouse', 'touch']) for (const action of ['release-all', 'release-brake', 'release-turns']) {
    const message = actionMessage({ action }, direct(1, 1)), target = coachDragTarget(message, type, direct(1, 1));
  assert.ok(target);
    assert.ok(target.handsUp); assert.equal(target.dx, 0); assert.ok(target.dy < 0, 'hands up has a reachable target above the origin');
    const released = dragBrakes(target.dx, target.dy, type);
    assert.deepEqual(released, { leftBrake: 0, rightBrake: 0 });
    assert.equal(actionMessage(message, { ...direct(), ...released }).accepted, true);
    assert.equal(coachDragTarget(message, type, direct())!.accepted, true, 'any accepted neutral position satisfies hands up');
  }
});

test('maneuver markers use the resolved physical pair instead of an inferred ordinary turn', () => {
  for (const [left, right] of [[0.82, 0], [0, 0.82], [1, 0], [0, 1], [0.60, 0.60], [0, 0]]) {
    const message = actionMessage({ action: left || right ? left === right ? 'brake' : left ? 'left' : 'right' : 'release-all',
      context: 'acro', brakeTargets: { left, right, tolerance: 0.07 } }, direct());
    const marker = coachDragTarget(message, 'touch');
    assert.ok(marker);
    assert.equal(marker.leftBrake, cueBrake(left)); assert.equal(marker.rightBrake, cueBrake(right));
    assert.equal(actionMessage(message, { ...direct(), ...marker }).accepted, true);
  }
});

test('the upper kite zone is hands up throughout; brake bands follow the existing demand mapping', () => {
  for (const type of ['mouse', 'touch', 'pen']) for (const depth of [0, .2, .7, 1]) {
    const points = brakeRegionPoints(depth, type);
    assert.ok(points[0].y < 0, 'the pad has visible upward travel');
    for (const point of points.slice(1)) {
      const pair = dragBrakes(point.x, point.y, type);
      close(Math.max(pair.leftBrake, pair.rightBrake), depth);
    }
    for (let i = 0; i < points.length; i++) for (const amount of [0, .25, .5, .75, 1]) {
      const a = points[i], b = points[(i + 1) % points.length];
      const pair = dragBrakes(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount, type);
      assert.ok(Math.max(pair.leftBrake, pair.rightBrake) <= depth + 1e-9);
    }
  }
});

test('the live dot can move upward and remains truthful when long gestures reach the kite boundary', () => {
  for (const type of ['mouse', 'touch', 'pen']) for (const dx of [-600, -120, -30, 0, 30, 120, 600]) for (const dy of [-600, -590, -100, -10, 0, 60, 120, 600]) {
    const T = type === 'mouse' ? 120 : 80, point = dragCuePoint(dx, dy, type);
    const actual = dragBrakes(dx, dy, type), shown = dragBrakes(point.dx, point.dy, type);
    close(shown.leftBrake, actual.leftBrake); close(shown.rightBrake, actual.rightBrake);
    assert.ok(Math.abs(point.dx) / T + Math.abs(point.dy) / (point.dy < 0 ? T * .6 : T) <= 1 + 1e-9);
  }
  assert.ok(dragCuePoint(0, -60, 'touch').dy < -12, 'the old upward visual clamp is gone');
});

test('one fixed display size represents equivalent mouse, touch and pen gestures and coach targets', () => {
  const displayTravel = 80;
  for (const type of ['mouse', 'touch', 'pen']) {
    const scale = displayTravel / dragTravel(type);
    for (const dx of [-600, -120, -30, 0, 30, 120, 600]) for (const dy of [-600, -100, -10, 0, 60, 120, 600]) {
      const physical = dragCuePoint(dx / scale, dy / scale, type);
      const shown = dragCuePoint(dx, dy, 'touch');
      close(physical.dx * scale, shown.dx); close(physical.dy * scale, shown.dy);
      const expected = dragBrakes(dx / scale, dy / scale, type);
      const actual = dragBrakes(physical.dx * scale, physical.dy * scale, 'touch');
      close(actual.leftBrake, expected.leftBrake); close(actual.rightBrake, expected.rightBrake);
    }
    const messages = [circle('left'), circle('right'), easing(),
      ...['left', 'right', 'brake', 'deep-brake', 'release-all'].map(action => actionMessage({ action }, direct()))];
    for (const message of messages) {
      const physical = coachDragTarget(message, type), shown = coachDragTarget(message, 'touch');
      assert.ok(physical && shown);
      close(physical.dx * scale, shown.dx); close(physical.dy * scale, shown.dy);
      assert.equal(actionMessage(message, { ...direct(), ...dragBrakes(shown.dx, shown.dy, 'touch') }).accepted, true);
    }
  }
});

test('targets fade for a range of accepted pulls without requiring the exact suggested point', () => {
  const message = circle('left');
  assert.equal(coachDragTarget(message, 'mouse', direct(0.40, 0.15))!.accepted, true);
  assert.equal(coachDragTarget(message, 'mouse', direct(0.60, 0.25))!.accepted, true);
  assert.equal(coachDragTarget(message, 'mouse', direct(0.20, 0.50))!.accepted, false);
  assert.equal(coachDragTarget(easing(), 'touch', direct(0.15, 0.16))!.accepted, true);
});

test('ambiguous, preparation, urgent, recovery, Bar/Ears and unaccepted suggestions have no target', () => {
  const base = circle('left');
  for (const change of [{ warning: true }, { urgent: true }, { transfer: { ready: true, targetId: null, generation: null, requiredHeight: null, missingHeight: null, seconds: null } }, { heading: 'NEXT LIFT' }, { controlMode: 'legacy' as const },
    ...['recover', 'hazard', 'descent', 'lee'].map(state => ({ state })),
    ...['approach', 'align', 'prepare', 'blocked', 'warning', 'recovery'].map(phase => ({ phase })),
    ...['none', 'prepare-left', 'prepare-right', 'bar', 'ears'].map(action => ({ action })),
    { hold: ['left', 'bar'] }, { hold: ['left', 'ears'] }, { release: ['left'] }]) {
    assert.equal(coachDragTarget({ ...base, ...change }), null, JSON.stringify(change));
  }
  assert.equal(coachDragTarget(base, 'touch', { ...direct(), ears: true }), null);
  assert.equal(coachDragTarget(base, 'touch', { ...direct(), bar: true }), null);
  assert.equal(coachDragTarget(null), null);
  assert.ok(coachDragTarget(base), 'an instruction can return immediately after its suppression clears');
});

test('desktop controls stay low and centred, with a corner fallback for short landscape views', () => {
  for (const [width, height] of [[1280, 800], [390, 844], [320, 740], [844, 390], [1100, 760], [752, 892], [600, 800]]) {
    const safe = Object.freeze({ left: 12, right: width - 12, top: 12, bottom: height - 12 });
    const out = {}, layout = flightControlLayout(safe, out);
    assert.equal(layout, out, 'rendering can reuse one bounded layout object');
    assert.equal(layout.travel, height <= 500 ? 60 : 80, 'only short landscape compacts the graphic');
    assert.ok(layout.left >= safe.left && layout.right <= safe.right && layout.top >= safe.top && layout.bottom <= safe.bottom);
    const centre = (safe.left + safe.right) / 2;
    if (safe.right - safe.left > 560) {
      close(layout.bottom, safe.bottom, 1e-9);
      if (height <= 500) {
        close(layout.right, safe.right);
        assert.ok(layout.left > centre + (safe.right - safe.left) * .10, 'short views keep the diagram beside the pilot');
      } else close(layout.x, centre);
    } else close(layout.x, centre);
    assert.ok(layout.y > safe.top + (safe.bottom - safe.top) * .70, 'the anchor stays in the lower screen');
    assert.deepEqual(flightControlLayout({ ...safe }), layout, 'only the safe viewport determines the position');
  }
});

test('the fixed flight control scales uniformly in unusually small safe rectangles', () => {
  for (const [width, height] of [[150, 160], [240, 124], [60, 80], [44, 52]]) {
    const safe = { left: 20, right: 20 + width, top: 30, bottom: 30 + height };
    const layout = flightControlLayout(safe);
    assert.ok(layout.travel >= 0 && layout.travel < 80);
    assert.ok(layout.left >= safe.left - 1e-9 && layout.right <= safe.right + 1e-9 && layout.top >= safe.top - 1e-9 && layout.bottom <= safe.bottom + 1e-9);
    close(layout.right - layout.left, layout.travel * 2 + 44);
    close(layout.bottom - layout.top, layout.travel * 1.6 + 52);
    for (const value of Object.values(layout)) assert.ok(Number.isFinite(value));
  }
});

test('dragging from different screen positions uses the same relative dot inside the fixed control', () => {
  const safe = { left: 12, right: 308, top: 12, bottom: 728 }, layout = flightControlLayout(safe);
  const expected = dragCuePoint(-30, 45, 'touch');
  for (const pointerType of ['mouse', 'touch', 'pen']) for (const [x, y] of [[0, 0], [160, 360], [320, 740], [300, 30]]) {
    const adapter = createBrakeDrag(), physicalScale = dragTravel(pointerType) / layout.travel;
    adapter.start({ button: 0, pointerId: 1, pointerType, clientX: x, clientY: y });
    adapter.move({ pointerId: 1, clientX: x - 30 * physicalScale, clientY: y + 45 * physicalScale });
    const shown = dragCuePoint(adapter.state.dx, adapter.state.dy, pointerType);
    const scale = layout.travel / dragTravel(pointerType);
    close(layout.x + shown.dx * scale, layout.x + expected.dx);
    close(layout.y + shown.dy * scale, layout.y + expected.dy);
    assert.equal(adapter.state.x, x); assert.equal(adapter.state.y, y, 'presentation preserves the true press origin');
    assert.deepEqual(flightControlLayout(safe), layout, 'the pad stays fixed throughout the gesture');
  }
});

test('varied render reads leave physical flight, coach and recorder state identical to unobserved flight', () => {
  const baseline = createFlight({ x: 0, y: 1000, z: 0 }), observed = createFlight({ x: 0, y: 1000, z: 0 });
  const view = createFlightView(observed), cue = createTravelCue(), cam = camera();
  const watch = createSwingWatch(), coach = createFlightCoach(), recorder = createRecorder(), plainRecorder = createRecorder();
  const controls = { controlMode: 'brakes' as const, leftBrake: 0.5, rightBrake: 0.2 }, air = { windX: 2, windZ: 1 };
  for (let tick = 0; tick < 120; tick++) {
    view.capture(); stepFlight(observed, controls, air); stepFlight(baseline, controls, air);
    watch.step(1 / 60, observed, false, controls);
    const message = coach.step(1 / 60, { g: observed, watch: watch.state, input: controls, air,
      clearance: 1000, fogClearance: 1000, eligible: true, lift: circle('left') });
    recorder.push(inputFrame(controls)); plainRecorder.push(inputFrame(controls));
    const before = JSON.stringify({ observed, message, watch: watch.state, bits: [...recorder.bits], steps: recorder.steps });
    for (let read = 0; read < (tick % 2 ? 5 : 1); read++) {
      cue.sample(view.sample(read / 5), { ...facts(), noseYaw: observed.yaw }, cam, 1280, 800, 1 / 144);
      coachDragTarget(message, 'touch', controls);
    }
    assert.equal(JSON.stringify({ observed, message: coach.message, watch: watch.state, bits: [...recorder.bits], steps: recorder.steps }), before);
    assert.deepEqual(observed, baseline);
  }
  assert.deepEqual(recorder.bits, plainRecorder.bits); assert.equal(recorder.steps, plainRecorder.steps);
});

test('a run\'s fix for a failure is lit on the handles as it asks, and met within the coach\'s own tolerance', () => {
  const lit = recoveryTarget({ left: 0, right: 0.3 }, { controlMode: 'brakes', leftBrake: 0, rightBrake: 0.34 });
  assert.deepEqual([lit.leftBrake, lit.rightBrake, lit.handsUp, lit.accepted], [0, 0.3, false, true]);
  assert.equal(recoveryTarget({ left: 0.82, right: 0 }, { controlMode: 'brakes', leftBrake: 0.6, rightBrake: 0 }).accepted, false);
  assert.equal(recoveryTarget({ left: 0, right: 0 }, {}).handsUp, true);
});
