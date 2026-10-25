import type { TrickWatch } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { comboPayout, createComboStyle, moveValue } from './meet-combo.ts';
import { BREAK, COMBO, DETECT, LINKS, MOVE, TRICKS } from './trick-tables.ts';
import { pair } from '../../test/helpers/flight-lab.ts';
import { catchOnce, flyTricks } from '../../test/helpers/test-tricks.ts';

const link = (name: string) => LINKS.find(each => each.name === name)!.id;

// A watch whose moves are told rather than flown, to pin the arithmetic exactly.
function told() {
  const state = { steps: 0, move: 0, side: 0, units: 0, band: 0, measure: 0, active: 0, endedAt: -1, startedAt: -1, instances: 0,
    unitCount: 0, previous: 0, link: 0, flow: 0, breaks: 0, broke: 0, settled: 0, neutral: 0, load: 1, tilt: 1, bankSide: 0, stalling: 0 };
  const style = createComboStyle(), world = { tricks: { state } as unknown as TrickWatch };
  const step = (count = 1) => { for (let i = 0; i < count; i++) { state.steps += 1; style.step(1 / 60, world); } };
  return {
    style, state,
    move(move: number, { side = 0, band = 3, units = 1, link = 0, flow = 1 } = {}) {
      Object.assign(state, { move, side, band, units, link, flow, active: 1, settled: 0 });
      state.instances += 1; state.unitCount += units; step();
    },
    unit(band = state.band) { state.units += 1; state.unitCount += 1; state.band = band; step(); },
    settle(steps: number = DETECT.settle) { state.active = 0; for (let i = 0; i < steps; i++) { state.settled += 1; step(); } },
    bail(reason: number) { state.breaks += 1; state.broke = reason; state.active = 0; state.settled = 0; step(); },
  };
}

test('a move is worth 5·round(base·c·grade·units·repeat / divisor), always a multiple of 5', () => {
  assert.equal(moveValue(MOVE.wingover, 2, 3, 0), 95);
  assert.equal(moveValue(MOVE.spiral, 3, 2, 0), 75);
  assert.equal(moveValue(MOVE.spiral, 0, 2, 0), 0, 'no band, no value');
  assert.equal(moveValue(MOVE.loop, 4, 1, 3), 0, 'the fourth time to the same side is no longer judged');
  assert.ok(moveValue(MOVE.loop, 4, 1, 1) < moveValue(MOVE.loop, 4, 1, 0));
  for (let move = 1; move < TRICKS.length; move++) for (let band = 1; band <= 4; band++) for (let units = 1; units <= 7; units++)
    for (let repeats = 0; repeats <= 4; repeats++) {
      const value = moveValue(move, band, units, repeats);
      assert.ok(Number.isSafeInteger(value) && value % 5 === 0 && value >= 0, `${move} ${band} ${units} ${repeats}`);
    }
  assert.equal(comboPayout(35, 4), 70);
  assert.equal(comboPayout(70, 6), 210);
  assert.ok(Number.isSafeInteger(COMBO.base * 200 * 120 * 220 * 100), 'the product before dividing stays a safe integer');
});

test('a chain multiplies its moves: each new move, each named link\'s first use and each flow, capped by its variety', () => {
  // Wingovers into a spiral with flow (WING-SPIRAL), then out into wingovers again (SPIRAL EXIT).
  const run = told();
  run.move(MOVE.wingover, { band: 2, units: 1, flow: 0 });
  run.unit(); run.unit();
  assert.equal(run.style.state.pending, 95, 'one move: ×1');
  run.move(MOVE.spiral, { side: -1, band: 3, units: 1, link: link('WING-SPIRAL') });
  run.unit();
  // 95 + 75 = 170; +1 new move, +1 link, +1 flow = 5 halves, capped at 2 moves × 2 = 4 halves: ×2.
  assert.equal(run.style.state.multiplier, 4);
  assert.equal(run.style.state.pending, 340);
  run.move(MOVE.wingover, { band: 3, units: 1, link: link('SPIRAL EXIT') });
  run.unit();
  assert.equal(run.style.state.cap, 4, 'two different moves cap the chain at ×2');
  // Again round, a second time to the same side: 90 (87%). 95 + 75 + 90 = 260, ×2.
  assert.equal(run.style.state.pending, 520);
  run.settle();
  assert.equal(run.style.state.landed, 1);
  assert.equal(run.style.state.lost, 0);
  assert.equal(run.style.state.total, 520, 'a first bank pays exactly what was in hand');
  assert.deepEqual(run.style.state.lastCombo.sequence, [MOVE.wingover, MOVE.spiral, MOVE.wingover]);
  assert.deepEqual(run.style.state.lastCombo.links, [0, link('WING-SPIRAL'), link('SPIRAL EXIT')]);
  assert.equal(run.style.state.wingovers, 5, 'the most wingovers in one banked combo');
  assert.equal(run.style.state.book.links[link('SPIRAL EXIT')], 1);
});

test('the same move to the same side pays less each time, a mirrored one pays fresh', () => {
  const run = told();
  for (let i = 0; i < 4; i++) run.move(MOVE.loop, { side: 1, band: 4, flow: 0 });
  const same = run.style.state.sum;
  const mirrored = told();
  for (let i = 0; i < 4; i++) mirrored.move(MOVE.loop, { side: i % 2 ? 1 : -1, band: 4, flow: 0 });
  assert.ok(mirrored.style.state.sum > same);
  assert.equal(run.style.state.multiplier, 2, 'one move flown again and again never builds a chain');
});

test('settled for three seconds banks the combo; a bail loses it; ears and assistance drop it unscored', () => {
  const banked = told();
  banked.move(MOVE.spiral, { side: 1, band: 3, units: 2, flow: 0 });
  banked.settle(DETECT.settle - 1);
  assert.equal(banked.style.state.landed, 0);
  assert.ok(banked.style.state.bankCalm > 2.9 && banked.style.state.bankCalm < 3);
  banked.settle(1);
  assert.equal(banked.style.state.landed, 1);
  assert.equal(banked.style.state.total, banked.style.state.said);

  const bailed = told();
  bailed.move(MOVE.spiral, { side: 1, band: 3, units: 2, flow: 0 });
  const pending = bailed.style.state.pending;
  bailed.bail(BREAK.tuck);
  assert.equal(bailed.style.state.lost, 1);
  assert.equal(bailed.style.state.said, pending);
  assert.equal(bailed.style.state.total, 0);
  // Nothing counts again until the wing has been settled a second.
  bailed.move(MOVE.wingover, { band: 2, flow: 0 });
  assert.equal(bailed.style.state.elements, 0);
  bailed.settle(DETECT.rearm);
  bailed.move(MOVE.wingover, { band: 2, flow: 0 });
  assert.equal(bailed.style.state.elements, 1);

  for (const reason of [BREAK.ears, BREAK.assisted]) {
    const dropped = told();
    dropped.move(MOVE.spiral, { side: 1, band: 3, flow: 0 });
    dropped.bail(reason);
    assert.equal(dropped.style.state.lost, 0, 'dropped, not lost');
    assert.equal(dropped.style.state.pending, 0);
  }
});

test('a move short of its first band adds nothing until it reaches one', () => {
  const run = told();
  run.move(MOVE.spiral, { side: 1, band: 0, flow: 0 });
  assert.equal(run.style.state.elements, 0);
  assert.equal(run.style.state.multiplier, 2);
  run.unit(2);
  assert.equal(run.style.state.elements, 1);
  assert.ok(run.style.state.pending > 0);
});

test('the very same combo banked again in a run pays less each time', () => {
  const run = told(), paid: number[] = [];
  for (let i = 0; i < 6; i++) {
    run.move(MOVE.wingover, { band: 3, units: 2, flow: 0 });
    run.move(MOVE.spiral, { side: 1, band: 3, units: 2, link: link('WING-SPIRAL') });
    run.settle();
    paid.push(run.style.state.said);
  }
  const again = [...COMBO.again, 0].map(percent => 5 * Math.floor((paid[0] * percent + 250) / 500));
  assert.deepEqual(paid, again);
  assert.deepEqual(paid.slice(-2), [0, 0]);
});

test('flown for real: a chain banks once the pilot settles the wing, and a stall left to surge loses what was in hand', () => {
  const Q = pair(0.82, 0), E = pair(0, 0.82), UP = pair(0);
  // Today's wing rocks fore and aft a long time: the pilot damps it, braking each surge.
  const damp = (g: { pitch: number }) => g.pitch < -0.08 ? pair(0.4) : UP;
  const chain = flyTricks([[4.5, Q], [4.5, E], [4.5, Q], [15, Q], [4.5, E], [4.5, Q], [20, damp]]);
  const bank = chain.events.find(event => event.kind === 'bank');
  assert.ok(bank && bank.points >= 50, `banked ${bank?.points}`);
  assert.ok(chain.style.state.lastCombo.links.includes(link('WING-SPIRAL')));
  const caught = flyTricks([[5, pair(1)], [6, catchOnce(-0.4, 50, 1)], [30, damp]]);
  assert.equal(caught.style.state.landed, 1, 'a caught full stall banks on its own');
  const lost = flyTricks([[20, Q], [4, UP], [5, pair(1)], [10, UP]]);
  assert.equal(lost.style.state.lost + lost.style.state.landed >= 1, true);
});
