import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { brakeDragPoint, brakeRegionPoints, coachDragTarget, createTravelCue, cueBrake, dragCueLayout, dragCuePoint, groundTurn, overlapsCue } from './flight-cues.js';
import { createFlightView } from './flight-view.js';
import { createFlight, stepFlight } from './flight.js';
import { dragBrakes } from './brake-drag.js';
import { actionMessage } from './coach-actions.js';
import { createRecorder, frameInput, inputFrame } from './recorder.js';
import { createFlightCoach } from './flight-coach.js';
import { createSwingWatch } from './swing-watch.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const velocity = (heading, speed = 10) => ({ x: Math.sin(heading) * speed, y: -1, z: -Math.cos(heading) * speed });
const pose = (from = 0, to = from) => ({ pilot: { pos: { x: 0, y: 100, z: 0 }, vel: velocity(to) },
  motion: { from: velocity(from), to: velocity(to), seconds: 1 / 60, discontinuity: false } });
const facts = () => ({ blocked: false, noseYaw: 0, forwardAirspeed: 10, stall: 0, collapse: 0, inverted: false, recovering: false, wingPhase: 'flying' });
const camera = () => { const cam = new PerspectiveCamera(60, 1.6, 0.5, 1000); cam.position.set(0, 125, 40); cam.lookAt(0, 100, -12); return cam; };
const direct = (leftBrake = 0, rightBrake = 0) => ({ controlMode: 'brakes', leftBrake, rightBrake, bar: false, ears: false });
const circle = side => actionMessage({ state: 'lift', context: 'thermal', phase: 'circle', action: side, brakeDepth: 'working',
  hold: [side, 'brake'], release: [side === 'left' ? 'right' : 'left', 'bar'] }, direct());
const easing = () => actionMessage({ state: 'lift', context: 'thermal', phase: 'ease', action: 'straight', brakeDepth: 'working',
  hold: ['brake'], release: ['left', 'right', 'bar'] }, direct());

test('travel projects twelve metres along ground velocity, independently of wind-relative heading', () => {
  const g = createFlight({ x: 0, y: 100, z: 0 });
  Object.assign(g.pilot.vel, { x: 6, y: 3, z: -8 });
  g.track = -0.4; g.windX = 12; g.windZ = -2;
  const view = createFlightView(g), drawn = view.sample(1), cue = createTravelCue();
  const at = cue.sample(drawn, facts(), camera(), 1280, 800, 1 / 60);
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
  close(eased.heading, 0.3 * (1 - Math.exp(-1)));
  close(cue.sample(pose(-0.3), facts(), cam, 1280, 800, 0.001, true).heading, -0.3);
  cue.reset();
  const south = { ...facts(), noseYaw: Math.PI };
  cue.sample(pose(Math.PI - 0.01), south, cam, 1280, 800, 0.12);
  const wrapped = cue.sample(pose(-Math.PI + 0.01), south, cam, 1280, 800, 0.12);
  assert.ok(Math.abs(Math.atan2(Math.sin(wrapped.heading - Math.PI), Math.cos(wrapped.heading - Math.PI))) < 0.01);
});

test('slow/reverse movement, pauses, stalls, collapse, inversion and recovery suppress and reset travel', () => {
  const cam = camera(), cue = createTravelCue();
  const suppressions = [{ blocked: true }, { forwardAirspeed: -1 }, { stall: 0.01 }, { collapse: 0.01 },
    { inverted: true }, { recovering: true }, ...['stall-entry', 'full-stall', 'backfly', 'exit-surge', 'frontal', 'frontal-reopening'].map(wingPhase => ({ wingPhase }))];
  for (const blocked of suppressions) {
    assert.ok(cue.sample(pose(), facts(), cam, 1280, 800, 0.12));
    assert.equal(cue.sample(pose(), { ...facts(), ...blocked }, cam, 1280, 800, 0.12), null);
    close(cue.sample(pose(0.3), facts(), cam, 1280, 800, 0.001).heading, 0.3, 1e-8);
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
  for (const type of ['mouse', 'touch']) for (const side of ['left', 'right']) {
    const message = circle(side), target = coachDragTarget(message, type, direct());
    assert.equal(target.leftBrake, cueBrake(side === 'left' ? 0.50 : 0.20));
    assert.equal(target.rightBrake, cueBrake(side === 'right' ? 0.50 : 0.20));
    assert.equal(actionMessage(message, { ...direct(), ...dragBrakes(target.dx, target.dy, type) }).accepted, true);
    assert.equal(Math.sign(target.dx), side === 'left' ? -1 : 1);
    const eased = coachDragTarget(easing(), type, direct());
    assert.equal(eased.leftBrake, 0.2); assert.equal(eased.rightBrake, 0.2); assert.equal(eased.dx, 0);
    assert.equal(actionMessage(easing(), { ...direct(), ...dragBrakes(eased.dx, eased.dy, type) }).accepted, true);
  }
});

test('ordinary side, bilateral working/deep and release suggestions obey coach acceptance', () => {
  for (const side of ['left', 'right']) {
    const message = actionMessage({ action: side }, direct()), target = coachDragTarget(message);
    assert.equal(target.dy, 0); assert.equal(target[`${side}Brake`], 0.2);
    assert.equal(actionMessage(message, { ...direct(), ...target }).accepted, true);
  }
  for (const [action, amount] of [['brake', 2 / 3], ['deep-brake', 1]]) {
    const target = coachDragTarget(actionMessage({ action }, direct()));
    assert.equal(target.leftBrake, amount); assert.equal(target.rightBrake, amount);
  }
  for (const type of ['mouse', 'touch']) for (const action of ['release-all', 'release-brake', 'release-turns']) {
    const message = actionMessage({ action }, direct(1, 1)), target = coachDragTarget(message, type, direct(1, 1));
    assert.ok(target.handsUp); assert.equal(target.dx, 0); assert.ok(target.dy < 0, 'hands up has a reachable target above the origin');
    const released = dragBrakes(target.dx, target.dy, type);
    assert.deepEqual(released, { leftBrake: 0, rightBrake: 0 });
    assert.equal(actionMessage(message, { ...direct(), ...released }).accepted, true);
    assert.equal(coachDragTarget(message, type, direct()).accepted, true, 'any accepted neutral position satisfies hands up');
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

test('targets fade for a range of accepted pulls without requiring the exact suggested point', () => {
  const message = circle('left');
  assert.equal(coachDragTarget(message, 'mouse', direct(0.40, 0.15)).accepted, true);
  assert.equal(coachDragTarget(message, 'mouse', direct(0.60, 0.25)).accepted, true);
  assert.equal(coachDragTarget(message, 'mouse', direct(0.20, 0.50)).accepted, false);
  assert.equal(coachDragTarget(easing(), 'touch', direct(0.15, 0.16)).accepted, true);
});

test('ambiguous, preparation, urgent, recovery, Bar/Ears and unaccepted suggestions have no target', () => {
  const base = circle('left');
  for (const change of [{ warning: true }, { urgent: true }, { transfer: true }, { heading: 'NEXT LIFT' }, { controlMode: 'legacy' },
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

test('touch layout uses one safe offset above the finger; mouse origin stays at the press', () => {
  const safe = { left: 12, right: 308, top: 12, bottom: 728 }, touch = { x: 40, y: 530, pointerType: 'touch' };
  const obstacles = [{ left: 12, right: 145, top: 12, bottom: 150 }, { left: 16, right: 304, top: 540, bottom: 630 }];
  const layout = dragCueLayout(touch, safe, obstacles);
  assert.ok(layout.left >= safe.left && layout.right <= safe.right && layout.top >= safe.top && layout.bottom <= safe.bottom);
  assert.ok(layout.y + layout.travel <= touch.y - 48, 'deep target clears the initial finger');
  assert.equal(obstacles.some(rect => overlapsCue(layout, rect)), false);
  const target = brakeDragPoint(cueBrake(0.5), 0.2, 'touch');
  const offset = { x: layout.x - touch.x, y: layout.y - touch.y };
  close(layout.x + target.dx, touch.x + target.dx + offset.x);
  close(layout.y + target.dy, touch.y + target.dy + offset.y);
  for (const x of [0, 320]) for (const y of [0, 740]) {
    const edge = dragCueLayout({ x, y, pointerType: 'touch' }, safe);
    assert.ok(edge.left >= safe.left && edge.right <= safe.right && edge.top >= safe.top && edge.bottom <= safe.bottom);
  }
  const mouse = dragCueLayout({ ...touch, pointerType: 'mouse' }, safe, obstacles);
  assert.equal(mouse.x, touch.x); assert.equal(mouse.y, touch.y);
  const landscapeHud = { left: 10, right: 659, top: 10, bottom: 114.58 };
  const landscape = dragCueLayout({ x: 633, y: 270, pointerType: 'touch' },
    { left: 12, right: 832, top: 12, bottom: 378 }, [landscapeHud, { left: 257, right: 587, top: 256, bottom: 368 }]);
  assert.ok(landscape.y + landscape.travel <= 270 - 48, 'a wide landscape HUD cannot push the deep target onto the finger');
  const handsUpPoint = coachDragTarget(actionMessage({ action: 'release-all' }, direct()), 'touch');
  const handsUp = { left: landscape.x - 14, right: landscape.x + 14, top: landscape.y + handsUpPoint.dy - 14, bottom: landscape.y + handsUpPoint.dy + 14 };
  assert.equal(overlapsCue(handsUp, landscapeHud), false, 'the upper neutral target clears the landscape HUD');
  assert.equal(overlapsCue({ left: landscape.x - 28, right: landscape.x + 28, top: landscape.top + 4, bottom: landscape.top + 19 }, landscapeHud), false,
    'the hands-up caption stays readable in landscape');
  const releaseHud = { ...landscapeHud, bottom: 88.578125 };
  const release = dragCueLayout({ x: 633, y: 270, pointerType: 'touch' },
    { left: 12, right: 832, top: 12, bottom: 378 }, [releaseHud, { left: 257, right: 587, top: 231.265625, bottom: 368 }]);
  assert.equal(overlapsCue({ left: release.x - 14, right: release.x + 14, top: release.y + handsUpPoint.dy - 14, bottom: release.y + handsUpPoint.dy + 14 }, releaseHud), false,
    'the upper release target clears the measured landscape HUD');
});

test('varied render reads leave physical flight, coach and recorder state identical to unobserved flight', () => {
  const baseline = createFlight({ x: 0, y: 1000, z: 0 }), observed = createFlight({ x: 0, y: 1000, z: 0 });
  const view = createFlightView(observed), cue = createTravelCue(), cam = camera();
  const watch = createSwingWatch(), coach = createFlightCoach(), recorder = createRecorder(), plainRecorder = createRecorder();
  const controls = { controlMode: 'brakes', leftBrake: 0.5, rightBrake: 0.2 }, air = { windX: 2, windZ: 1 };
  for (let tick = 0; tick < 120; tick++) {
    view.capture(); stepFlight(observed, controls, air); stepFlight(baseline, controls, air);
    watch.step(observed, controls, 1 / 60);
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
