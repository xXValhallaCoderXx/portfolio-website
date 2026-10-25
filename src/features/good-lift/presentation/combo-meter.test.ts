import type { TrickWatch } from '../../../domains/good-lift/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { arraysMadeBy } from '../../../test/helpers/test-alloc.ts';
import { createComboStyle } from '../../../domains/good-lift/meet-combo.ts';
import { BREAK, DETECT, LINKS, MOVE } from '../../../domains/good-lift/trick-tables.ts';
import { COMBO_METER, addBox, createComboMeter, createMeterLayout, placeMeter, type MeterEvent, type MeterFrame, type MeterStyle } from './combo-meter.ts';

const link = (name: string) => LINKS.find(each => each.name === name)!.id;

// The meter over a watch whose moves are told rather than flown (as meet-combo.test.js's), scored by
// the real style, and drawn into stand-ins for its elements by a clock the test turns. `heard` is
// every event a step returned, copied as it came.
function fixture({ calm = false } = {}) {
  const state = { steps: 0, move: 0, side: 0, units: 0, band: 0, measure: 0, active: 0, endedAt: -1, startedAt: -1, instances: 0,
    unitCount: 0, previous: 0, link: 0, flow: 0, breaks: 0, broke: 0, settled: 0, neutral: 0, load: 1, tilt: 1, bankSide: 0, stalling: 0 };
  const style = createComboStyle(), world = { tricks: { state } as unknown as TrickWatch };
  const part = () => ({ textContent: '' as string | null, hidden: true as string | boolean });
  const element = { hidden: true as string | boolean, className: '', dataset: {} as Record<string, string | undefined>, style: { transform: '' } };
  const parts = { banner: part(), card: part(), trail: part(), hand: part(), multiplier: part(), cap: part(), payout: part(), hurry: part(),
    word: part(), announce: part() };
  const ring = { style: { strokeDashoffset: '' } };
  let clock = 0, remaining = 300;
  const meter = createComboMeter({ element, ring, ...parts, now: () => clock });
  const said = { word: '', until: -Infinity };
  const heard: MeterEvent[] = [];
  const step = (count = 1) => {
    for (let i = 0; i < count; i++) {
      state.steps += 1;
      style.step(1 / 60, world);
      const event = meter.observe(style.state, state, remaining);
      if (event) heard.push({ ...event });
    }
  };
  return {
    style, state, meter, element, parts, ring, said, heard, step,
    later(ms: number) { clock += ms; },
    left(seconds: number) { remaining = seconds; },
    present: (quiet = false) => meter.present(quiet, calm, said),
    move(move: number, { side = 0, band = 3, units = 1, link = 0, flow = 0 } = {}) {
      Object.assign(state, { move, side, band, units, link, flow, active: 1, settled: 0 });
      state.instances += 1; state.unitCount += units; step();
    },
    unit(band = state.band) { state.units += 1; state.unitCount += 1; state.band = band; step(); },
    settle(steps: number = DETECT.settle) { state.active = 0; for (let i = 0; i < steps; i++) { state.settled += 1; step(); } },
    bail(reason: number) { state.breaks += 1; state.broke = reason; state.active = 0; state.settled = 0; step(); },
  };
}

// What the card says, as one line per row, its moves' names read with plain spaces (the meter
// keeps each name to one line).
const plain = (text: string | null) => (text ?? '').replaceAll('\u00a0', ' ');
const card = (f: ReturnType<typeof fixture>) => [plain(`${f.parts.trail.textContent}${f.parts.hand.textContent}`),
  `${f.parts.multiplier.textContent}${f.parts.cap.textContent}`, plain(f.parts.payout.textContent)];

test('each step that changes the chain is one event, of the phase it was, and carries what its sound needs', () => {
  const f = fixture();
  f.move(MOVE.wingover, { band: 2 });
  f.unit();
  f.move(MOVE.spiral, { side: -1, band: 3, link: link('WING-SPIRAL'), flow: 1 });
  f.move(MOVE.loop, { side: 1, band: 4 });
  f.move(MOVE.loop, { side: 1, band: 4 });
  f.settle();
  assert.deepEqual(f.heard.map(event => event.phase), ['move', 'unit', 'link', 'multiplier', 'move', 'banked']);
  const [first, unit, linked, raised, again, banked] = f.heard;
  assert.equal(first.multiplier, 2, 'one move is ×1');
  assert.equal(unit.units, 2);
  assert.deepEqual([linked.link, linked.flow, linked.multiplier], [link('WING-SPIRAL'), true, 4]);
  assert.equal(raised.multiplier, 6, 'a third move raises the cap and the multiplier with it');
  assert.equal(again.multiplier, 6, 'the same move again raises nothing');
  assert.equal(banked.points, f.style.state.total);
  assert.equal(banked.multiplier, f.style.state.lastCombo.multiplier);
  assert.ok(f.heard.every(event => !event.hurry), 'nothing is told to bank with the run far from its end');
  // A step that changes nothing says nothing.
  assert.equal(f.meter.observe(f.style.state, f.state, 300), null);
});

test('a move short of its first band is no move yet, and its units are not counted until it joins', () => {
  const f = fixture();
  f.move(MOVE.spiral, { side: 1, band: 0 });
  f.unit(0);
  assert.equal(f.heard.length, 0);
  assert.equal(f.present(), false, 'nothing in hand, nothing shown');
  f.unit(2);
  assert.deepEqual(f.heard.map(event => event.phase), ['move']);
  assert.equal(f.present(), true);
  assert.deepEqual(card(f), ['SPIRAL DIVE ×3', '×1/×1', `+${f.style.state.pending}`]);
});

test('the card names the latest three moves with the units of the one in hand, and the multiplier from its halves', () => {
  const f = fixture();
  f.move(MOVE.wingover, { band: 2 });
  f.unit();
  f.present();
  assert.deepEqual(card(f), ['WINGOVERS ×2', '×1/×1', `+${f.style.state.pending}`]);
  assert.equal(f.parts.trail.textContent, '');
  f.move(MOVE.spiral, { side: -1, band: 3 });
  f.move(MOVE.loop, { side: 1, band: 4 });
  f.present();
  // Three different moves, no links, no flows: 2 + 3 halves under a cap of 3 × 2: ×2.5 of ×3.
  assert.equal(f.style.state.multiplier, 5);
  assert.deepEqual(card(f), ['WINGOVERS → SPIRAL DIVE → LOOP', '×2.5/×3', `+${f.style.state.pending}`]);
  f.move(MOVE.loop, { side: -1, band: 4 });
  f.unit();
  f.present();
  assert.equal(plain(f.parts.trail.textContent), '+1 · SPIRAL DIVE → LOOP → ', 'older moves are counted, not named');
  assert.equal(f.parts.hand.textContent, 'LOOP ×2');
});

test('what banking now would pay is written as a meet writes it, and the ring fills as the wing settles', () => {
  const f = fixture();
  const style: MeterStyle = { elements: 2, pending: 1240, multiplier: 5, cap: 6, flows: 0, linked: [], move: MOVE.heli, units: 3, value: 45,
    bankCalm: 0, sequence: [MOVE.sat, MOVE.heli], landed: 0, lost: 0, said: 0, total: 0,
    lastCombo: { moves: 0, sequence: [], multiplier: 2 } };
  f.meter.observe(style, { move: MOVE.heli, active: 0 }, 300);
  f.present();
  assert.deepEqual(card(f), ['SAT → HELICOPTER ×3', '×2.5/×3', '+1,240']);
  assert.equal(f.ring.style.strokeDashoffset, '100.0');
  f.meter.observe({ ...style, bankCalm: 1.5 }, { move: MOVE.heli, active: 0 }, 300);
  f.present();
  assert.equal(f.ring.style.strokeDashoffset, '50.0');
});

test('a named link or a flow puts its banner over the card for 0.9 s', () => {
  const f = fixture();
  f.move(MOVE.wingover, { band: 2 });
  f.present();
  assert.equal(f.parts.banner.hidden, true);
  f.move(MOVE.spiral, { side: 1, band: 3, link: link('WING-SPIRAL'), flow: 1 });
  f.present();
  assert.equal(f.element.dataset.phase, 'link');
  assert.equal(f.parts.banner.hidden, false);
  assert.equal(f.parts.banner.textContent, 'WING-SPIRAL · FLOW');
  f.later(COMBO_METER.banner - 1); f.present();
  assert.equal(f.parts.banner.hidden, false);
  f.later(1); f.present();
  assert.equal(f.parts.banner.hidden, true, 'gone after its moment');
  // A flow by no named link is a flow alone; a link used again in the same combo is no news.
  f.move(MOVE.loop, { side: 1, band: 4, flow: 1 });
  f.present();
  assert.equal(f.parts.banner.textContent, 'FLOW');
  const named = fixture();
  named.move(MOVE.wingover, { band: 2 });
  named.move(MOVE.spiral, { side: 1, band: 3, link: link('WING-SPIRAL') });
  named.present();
  assert.equal(named.parts.banner.textContent, 'WING-SPIRAL');
  named.move(MOVE.wingover, { band: 2 });
  named.move(MOVE.spiral, { side: -1, band: 3, link: link('WING-SPIRAL') });
  assert.deepEqual(named.heard.map(event => event.phase), ['move', 'link', 'move', 'move']);
});

test('a banked combo says what it paid and was, aloud a moment later, for 1.6 s', () => {
  const f = fixture();
  f.move(MOVE.wingover, { band: 2 });
  f.move(MOVE.spiral, { side: -1, band: 3 });
  f.move(MOVE.loop, { side: 1, band: 4 });
  f.move(MOVE.loop, { side: -1, band: 4 });
  f.present();
  f.settle();
  const points = f.style.state.said;
  assert.equal(f.present(), true);
  assert.equal(f.element.dataset.phase, 'banked');
  // Three different moves (a loop either way is one move): ×2.5, the receipt's own.
  assert.deepEqual(card(f), [`BANKED +${points}`, '×2.5', '+1 · SPIRAL DIVE → LOOP → LOOP']);
  assert.equal(f.ring.style.strokeDashoffset, '0.0', 'the ring closed: it banked');
  assert.equal(f.parts.announce.textContent, '');
  f.later(COMBO_METER.announce); f.present();
  assert.equal(f.parts.announce.textContent, `Combo banked. ${points} acro points.`);
  f.later(COMBO_METER.banked - COMBO_METER.announce - 1); f.present();
  assert.equal(f.element.hidden, false);
  f.later(1);
  assert.equal(f.present(), false);
  assert.equal(f.element.hidden, true);
  assert.equal(f.parts.announce.textContent, '');
});

test('a combo lost to a bail says what was lost, in amber; one dropped by the ears or assistance just goes', () => {
  const f = fixture();
  f.move(MOVE.spiral, { side: 1, band: 3, units: 2 });
  f.present();
  const pending = f.style.state.pending;
  f.bail(BREAK.tuck);
  assert.equal(f.heard.at(-1)!.phase, 'lost');
  assert.equal(f.heard.at(-1)!.points, pending);
  f.present();
  assert.equal(f.element.dataset.phase, 'lost');
  assert.deepEqual(card(f), [`COMBO LOST −${pending}`, '×1', 'SPIRAL DIVE ×2']);
  f.later(COMBO_METER.announce); f.present();
  assert.equal(f.parts.announce.textContent, `Move lost. ${pending} acro points.`);
  f.later(COMBO_METER.lost - COMBO_METER.announce);
  assert.equal(f.present(), false);
  for (const reason of [BREAK.ears, BREAK.assisted]) {
    const dropped = fixture();
    dropped.move(MOVE.spiral, { side: 1, band: 3 });
    dropped.present();
    dropped.bail(reason);
    assert.equal(dropped.heard.at(-1)!.phase, 'dropped');
    assert.equal(dropped.present(), false, 'hidden at once');
    assert.equal(dropped.parts.announce.textContent, '');
    dropped.later(COMBO_METER.announce); dropped.present();
    assert.equal(dropped.parts.announce.textContent, '', 'and never said');
  }
});

test('a new move ends a banked card at once: the chain in hand is the news', () => {
  const f = fixture();
  f.move(MOVE.spiral, { side: 1, band: 3 });
  f.settle();
  f.present();
  assert.equal(f.element.dataset.phase, 'banked');
  f.later(200);
  f.move(MOVE.wingover, { band: 2 });
  f.present();
  assert.equal(f.element.dataset.phase, 'move');
  assert.deepEqual(card(f), ['WINGOVERS', '×1/×1', `+${f.style.state.pending}`]);
});

test('in the last ten seconds a combo in hand is told to BANK NOW, heard once for each combo told so', () => {
  const f = fixture();
  f.move(MOVE.spiral, { side: 1, band: 3 });
  f.left(COMBO_METER.hurry + 0.5);
  f.step();
  f.present();
  assert.equal(f.parts.hurry.hidden, true);
  f.left(COMBO_METER.hurry);
  f.step();
  assert.equal(f.heard.at(-1)!.hurry, true);
  assert.equal(f.heard.at(-1)!.phase, null, 'BANK NOW is heard on a step that changed nothing else');
  f.present();
  assert.equal(f.parts.hurry.hidden, false);
  f.left(8);
  f.step(10);
  f.settle();
  f.present();
  assert.equal(f.parts.hurry.hidden, true, 'a banked card has nothing left to bank');
  f.move(MOVE.wingover, { band: 2 });
  f.present();
  assert.equal(f.parts.hurry.hidden, false, 'a new combo is told again');
  assert.equal(f.heard.filter(event => event.hurry).length, 2, 'and heard again: a timing cue is always heard');
  f.step(5);
  assert.equal(f.heard.filter(event => event.hurry).length, 2, 'once for each combo');
  f.meter.reset();
  f.style.reset();
  f.move(MOVE.wingover, { band: 2 });
  assert.equal(f.heard.filter(event => event.hurry).length, 3, 'the next run is told aloud again');
});

test('the flight\'s word for hands on time shows under the meter, even with nothing in hand, but never one from before the run', () => {
  const f = fixture();
  Object.assign(f.said, { word: 'CLEAN', until: 3.2 });
  assert.equal(f.present(), false, 'the first look after a reset only notes where the word stands');
  Object.assign(f.said, { word: 'CAUGHT', until: 4.1 });
  assert.equal(f.present(), true);
  assert.deepEqual([f.parts.word.hidden, f.parts.word.textContent, f.parts.card.hidden], [false, '✓ CAUGHT', true]);
  f.later(COMBO_METER.word);
  assert.equal(f.present(), false);
  Object.assign(f.said, { word: '2/3', until: 5 });
  f.present();
  assert.equal(f.parts.word.textContent, 'PUMP 2/3');
  f.move(MOVE.wingover, { band: 2 });
  f.present();
  assert.deepEqual([f.parts.word.hidden, f.parts.card.hidden], [false, false], 'under the chain in hand');
});

test('an overlay hides the meter and drops its moments: nothing held back is celebrated late', () => {
  const f = fixture();
  f.move(MOVE.spiral, { side: 1, band: 3 });
  assert.equal(f.present(true), false);
  assert.equal(f.element.hidden, true);
  assert.equal(f.present(), true, 'the chain in hand shows again');
  assert.notEqual(f.element.dataset.phase, 'move', 'without popping a move that happened under the overlay');
  f.settle();
  f.present(true);
  f.later(COMBO_METER.announce);
  assert.equal(f.present(), false, 'no banked card after the overlay');
  assert.equal(f.parts.announce.textContent, '');
});

test('each moment pops, but never with less motion asked for', () => {
  const lively = fixture(), calm = fixture({ calm: true });
  for (const f of [lively, calm]) {
    const classes: string[] = [];
    f.move(MOVE.wingover, { band: 2 }); f.present(); classes.push(f.element.className);
    f.unit(); f.present(); classes.push(f.element.className);
    f.move(MOVE.spiral, { side: 1, band: 3, link: link('WING-SPIRAL'), flow: 1 }); f.present(); classes.push(f.element.className);
    f.settle(); f.present(); classes.push(f.element.className);
    if (f === lively) assert.ok(classes.every(name => name.split(' ').includes('pop')), classes.join());
    else assert.ok(classes.every(name => !name.split(' ').includes('pop')), classes.join());
  }
  // The beat alternates, so the same phase twice runs its animation twice.
  const f = fixture();
  f.move(MOVE.wingover, { band: 2 }); f.present();
  const beat = f.element.dataset.beat;
  f.unit(); f.present();
  f.unit(); f.present();
  assert.equal(f.element.dataset.phase, 'unit');
  assert.equal(f.element.dataset.beat, beat);
  f.present();
  assert.equal(f.element.dataset.beat, beat, 'drawing again restarts nothing');
});

test('the move in hand is live while it is flown, and the ring is the settling after it', () => {
  const f = fixture();
  f.move(MOVE.spiral, { side: 1, band: 3 });
  f.present();
  assert.equal(f.element.dataset.live, 'true');
  f.settle(DETECT.settle / 2);
  f.present();
  assert.equal(f.element.dataset.live, 'false');
  assert.equal(f.ring.style.strokeDashoffset, '50.0');
});

const frame = (x: number, y: number, more: Partial<MeterFrame> = {}): MeterFrame =>
  ({ x, y, wingX: x, wingY: y, seen: true, width: 1200, height: 800, dock: false, ...more });

test('beside the pilot it stands right of and above them, its word\'s room and all, kept on the screen', () => {
  const layout = createMeterLayout(4), spot = { x: 0, y: 0, docked: true, blocked: false, slot: -1, compact: false };
  const { right, up, margin, above, below, width, height } = COMBO_METER;
  assert.deepEqual(placeMeter(frame(500, 500), layout, spot), { x: 500 + right, y: 500 - up - below, docked: false, blocked: false, slot: -1, compact: false });
  // Past the screen's right edge it goes the pilot's other side.
  assert.deepEqual(placeMeter(frame(1100, 500), layout, spot), { x: 1100 - right - width, y: 500 - up - below, docked: false, blocked: false, slot: -1, compact: false });
  // High on the screen it keeps its banner's room under the top edge, and under the readouts.
  assert.equal(placeMeter(frame(500, 20), layout, spot).y, margin + above + height);
  const readouts = createMeterLayout(1);
  readouts.top = 90;
  assert.equal(placeMeter(frame(500, 100), readouts, spot).y, 90 + margin / 2 + above + height);
  // A pilot just under the top of the handles (a desktop window 800 high) still has it beside them.
  const handles = createMeterLayout(4);
  addBox(handles, 728, 530, 800, 770);
  handles.dock = 530;
  assert.equal(placeMeter(frame(640, 542), handles, spot).docked, false);
  // One window 720 high puts the pilot further under it: beside them it rises clear of the handles.
  const laptop = createMeterLayout(4);
  addBox(laptop, 728, 450, 800, 690);
  laptop.dock = 450;
  const { gap, rise } = COMBO_METER;
  assert.deepEqual(placeMeter(frame(640, 490, { height: 720 }), laptop, spot), { x: 640 + right, y: 450 - gap - below, docked: false, blocked: false, slot: -1, compact: false });
  // But never far from the pilot: one well under the top of the handle goes the pilot's other side,
  // and with a handle on that side too, docks.
  const far = 450 - gap - below + rise + up + below + 1;
  assert.deepEqual(placeMeter(frame(640, far, { height: 720 }), laptop, spot), { x: 640 - right - width, y: far - up - below, docked: false, blocked: false, slot: -1, compact: false });
  addBox(laptop, 360, 450, 432, 690);
  assert.deepEqual(placeMeter(frame(640, far, { height: 720 }), laptop, spot), { x: 600, y: 450 - gap - below, docked: true, blocked: true, slot: 0, compact: false });
});

test('beside the pilot it keeps to the side away from the canopy, and never on the lines up to it', () => {
  const layout = createMeterLayout(4), spot = { x: 0, y: 0, docked: true, blocked: false, slot: -1, compact: false };
  const { right, up, below, width } = COMBO_METER;
  // Banked right, the canopy out to the pilot's right on the screen: the card goes left.
  assert.deepEqual(placeMeter(frame(500, 500, { wingX: 650, wingY: 400 }), layout, spot), { x: 500 - right - width, y: 500 - up - below, docked: false, blocked: false, slot: -1, compact: false });
  assert.equal(placeMeter(frame(500, 500, { wingX: 350, wingY: 400 }), layout, spot).x, 500 + right);
  // Its own side off the screen and the wing over the other: docked.
  const edge = placeMeter(frame(1100, 500, { wingX: 900, wingY: 470 }), layout, spot);
  assert.equal(edge.docked, true);
  assert.equal(edge.blocked, true);
});

test('it docks bottom-centre above the handles when it would cover something, on a phone, with less motion or with the pilot unseen, and never on the pilot', () => {
  const layout = createMeterLayout(4);
  addBox(layout, 440, 530, 760, 770);
  layout.dock = 530;
  const spot = { x: 0, y: 0, docked: false, blocked: false, slot: -1, compact: false };
  const { gap, below, margin, above, height } = COMBO_METER;
  const docked = { x: 600, y: 530 - gap - below, docked: true, slot: 0, compact: false };
  const top = margin + above + height;
  // The handles are below the pilot: beside the pilot is clear of them.
  assert.equal(placeMeter(frame(600, 480), layout, spot).docked, false);
  // A coach card beside the pilot: docked, for something in its way.
  const coach = createMeterLayout(4);
  addBox(coach, 12, 100, 532, 520);
  addBox(coach, 440, 530, 760, 770);
  coach.dock = 530;
  // The coach card reaches the middle too: docked under the readouts.
  assert.deepEqual(placeMeter(frame(400, 480), coach, spot), { x: 600, y: top, docked: true, blocked: true, slot: 1, compact: false });
  spot.slot = -1;
  for (const why of [{ dock: true }, { seen: false }]) assert.deepEqual(placeMeter(frame(600, 300, why), layout, spot), { ...docked, blocked: false });
  assert.deepEqual(placeMeter(frame(600, 300), layout, spot, true), { ...docked, blocked: false }, 'held docked a while');
  // Docked where the pilot is, it docks under the readouts instead, and stays there while that is clear.
  assert.deepEqual(placeMeter(frame(600, 480, { dock: true }), layout, spot), { x: 600, y: top, docked: true, blocked: false, slot: 1, compact: false });
  assert.equal(placeMeter(frame(600, 300, { dock: true }), layout, spot).slot, 1, 'it never hops back with the pilot');
  spot.slot = -1;
  // A phone held upright, the pilot just above the handles: over the pilot, not on them, nor on the handles.
  const phone = createMeterLayout(4);
  addBox(phone, 12, 574, 84, 814);
  addBox(phone, 306, 574, 378, 814);
  phone.dock = 574;
  const upright = { width: 390, height: 844, dock: true };
  assert.deepEqual(placeMeter(frame(195, 300, upright), phone, spot), { x: 195, y: 574 - gap - below, docked: true, blocked: false, slot: 0, compact: false });
  assert.deepEqual(placeMeter(frame(195, 500, upright), phone, spot), { x: 195, y: top, docked: true, blocked: false, slot: 1, compact: false });
  spot.slot = -1;
  // No handles showing: it docks at the bottom, its word kept on the screen.
  assert.equal(placeMeter(frame(600, 300, { dock: true }), createMeterLayout(1), spot).y, 800 - gap - below);
  // A phone held sideways: the middle taken by the BAR and EARS buttons, it docks to a side clear of them.
  const sideways = createMeterLayout(4);
  addBox(sideways, 330, 110, 410, 158);
  sideways.dock = 110;
  sideways.top = 90;
  sideways.width = 240;
  spot.slot = -1;
  const clear = placeMeter(frame(370, 230, { width: 740, height: 304, dock: true }), sideways, spot);
  assert.equal(clear.slot, 2, 'top left');
  assert.ok(clear.x + 120 <= 330, 'clear of the buttons');
  // Handles reaching nearly to the top: it keeps its banner's room under the top edge.
  const tall = createMeterLayout(1);
  addBox(tall, 12, 60, 84, 380);
  tall.dock = 60;
  assert.equal(placeMeter(frame(195, 200, { width: 390, height: 400, dock: true }), tall, spot).y,
    margin + COMBO_METER.above + COMBO_METER.height);
});

test('docked for something in its way, it stays docked a moment before it goes back beside the pilot', () => {
  const f = fixture();
  f.move(MOVE.spiral, { side: 1, band: 3 });
  f.present();
  const blocked = createMeterLayout(2), clear = createMeterLayout(2);
  addBox(blocked, 500, 300, 900, 600);
  assert.equal(f.meter.place(frame(600, 480), blocked).docked, true);
  assert.equal(f.element.dataset.docked, 'true');
  // No handles measured: it docks at the bottom, leaving the word its room.
  const { gap, below, right, up, dwell } = COMBO_METER;
  assert.equal(f.element.style.transform, `translate(600px, ${800 - gap - below}px) translate(-50%, -100%)`);
  f.later(dwell - 1);
  assert.equal(f.meter.place(frame(600, 480), clear).docked, true);
  f.later(1);
  assert.equal(f.meter.place(frame(600, 480), clear).docked, false);
  assert.equal(f.element.dataset.docked, 'false');
  assert.equal(f.element.style.transform, `translate(${600 + right}px, ${480 - up - below}px) translate(0, -100%)`);
});

test('once a chain is in hand, observing, drawing and placing it make nothing', () => {
  assert.ok(arraysMadeBy(() => new Float32Array(1)) > 0, 'the counter sees what it should');
  const f = fixture();
  f.move(MOVE.wingover, { band: 2 });
  f.move(MOVE.spiral, { side: 1, band: 3, link: link('WING-SPIRAL'), flow: 1 });
  Object.assign(f.said, { word: 'PRECISE', until: 2 });
  f.present();
  Object.assign(f.said, { word: 'CLEAN', until: 3 });
  f.present();
  const layout = createMeterLayout(2);
  addBox(layout, 0, 0, 100, 100);
  const at = frame(600, 480);
  let made = 0;
  for (let n = 0; n < 240; n++) {
    at.x = 600 + (n % 7);
    made += arraysMadeBy(() => {
      f.meter.observe(f.style.state, f.state, 300 - n / 60);
      f.later(16);
      f.present();
      f.meter.place(at, layout);
    });
  }
  assert.equal(made, 0, `${made} arrays were made while the meter was drawn`);
  assert.equal(f.parts.banner.hidden, true, 'the banner and the word ran out while it was drawn');
  assert.equal(f.parts.word.hidden, true);
});

test('on a short landscape phone with no clear place for the whole card, it goes compact beside the BAR and EARS buttons, never over them', () => {
  // As measured at 740 × 304: the readouts down to 88, a handle in each bottom corner from 88 and
  // the BAR and EARS buttons in the middle from 110.
  const phone = createMeterLayout(4);
  addBox(phone, 12, 88, 84, 286);
  addBox(phone, 656, 88, 728, 286);
  addBox(phone, 309, 110, 431, 158);
  phone.dock = 88;
  phone.top = 88;
  phone.width = 240;
  const spot = { x: 0, y: 0, docked: false, blocked: false, slot: -1, compact: false };
  const placed = placeMeter(frame(370, 200, { width: 740, height: 304, dock: true }), phone, spot);
  assert.equal(placed.docked, true);
  assert.equal(placed.compact, true);
  const { compactWidth, compactHeight } = COMBO_METER;
  const left = placed.x - compactWidth / 2, right = placed.x + compactWidth / 2, top = placed.y - compactHeight;
  for (const [l, t, r, b] of [[12, 88, 84, 286], [656, 88, 728, 286], [309, 110, 431, 158]])
    assert.ok(right <= l || left >= r || placed.y <= t || top >= b, `clear of ${l}..${r} × ${t}..${b}: ${left}..${right} × ${top}..${placed.y}`);
  assert.ok(top >= 88, 'under the readouts');
  // With room for the whole card again it is whole.
  assert.equal(placeMeter(frame(370, 200, { width: 740, height: 304, dock: true }), createMeterLayout(1), spot).compact, false);
});
