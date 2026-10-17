import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlight, stepFlight, pitchPeak } from './flight.js';
import { createSwingWatch } from './swing-watch.js';
import { createStyle } from './meet-style.js';
import { createFlightCoach } from './flight-coach.js';
import { swingGauge } from './swing-gauge.js';

const STEP = 1 / 60;
const inputState = () => ({ left: false, right: false, brake: false, deepBrake: false, bar: false, ears: false });
const watchState = () => ({ clock: 20, moves: 0, breaks: 0, calm: 0, top: 0, topSide: 0,
  topAt: -Infinity, front: 0, frontAt: -Infinity, building: 0, moveAt: -Infinity, timedAt: -Infinity });
const frame = overrides => ({ g: { bank: 0, pitch: 0, rollRate: 0, pitchRate: 0, loop: 0,
  stall: 0, stallLoad: 0, ears: 0, acro: true }, watch: watchState(), input: inputState(),
  clearance: 1000, fogClearance: 1000, eligible: true, ...overrides });
const requestedChange = (message, input) => message &&
  (message.hold.some(key => !input[key]) || message.release.some(key => input[key]) ||
    message.hold.includes('brake') && !!input.deepBrake !== (message.brakeDepth === 'deep'));
const follow = (message, input) => {
  for (const key of message.release) input[key] = false;
  if (message.release.includes('brake')) input.deepBrake = false;
  for (const key of message.hold) input[key] = true;
  if (message.hold.includes('brake')) input.deepBrake = message.brakeDepth === 'deep';
};

// Only the player's initial motion is prescribed. Once help appears, every subsequent input
// comes from the actual displayed semantic instruction after a realistic reaction delay.
function flyFollowingCoach(kind, side, delay, { reenter = false, reentryOnly = false } = {}) {
  const g = createFlight({ x: 0, y: 2000, z: 0 });
  const watch = createSwingWatch(), style = createStyle(), coach = createFlightCoach();
  const input = inputState(), controls = {}, world = { g, watch, controls };
  const actions = [], phases = new Set();
  const banks = [];
  let following = false, pending = null, applyAt = -1, attemptAt = 0, attempt = 0, quietUntil = -1, firstCost = 0, reenteredAt = -1;
  for (let tick = 0; tick < 4200; tick++) {
    if (quietUntil >= 0 && tick > quietUntil) {
      if (!reenter || attempt === 1) break;
      attempt++; attemptAt = tick; quietUntil = -1; following = false;
    }
    if (!following && quietUntil < 0) {
      const elapsed = tick - attemptAt, direction = attempt ? -side : side;
      const turn = kind === 'wingover' ? elapsed < 270 ? direction : -direction : 0;
      input.left = turn < 0; input.right = turn > 0;
      input.deepBrake = kind === 'pitch' ? Math.floor(elapsed / 180) % 2 === 0 : elapsed < 12;
      input.brake = input.deepBrake;
    }
    if (pending && tick >= applyAt) {
      follow(pending, input); actions.push({ tick, action: pending.action, phase: pending.phase }); pending = null;
    }
    Object.assign(controls, { turn: Number(input.right) - Number(input.left), brake: input.brake, deepBrake: input.deepBrake,
      bar: input.bar, ears: input.ears });
    stepFlight(g, controls, {}, STEP);
    watch.step(STEP, g, false, controls);
    style.step(STEP, world);
    const message = coach.step(STEP, { g, watch: watch.state, style: style.state, input,
      clearance: 1000, fogClearance: 1000, eligible: true });
    if (message?.context === kind) { following = true; phases.add(message.phase); }
    if (message?.context === kind && attempt === 1 && reenteredAt < 0) reenteredAt = tick;
    if (following && !pending && requestedChange(message, input)) {
      pending = message; applyAt = tick + delay + 1;
    }
    assert.equal(g.stall, 0, 'following the cues must preserve flying air');
    assert.equal(watch.state.breaks, 0, 'the complete maneuver and recovery remain controlled');
    if (style.state.landed > banks.length) {
      banks.push(tick); quietUntil = tick + 600;
      if (banks.length === 1) firstCost = 2000 - g.pos.y;
    }
    if (quietUntil >= 0) assert.equal(message, null, 'finished maneuver evidence cannot reopen a card during ten seconds of steady flight');
    if (reentryOnly && reenteredAt >= 0) break;
  }
  const expected = reenter && !reentryOnly ? 2 : 1;
  assert.ok(following, 'the coach reacts to the player’s observed motion');
  assert.ok(banks[0] > 0 && banks[0] < 1200, 'following the instructions banks within20s');
  assert.equal(banks.length, expected, 'a fresh second attempt can re-enter after the quiet interval');
  if (reenter) assert.ok(reenteredAt > banks[0] + 600, 'the next attempt reacts to fresh inputs and physical motion after ten quiet seconds');
  assert.equal(watch.state.moves, expected, 'real complete maneuvers, not a score for pressing a key');
  assert.equal(watch.state.moveKind, kind === 'wingover' ? 2 : 1);
  assert.equal(style.state.landed, expected);
  assert.equal(style.state.lost, 0);
  if (!reentryOnly) assert.ok(watch.state.calm >= 1, 'a full second of physical steady flight banks the move');
  assert.ok(style.state.total > 0);
  assert.ok(firstCost > 15 && firstCost < 70, 'the maneuver spends altitude within the recovery reserve');
  return { actions, phases, cost: firstCost, bankedAt: banks[0], style: style.state.total };
}

for (const side of [-1, 1]) for (const delay of [0, 6, 12, 18]) {
  test(`real mirrored wingover cues complete and bank with${delay / 60}s reaction, side${side}`, () => {
    const result = flyFollowingCoach('wingover', side, delay);
    assert.ok(result.phases.has('hold') && result.phases.has('prepare') && result.phases.has('reverse'));
    assert.ok(result.phases.has('recovery'));
    assert.equal(result.actions[0].action, side < 0 ? 'left' : 'right');
  });
}
for (const delay of [0, 6, 12, 18]) {
  test(`real reactive pitch cues complete and bank with${delay / 60}s reaction`, () => {
    const result = flyFollowingCoach('pitch', 0, delay);
    assert.ok(result.phases.has('shape') && result.phases.has('wait') && result.phases.has('catch'));
    assert.ok(result.actions.some(action => action.action === 'release-brake'));
    assert.ok(result.actions.some(action => action.action === 'brake'));
  });
}

for (const side of [-1, 1]) test(`fresh input and physical wingover motion can re-enter after banking and ten quiet seconds, side${side}`, () => {
  flyFollowingCoach('wingover', side, 12, { reenter: true, reentryOnly: true });
});
test('fresh worked brake and a new physical front can re-enter pitch after banking and ten quiet seconds', () => {
  flyFollowingCoach('pitch', 0, 12, { reenter: true });
});

test('abandoned real pitch motion expires and cannot reopen from its old front or brake edges', () => {
  const g = createFlight({ x: 0, y: 1000, z: 0 }), watch = createSwingWatch(), coach = createFlightCoach();
  const input = inputState();
  let engagedAt = -1, quietFrames = 0;
  for (let tick = 0; tick < 1800; tick++) {
    input.brake = input.deepBrake = engagedAt < 0 && Math.floor(tick / 180) % 2 === 0;
    const controls = { turn: 0, brake: input.brake, deepBrake: input.deepBrake };
    stepFlight(g, controls, {}, STEP); watch.step(STEP, g, false, controls);
    const message = coach.step(STEP, { g, watch: watch.state, input, clearance: 1000, eligible: true });
    if (engagedAt < 0 && message?.context === 'pitch') engagedAt = tick;
    if (tick >= 1200) { assert.equal(message, null); quietFrames++; }
  }
  assert.ok(engagedAt > 0, 'deliberate shaping and a real forward peak first engage help');
  assert.equal(quietFrames, 600, 'the final ten seconds remain quiet after the player abandons the motion');
  assert.equal(watch.state.moves, 0);
});

test('new brake input edges cannot reuse a consumed physical front', () => {
  const coach = createFlightCoach(), f = frame();
  coach.step(STEP, f);
  f.watch.clock += STEP;
  Object.assign(f.watch, { front: 0.5, frontAt: f.watch.clock, building: 1 });
  for (const brake of [true, false, true]) {
    f.input.brake = f.input.deepBrake = brake; f.watch.clock += STEP; coach.step(STEP, f);
  }
  assert.equal(coach.message.context, 'pitch');
  f.watch.moves = 1; f.watch.moveKind = 1; f.watch.calm = 1; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f), null);
  for (const brake of [false, true, false, true]) {
    f.input.brake = f.input.deepBrake = brake; f.watch.clock += STEP;
    assert.equal(coach.step(STEP, f), null, 'fresh inputs still need a new physical peak');
  }
  f.watch.clock += STEP; f.watch.frontAt = f.watch.clock;
  assert.equal(coach.step(STEP, f).context, 'pitch');
});

test('a weak shaping backswing releases at its observed reversal without waiting for a scoring-sized top', () => {
  const coach = createFlightCoach(), f = frame();
  coach.step(STEP, f);
  Object.assign(f.watch, { front: 0.5, frontAt: f.watch.clock + STEP, building: 1 });
  Object.assign(f.g, { pitch: 0.1, pitchRate: 0.2 });
  for (const brake of [true, true, true]) {
    f.input.brake = f.input.deepBrake = brake; f.watch.clock += STEP; coach.step(STEP, f);
  }
  assert.equal(coach.message.phase, 'shape');
  assert.equal(coach.message.action, 'deep-brake');
  assert.equal(coach.message.brakeDepth, 'deep');
  f.g.pitch = 0.12; f.g.pitchRate = -0.01; f.watch.clock += STEP;
  const message = coach.step(STEP, f);
  assert.equal(message.phase, 'release');
  assert.equal(message.action, 'release-brake');
});

test('fresh pitch intent observed after a forward peak can resume its backswing shaping', () => {
  const coach = createFlightCoach(), f = frame();
  coach.step(STEP, f);
  Object.assign(f.watch, { front: 0.5, frontAt: f.watch.clock + STEP, building: 1 });
  Object.assign(f.g, { pitch: -0.4, pitchRate: 0.2 });
  for (const brake of [true, true, true]) {
    f.input.brake = f.input.deepBrake = brake; f.watch.clock += STEP; coach.step(STEP, f);
  }
  assert.equal(coach.message.context, 'pitch');
  assert.equal(coach.message.phase, 'shape');
  assert.equal(coach.message.action, 'deep-brake');
  assert.ok(coach.message.hold.includes('brake'));
});

test('releasing a deliberate deeper pull early is honored before a working-depth catch', () => {
  const coach = createFlightCoach(), f = frame();
  coach.step(STEP, f);
  Object.assign(f.watch, { front: 0.5, frontAt: f.watch.clock + STEP, building: 1 });
  Object.assign(f.g, { pitch: 0.2, pitchRate: 0.2 });
  f.input.brake = f.input.deepBrake = true; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f).action, 'deep-brake');
  f.input.brake = f.input.deepBrake = false; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f).phase, 'wait', 'an early release cannot reopen a deeper shaping demand');
  f.g.pitch = -0.66; f.g.pitchRate = -0.3; f.watch.clock += STEP;
  const catchMessage = coach.step(STEP, f);
  assert.equal(catchMessage.action, 'brake'); assert.equal(catchMessage.brakeDepth, 'working');
});

test('ordinary brake corrections and large observed fronts cannot arm deliberate pitch coaching', () => {
  const coach = createFlightCoach(), f = frame();
  f.g.acro = false; coach.step(STEP, f);
  Object.assign(f.watch, { front: 0.6, frontAt: f.watch.clock + STEP, building: 2 });
  for (let tick = 0; tick < 20; tick++) {
    f.input.brake = tick % 2 === 0; f.watch.clock += STEP;
    assert.equal(coach.step(STEP, f), null, 'physical pitch plus working-brake edges is not explicit deep intent');
  }
});

test('a deliberate forward catch accounts for the short physical brake take before the angle threshold', () => {
  const coach = createFlightCoach(), f = frame();
  coach.step(STEP, f);
  Object.assign(f.watch, { front: 0.5, frontAt: f.watch.clock + STEP, building: 1 });
  Object.assign(f.g, { pitch: 0.1, pitchRate: 0 });
  for (const brake of [true, false, true, false]) {
    f.input.brake = f.input.deepBrake = brake; f.watch.clock += STEP; coach.step(STEP, f);
  }
  f.g.pitch = -0.645; f.g.pitchRate = -0.3; f.watch.clock += STEP;
  const message = coach.step(STEP, f);
  assert.ok(f.g.pitch > -0.65, 'the wing has not yet passed the catch angle');
  assert.equal(message.phase, 'catch');
  assert.equal(message.action, 'brake');
  assert.equal(message.brakeDepth, 'working');
});

test('same-side tops cannot keep a cancelled wingover attempt alive without fresh reversals', () => {
  const coach = createFlightCoach(), f = frame();
  f.input.left = true; coach.step(STEP, f);
  f.input.left = false; f.input.right = true; f.g.bank = 1; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f).context, 'wingover');
  f.watch.clock += 5.1;
  Object.assign(f.watch, { top: 1.1, topAt: f.watch.clock, topSide: 1 });
  assert.equal(coach.step(STEP, f).phase, 'recovery');
  f.input.right = false; f.g.bank = 0; f.watch.calm = 1; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f), null);
  for (let tick = 0; tick < 600; tick++) {
    f.watch.clock += STEP;
    assert.equal(coach.step(STEP, f), null);
  }
});

test('ordinary alternating course corrections never invite a stunt or score one', () => {
  const g = createFlight({ x: 0, y: 1000, z: 0 }), watch = createSwingWatch(), coach = createFlightCoach();
  const input = inputState();
  let peak = 0;
  for (let tick = 0; tick < 1800; tick++) {
    const turn = Math.floor(tick / 210) % 2 ? 1 : -1;
    input.left = turn < 0; input.right = turn > 0;
    stepFlight(g, { turn }, {}, STEP); watch.step(STEP, g, false, { turn });
    const message = coach.step(STEP, { g, watch: watch.state, input, clearance: 60, eligible: true });
    peak = Math.max(peak, Math.abs(g.bank));
    assert.ok(!message || !['wingover', 'pitch', 'inversion'].includes(message.context));
  }
  assert.ok(peak > 30 * Math.PI / 180 && peak < 45 * Math.PI / 180, 'ordinary reversals stay within the controlled steering envelope');
  assert.equal(watch.state.moves, 0);
});

test('holding a single steep turn and a stale reversal do not establish maneuver intent', () => {
  const coach = createFlightCoach(), f = frame();
  f.input.left = true; coach.step(STEP, f);
  f.watch.clock += 2; f.input.left = false; coach.step(2, f);
  f.watch.clock += STEP; f.input.right = true; f.g.bank = 1.1;
  assert.equal(coach.step(STEP, f), null);
});

test('raw accepted steering changes the instruction without waiting for physical bank to cross', () => {
  const coach = createFlightCoach(), f = frame();
  f.input.left = true; coach.step(STEP, f);
  f.watch.clock += STEP; f.input.left = false; f.input.right = true; f.g.bank = 1;
  assert.equal(coach.step(STEP, f).title, 'HOLD RIGHT');
  Object.assign(f.watch, { top: 1.1, topSide: 1, topAt: f.watch.clock });
  f.watch.clock += STEP; f.g.bank = 0.65; f.g.rollRate = -0.5;
  assert.equal(coach.step(STEP, f).action, 'left');
  f.watch.clock += STEP; f.input.right = false; f.input.left = true;
  const message = coach.step(STEP, f);
  assert.equal(message.title, 'HOLD LEFT');
  assert.ok(f.g.bank > 0, 'the wing still banks right while left input is already accepted');
});

test('stall recovery wins over hazards, pending points, inversion and an old brake cue', () => {
  const coach = createFlightCoach(), f = frame({ style: { elements: 1, last: 2, pending: 20, bankedAt: 20 },
    hazard: { kind: 'terrain', action: 'left', detail: 'Turn away.' }, gauge: { coming: 6 } });
  Object.assign(f.g, { stallLoad: 0.8, pitch: -0.8, loop: 1 }); f.input.brake = true;
  const message = coach.step(STEP, f);
  assert.equal(message.action, 'release-all');
  assert.equal(message.context, 'stall');
  assert.ok(message.release.includes('brake'));
});

test('a predicted unintentional forward surge overrides qualified lift without arming a pitch stunt', () => {
  const coach = createFlightCoach(), f = frame({ lift: { state: 'lift', context: 'thermal', activity: 'thermalling',
    action: 'left', detail: 'Keep circling.' } });
  f.g.pitch = -0.1; f.g.pitchRate = -2;
  assert.ok(pitchPeak(f.g) < -0.8, 'the dangerous forecast comes from angular velocity, not just the current angle');
  let message = coach.step(STEP, f);
  assert.equal(message.context, 'surge'); assert.equal(message.action, 'brake');
  assert.ok(message.release.includes('left') && message.release.includes('right'));
  f.input.brake = true; f.g.pitch = 0.1; f.g.pitchRate = 0.2; f.watch.clock += STEP;
  message = coach.step(STEP, f);
  assert.equal(message.context, 'surge'); assert.equal(message.action, 'release-brake');
  f.input.brake = false; f.g.pitch = f.g.pitchRate = 0; f.watch.calm = 1; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f).context, 'thermal', 'steady recovery returns to qualified activity');
});

for (const delay of [0, 12]) test(`a real forward surge is caught and stays recovered with${delay / 60}s reaction`, () => {
  const g = createFlight({ x: 0, y: 2000, z: 0 });
  let found = false;
  for (let tick = 0; tick < 2400; tick++) {
    stepFlight(g, { brake: Math.floor(tick / 210) % 2 === 0 }, {}, STEP);
    if (g.pitch < 0 && g.pitchRate < 0 && pitchPeak(g) < -0.8 && g.stall === 0 && g.stallLoad <= 0.65) {
      found = true; break;
    }
  }
  assert.ok(found, 'the unchanged physical solver supplies a real dangerous forward surge');
  // A fresh observer has no deliberate pitch-input history, as after interrupted assistance.
  const watch = createSwingWatch(), style = createStyle(), coach = createFlightCoach(), input = inputState();
  const controls = {}, world = { g, watch, controls };
  const lift = { state: 'lift', context: 'thermal', activity: 'thermalling', action: 'straight', detail: 'Stay around the core.' };
  const facts = () => ({ g, watch: watch.state, style: style.state, input, lift, clearance: 1000, eligible: true });
  let pending = coach.step(STEP, facts()), applyAt = delay, recoveredAt = -1, sawRelease = false;
  assert.equal(pending.action, 'brake'); assert.equal(pending.context, 'surge');
  for (let tick = 0; tick < 1800; tick++) {
    if (pending && tick >= applyAt) { follow(pending, input); pending = null; }
    Object.assign(controls, { turn: Number(input.right) - Number(input.left), brake: input.brake, deepBrake: input.deepBrake, bar: input.bar, ears: input.ears });
    stepFlight(g, controls, {}, STEP); watch.step(STEP, g, false, controls); style.step(STEP, world);
    const message = coach.step(STEP, facts());
    assert.notEqual(message?.context, 'pitch'); assert.notEqual(message?.context, 'wingover');
    sawRelease ||= message?.action === 'release-brake';
    if (!pending && requestedChange(message, input)) { pending = message; applyAt = tick + delay + 1; }
    assert.equal(g.stall, 0); assert.equal(watch.state.breaks, 0);
    if (watch.state.calm >= 1 && recoveredAt < 0) recoveredAt = tick;
    if (recoveredAt >= 0) assert.equal(message.context, 'thermal', 'old surge evidence cannot reopen recovery');
    if (recoveredAt >= 0 && tick >= recoveredAt + 600) break;
  }
  assert.ok(recoveredAt >= 0 && recoveredAt < 900); assert.ok(sawRelease);
  assert.equal(watch.state.moves, 0); assert.equal(style.state.total, 0); assert.equal(g.loops, 0);
});

test('recovery remains active after a stall clears until the wing is physically steady', () => {
  const coach = createFlightCoach(), f = frame({ lift: { context: 'ridge', action: 'left' } });
  f.g.stall = 1; assert.equal(coach.step(STEP, f).action, 'release-all');
  f.g.stall = 0; f.g.pitch = 0.2;
  assert.equal(coach.step(STEP, f).phase, 'recovery');
  f.watch.calm = 1;
  assert.equal(coach.step(STEP, f).context, 'ridge');
});

test('an external fold follows real gauge hold, release and second-pump phases', () => {
  const coach = createFlightCoach(), f = frame({ collapse: 1, gauge: {} });
  const hands = { fold: 1, held: 0, brake: false };
  swingGauge(f.g, f.watch, true, STEP, f.gauge, hands);
  assert.equal(coach.step(STEP, f).action, 'brake');
  f.input.brake = hands.brake = true; hands.held = 0.3;
  swingGauge(f.g, f.watch, true, STEP, f.gauge, hands);
  assert.equal(f.gauge.coming, 3, 'the real gauge changes from pump to release');
  assert.equal(coach.step(STEP, f).action, 'release-brake');
  f.input.brake = hands.brake = false; hands.held = 0; hands.fold = f.collapse = 0.4;
  swingGauge(f.g, f.watch, true, STEP, f.gauge, hands);
  assert.equal(coach.step(STEP, f).action, 'brake', 'a remaining external fold can be pumped again');
  hands.fold = f.collapse = 0;
  swingGauge(f.g, f.watch, true, STEP, f.gauge, hands);
  assert.equal(coach.step(STEP, f).phase, 'recovery');
});

test('low clearance aborts deliberate motion but leaves ordinary ridge guidance available', () => {
  const coach = createFlightCoach(), lift = { state: 'ridge', context: 'ridge', phase: 'align', action: 'left', detail: 'Align along the cliff.' };
  const f = frame({ clearance: 50, lift });
  f.input.left = true; assert.equal(coach.step(STEP, f).context, 'ridge');
  f.watch.clock += STEP; f.input.left = false; f.input.right = true; f.g.bank = 1;
  assert.equal(coach.step(STEP, f).phase, 'recovery');
  f.g.pitch = -0.3;
  assert.equal(coach.step(STEP, f).action, 'brake');
  assert.match(coach.message.detail, /Low clearance/);
  f.g.bank = f.g.pitch = 0; f.watch.calm = 1;
  assert.equal(coach.step(STEP, f).context, 'ridge', 'steady recovery yields to qualified guidance even while terrain clearance remains below80m');
});

test('qualified lift and hazards retain secondary praise without opening entry or background cards', () => {
  const coach = createFlightCoach(), f = frame({ style: { bankedAt: 20, said: 20 },
    lift: { context: 'ridge', state: 'ridge', phase: 'align', action: 'right', detail: 'Follow the ridge.' } });
  f.watch.moveKind = 2;
  let message = coach.step(STEP, f);
  assert.equal(message.action, 'right'); assert.match(message.feedback, /BANKED/);
  f.entry = { side: -1, age: 1 }; message = coach.step(STEP, f);
  assert.equal(message.context, 'ridge'); assert.equal(message.action, 'right');
  f.lift = null; f.air = { ridge: 3, windY: 3 }; f.watch.timedAt = f.watch.moveAt = f.watch.clock;
  assert.equal(coach.step(STEP, f), null, 'raw air, entry, timing and banked praise cannot open an ambient card');
  f.hazard = { kind: 'terrain', action: 'right', title: 'TURN AWAY', detail: 'Terrain ahead.' };
  message = coach.step(STEP, f);
  assert.equal(message.context, 'terrain'); assert.equal(message.action, 'right');
});

test('intentional ears owns the coach through actual reopening', () => {
  const coach = createFlightCoach(), f = frame({ lift: { action: 'left', context: 'ridge' } });
  f.input.ears = true;
  assert.deepEqual(coach.step(STEP, f).hold, ['ears']);
  f.input.ears = false; f.g.ears = 0.4;
  assert.equal(coach.step(STEP, f).phase, 'reopening');
  f.g.ears = 0;
  assert.equal(coach.step(STEP, f).context, 'ridge');
});

test('above-canopy advice is an explicit safe abort, never invented loop button phases', () => {
  const coach = createFlightCoach(), f = frame();
  Object.assign(f.g, { loop: 1, loopAngle: 3.5, bank: -2.8 }); f.input.right = f.input.bar = true;
  const message = coach.step(STEP, f);
  assert.equal(message.context, 'inversion'); assert.equal(message.phase, 'above');
  assert.equal(message.action, 'release-turns'); assert.ok(message.release.includes('bar'));
  assert.match(message.detail, /may not complete/); assert.equal(message.progress, undefined);
});

test('cloud and bell hazards cannot ask for straight flight or bar while the pilot is above the wing', () => {
  for (const hazard of [{ context: 'IN CLOUD', action: 'straight', detail: 'Leave the cloud.' },
    { context: 'KETTLEBELL', action: 'none', hold: ['bar'], detail: 'A kettlebell is falling.' }]) {
    const coach = createFlightCoach(), f = frame({ hazard });
    f.g.loop = 1;
    const message = coach.step(STEP, f);
    assert.equal(message.context, 'inversion');
    assert.equal(message.action, 'release-turns');
    assert.deepEqual(message.hold, []);
    assert.ok(message.release.includes('bar'));
    assert.ok(message.detail.includes(hazard.detail), 'the hazard remains explained during physical recovery');
  }
});

test('coach is read-only and reset or ineligibility cannot carry intent into a fresh flight', () => {
  const coach = createFlightCoach(), f = frame();
  f.input.left = true; coach.step(STEP, f);
  f.watch.clock += STEP; f.input.left = false; f.input.right = true; f.g.bank = 1;
  assert.equal(coach.step(STEP, f).context, 'wingover');
  const before = JSON.stringify(f);
  coach.step(STEP, f);
  assert.equal(JSON.stringify(f), before);
  coach.reset(); assert.equal(coach.message, null);
  assert.equal(coach.step(STEP, f), null, 'steep angle without new intent is quiet after reset');
  f.input.right = false; f.input.left = true; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f), null, 'a fresh key reversal alone cannot reuse the old physical excursion');
  f.g.bank = 0; f.watch.clock += STEP; coach.step(STEP, f);
  f.g.bank = 1; f.watch.clock += STEP;
  assert.equal(coach.step(STEP, f).context, 'wingover');
  f.eligible = false; assert.equal(coach.step(STEP, f), null);
  f.eligible = true;
  assert.equal(coach.step(STEP, f), null);
  f.watch.moves = 5; f.watch.moveAt = 0;
  coach.reset();
  assert.equal(coach.step(STEP, f), null, 'old completion counters cannot resurrect recovery after a reset');
});

test('observing a real flight leaves its canonical bodies, observer and score exactly unchanged', () => {
  const a = createFlight({ x: 0, y: 1000, z: 0 }), b = createFlight({ x: 0, y: 1000, z: 0 });
  const watchA = createSwingWatch(), watchB = createSwingWatch(), styleA = createStyle(), styleB = createStyle();
  const input = inputState(), controls = {}, coach = createFlightCoach();
  const worldA = { g: a, watch: watchA, controls }, worldB = { g: b, watch: watchB, controls };
  for (let tick = 0; tick < 1200; tick++) {
    controls.turn = Math.floor(tick / 270) % 2 ? 1 : -1;
    controls.ears = tick >= 900 && tick < 930;
    controls.brake = tick >= 960 && tick < 990;
    input.left = controls.turn < 0; input.right = controls.turn > 0;
    input.ears = controls.ears; input.brake = controls.brake;
    for (const [g, watch, style, world] of [[a, watchA, styleA, worldA], [b, watchB, styleB, worldB]]) {
      stepFlight(g, controls, {}, STEP); watch.step(STEP, g, false, controls); style.step(STEP, world);
    }
    coach.step(STEP, { g: a, watch: watchA.state, style: styleA.state, input, eligible: true, clearance: 1000 });
  }
  assert.deepEqual(a, b);
  assert.deepEqual(watchA.state, watchB.state);
  assert.deepEqual(styleA.state, styleB.state);
});
