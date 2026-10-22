import test from 'node:test';
import assert from 'node:assert/strict';
import { createStyle } from '../../../domains/good-lift/meet-style.ts';
import { createComboObserver, createComboPresenter, COMBO_FEEDBACK, type ComboPolicy } from './combo-feedback.ts';

const visible: ComboPolicy = { layout: 'coach', suppressed: false };
function fixture() {
  const style = createStyle();
  const watch = { clock: 0, moves: 0, moveKind: 1, moveBand: 1, moveSize: 1, breaks: 0, broke: 0, calm: 0 };
  const controls = { steered: false };
  const element = { hidden: true, className: '', dataset: {} as Record<string, string | undefined> };
  const label = { textContent: '' }, detail = { textContent: '' }, announce = { textContent: '' };
  let time = 0;
  const view = createComboPresenter({ element, label, detail, announce, now: () => time });
  const step = () => {
    watch.clock += 1 / 60;
    style.step(1 / 60, { watch: { state: watch }, controls });
    view.observe(style.state, watch.moveKind);
  };
  const move = (band = 1, kind = 1) => {
    Object.assign(watch, { moves: watch.moves + 1, moveBand: band, moveKind: kind, calm: 0 }); step();
  };
  return { style, watch, controls, view, element, label, detail, announce, step, move,
    time: (value: number) => { time = value; }, present: (policy = visible) => view.present(policy) };
}

test('real scored moves emit one event each and only the third link raises the multiplier', () => {
  const f = fixture(), events = [];
  for (let n = 0; n < 3; n++) {
    f.move();
    const before = structuredClone(f.style.state);
    events.push(f.present());
    assert.deepEqual(f.style.state, before, 'presentation cannot alter scoring');
    const beat = f.element.dataset.beat;
    assert.equal(f.present(), null, 'rendering again emits no repeated sound or celebration');
    assert.equal(f.element.dataset.beat, beat);
  }
  assert.deepEqual(events.map(event => [event!.phase, event!.points, event!.links]), [
    ['move', 10, 1], ['move', 10, 2], ['multiplier', 15, 3],
  ]);
  assert.equal(f.label.textContent, 'COMBO 3 · chain ×1.5');
  assert.equal(f.detail.textContent, 'PITCH +15 · 35 pending');
});

test('consecutive moves alternate animation identity once without a layout-read dependency', () => {
  const f = fixture(); f.move(); f.present(); const first = f.element.dataset.beat;
  f.move(); f.present(); const second = f.element.dataset.beat;
  assert.notEqual(first, second);
  assert.equal(f.element.dataset.phase, 'move', 'the same semantic phase can animate again');
  f.present(); assert.equal(f.element.dataset.beat, second, 'a render never restarts it');
});

test('an under-band catch refreshes links immediately while retaining all pending points', () => {
  const f = fixture();
  for (let n = 0; n < 3; n++) { f.move(); f.present(); }
  assert.equal(f.style.state.pending, 35);
  f.move(0);
  assert.equal(f.present(), null, 'restarting links is not a reward or loss event');
  assert.equal(f.label.textContent, 'COMBO 3 · chain ×1');
  assert.equal(f.detail.textContent, '35 pending');
  assert.equal(f.element.dataset.phase, 'pending');
  assert.equal(f.style.state.lost, 0);
});

test('a link reset before the next render discards a queued multiplier celebration', () => {
  const f = fixture(); f.move(); f.present(); f.move(); f.present(); f.move(); f.move(0);
  assert.equal(f.present(), null);
  assert.equal(f.label.textContent, 'COMBO 3 · chain ×1');
});

test('stable recovery banks once, announces independently, and ends its label after 1.6 seconds', () => {
  const f = fixture();
  for (let n = 0; n < 3; n++) { f.move(); f.present(); }
  f.watch.calm = 1; f.step();
  const event = f.present();
  assert.equal(event!.phase, 'banked'); assert.equal(event!.points, 35);
  assert.equal(f.label.textContent, 'COMBO BANKED · +35 STYLE');
  assert.equal(f.announce.textContent, '', 'the persistent region is cleared before a new bank');
  f.time(COMBO_FEEDBACK.announce); f.present();
  assert.equal(f.announce.textContent, 'Combo banked. 35 style. Score multiplier 1.03.');
  f.time(COMBO_FEEDBACK.banked - 1); f.present(); assert.equal(f.element.hidden, false);
  f.time(COMBO_FEEDBACK.banked); f.present(); assert.equal(f.element.hidden, true);
  assert.equal(f.announce.textContent, ''); assert.equal(f.style.state.total, 35);
});

test('a bank survives several fixed steps before a render without emitting again afterward', () => {
  const f = fixture(); f.move(); f.present(); f.watch.calm = 1;
  f.step(); f.step(); f.step();
  assert.equal(f.present()!.phase, 'banked');
  f.step(); assert.equal(f.present(), null);
});

test('suppressed events produce no deferred celebration or announcement when pending facts return', () => {
  for (const policy of [{ layout: 'hidden' as const, suppressed: false }, { layout: 'coach' as const, suppressed: true }]) {
    const f = fixture(); f.move();
    assert.equal(f.present(policy), null); assert.equal(f.element.hidden, true);
    assert.equal(f.present(), null); assert.equal(f.element.hidden, false);
    assert.equal(f.element.dataset.phase, 'pending'); assert.equal(f.label.textContent, 'PITCH');
    f.watch.calm = 1; f.step(); f.present(policy);
    f.time(200); assert.equal(f.present(), null);
    assert.equal(f.element.hidden, true); assert.equal(f.announce.textContent, '');
  }
});

test('an overlay or visibility clear cancels an active bank and its delayed announcement', () => {
  const f = fixture(); f.move(); f.present(); f.watch.calm = 1; f.step(); f.present();
  f.view.clear(); f.time(200); f.present();
  assert.equal(f.element.hidden, true); assert.equal(f.announce.textContent, '');
});

test('actual failure has quiet loss feedback, while assistance, ears and unfinished endings clear silently', () => {
  const failed = fixture(); failed.move(); failed.present();
  Object.assign(failed.watch, { breaks: 1, broke: 1 }); failed.step();
  assert.equal(failed.present()!.phase, 'lost');
  assert.equal(failed.label.textContent, 'COMBO ENDED'); assert.equal(failed.detail.textContent, 'recover calmly');
  for (const reason of ['assistance', 'ears', 'end']) {
    const f = fixture(); f.move(); f.present();
    if (reason === 'assistance') { f.controls.steered = true; f.step(); }
    else if (reason === 'ears') { Object.assign(f.watch, { breaks: 1, broke: 5 }); f.step(); }
    else { f.style.finish(); f.view.observe(f.style.state); }
    assert.equal(f.present(), null, reason); assert.equal(f.element.hidden, true, reason);
    assert.equal(f.style.state.total, 0); assert.equal(f.style.state.lost, 0);
  }
});

test('timing, raw peaks and repeatedly sampled state never invent a scored move', () => {
  const f = fixture(); Object.assign(f.watch, { timed: 9, tops: 7, chain: 12, quality: 2 });
  f.step(); assert.equal(f.present(), null); assert.equal(f.element.hidden, true);
  const observer = createComboObserver();
  const snapshot = Object.freeze({ ...f.style.state });
  assert.equal(observer.observe(snapshot), null); assert.equal(observer.observe(snapshot), null);
});

test('retry resets transient state and standalone feedback uses the same compact facts', () => {
  const f = fixture(); f.move(); f.present(); f.view.reset(); f.style.reset();
  assert.equal(f.element.hidden, true); assert.equal(f.announce.textContent, '');
  f.move(1, 3);
  assert.equal(f.present({ layout: 'standalone', suppressed: false })!.phase, 'move');
  assert.equal(f.label.textContent, 'LOOP · +60');
});
