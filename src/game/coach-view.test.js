import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoachView } from './coach-view.js';

// A small DOM boundary records writes; real layout and native input handling are browser QA.
class Node {
  constructor(document) {
    this.ownerDocument = document; this.children = []; this.dataset = {}; this.style = {};
    this.attributes = new Map(); this.selectors = new Map(); this.writes = 0; this._text = ''; this._hidden = false;
    const classes = new Set();
    this.classList = { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  }
  get textContent() { return this._text; }
  set textContent(value) { this.writes++; this._text = value; }
  get hidden() { return this._hidden; }
  set hidden(value) { this.writes++; this._hidden = value; }
  set innerHTML(value) { throw new Error('The coach must use textContent'); }
  append(...nodes) { this.children.push(...nodes); }
  querySelector(selector) { return this.selectors.get(selector) ?? null; }
  querySelectorAll() { return this.children; }
  setAttribute(name, value) { this.writes++; this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}
function fixture() {
  const document = { createElement: () => new Node(document) };
  const element = new Node(document), touch = new Node(document), parts = {};
  for (const name of ['action', 'reason', 'controls', 'feedback', 'progress', 'announce']) {
    parts[name] = new Node(document); element.selectors.set(`[data-coach="${name}"]`, parts[name]);
  }
  parts.kicker = new Node(document); element.selectors.set('.fj-coach-kicker', parts.kicker);
  parts.caption = new Node(document); parts.fill = new Node(document);
  parts.progress.selectors.set('span', parts.caption); parts.progress.selectors.set('i > b', parts.fill);
  for (const name of ['left', 'right', 'brake', 'bar', 'ears']) {
    const button = new Node(document); button.dataset.input = name; touch.append(button);
    if (name === 'brake') button.selectors.set('small', new Node(document));
  }
  let raw = {}, touchMode = false, time = 0;
  const view = createCoachView({ element, touch, input: () => raw, touchMode: () => touchMode, now: () => time });
  const chip = name => parts.controls.children.find(child => child.dataset.control === name);
  const button = name => touch.children.find(child => child.dataset.input === name);
  return { view, element, touch, parts, chip, button, raw: value => { raw = value; }, touchMode: value => { touchMode = value; }, time: value => { time = value; } };
}
const reverse = Object.freeze({ state: 'timing', context: 'Wingover', phase: 'Reverse now', action: 'left', title: 'RELEASE RIGHT, THEN LEFT', detail: 'Swap with the swing.', hold: Object.freeze(['left']), release: Object.freeze(['right']) });

test('explicit release and hold instructions reflect keyboard input without changing the message or controls', () => {
  const f = fixture(), raw = Object.freeze({ right: true, left: false }); f.raw(raw);
  f.view.update(reverse);
  assert.equal(f.element.hidden, false);
  assert.equal(f.parts.kicker.textContent, 'Wingover · Reverse now');
  assert.equal(f.parts.action.textContent, 'RELEASE RIGHT, THEN LEFT');
  assert.equal(f.chip('right').children[0].textContent, 'Release right');
  assert.equal(f.chip('left').children[0].textContent, 'Hold left');
  assert.equal(f.chip('left').children[1].textContent, '← / A');
  assert.equal(f.button('right').classList.contains('held'), true);
  assert.equal(f.button('right').dataset.coachAction, 'release');
  assert.equal(f.button('left').dataset.coachAction, 'hold');
  assert.equal(f.button('right').getAttribute('aria-pressed'), 'true');
  assert.equal(f.parts.feedback.hidden, true, 'a held input is not credited as good timing');
  f.raw(Object.freeze({ left: true, right: false })); f.view.update(reverse);
  assert.equal(f.chip('left').children[0].textContent, 'Holding left');
  assert.equal(f.chip('right').children[0].textContent, 'right released');
  assert.equal(f.button('right').dataset.coachAction, '');
  assert.equal(f.button('right').classList.contains('held'), false);
  assert.equal(raw.right, true); assert.deepEqual(reverse.hold, ['left']);
});
test('touch symbols and held feedback use the same raw inputs; all-release recovery stays compact', () => {
  const f = fixture(); f.touchMode(true); f.raw({ left: true }); f.view.update(reverse);
  assert.equal(f.chip('left').children[1].textContent, '◀');
  const handsUp = { state: 'recover', context: 'Recovery', action: 'release-all', title: 'HANDS UP', hold: [], release: ['left', 'right', 'brake', 'bar', 'ears'] };
  f.view.update(handsUp);
  assert.equal(f.chip('left').children[0].textContent, 'Release left');
  assert.equal(f.chip('right').hidden, true);
  f.raw({}); f.view.update(handsUp);
  assert.ok(f.parts.controls.children.slice(0, 5).every(chip => chip.hidden));
  assert.equal(f.parts.controls.children[5].textContent, 'Controls released');
  assert.equal(f.parts.controls.children[5].hidden, false);
});
test('the existing two-steering-key bar chord is visible without claiming either key was released', () => {
  const f = fixture(); f.raw({ left: true, right: true });
  f.view.update({ state: 'building', context: 'Flight', action: 'none', title: 'Current controls', hold: [], release: [] });
  assert.equal(f.button('left').classList.contains('held'), true);
  assert.equal(f.button('right').classList.contains('held'), true);
  assert.equal(f.button('bar').classList.contains('held'), true);
  assert.equal(f.chip('bar').children[0].textContent, 'Holding bar');
});
test('releasing a touch pointer cannot hide a control still held by the keyboard', () => {
  const f = fixture(); f.raw({ left: true }); f.view.update(reverse);
  f.button('left').classList.remove('held'); // the pointer boundary releases its own holder
  f.view.update(reverse);
  assert.equal(f.button('left').classList.contains('held'), true);
  assert.equal(f.button('left').getAttribute('aria-pressed'), 'true');
});
test('the same brake button presents normal and deep input with explicit text and shortcut advice', () => {
  const f = fixture();
  const shape = { state: 'building', context: 'Pitch', action: 'deep-brake', brakeDepth: 'deep',
    title: 'DOUBLE-TAP + HOLD BRAKE', hold: ['brake'], release: ['bar'] };
  f.view.update(shape);
  assert.equal(f.chip('brake').children[0].textContent, 'Double-tap + hold brake');
  assert.equal(f.chip('brake').children[1].textContent, 'Space twice / X');
  assert.equal(f.button('brake').dataset.brakeAdvice, 'deep');
  f.raw({ brake: true }); f.view.update(shape);
  assert.equal(f.button('brake').dataset.brakeDepth, 'working');
  assert.equal(f.button('brake').querySelector('small').textContent, 'normal brake');
  assert.equal(f.chip('brake').children[0].textContent, 'Release, then double-tap + hold');
  f.raw({ brake: true, deepBrake: true }); f.view.update(shape);
  assert.equal(f.button('brake').dataset.brakeDepth, 'deep');
  assert.equal(f.button('brake').querySelector('small').textContent, 'DEEP BRAKE');
  assert.match(f.button('brake').getAttribute('aria-label'), /Deep brake held/);
  assert.equal(f.chip('brake').children[0].textContent, 'Holding deep brake');
  f.view.update({ ...shape, action: 'brake', brakeDepth: 'working', title: 'PRESS BRAKE' });
  assert.equal(f.chip('brake').children[0].textContent, 'Release deep brake');
  assert.equal(f.button('brake').dataset.coachAction, 'release', 'a deep hold does not fulfil a working catch');
  f.view.update(null);
  assert.equal(f.button('brake').dataset.coachAction, '');
  assert.equal(f.button('brake').dataset.brakeDepth, 'deep', 'quiet coaching still shows the real held depth');
  f.raw({ brake: true, deepBrake: true, ears: true }); f.view.update(null);
  assert.equal(f.button('brake').dataset.brakeDepth, 'working', 'ears suppress deep treatment even for retained gesture intent');
  assert.equal(f.button('brake').querySelector('small').textContent, 'normal brake');
  f.raw({}); f.view.update(null);
  assert.equal(f.button('brake').dataset.brakeDepth, '');
  assert.equal(f.button('brake').querySelector('small').textContent, 'brake');
});
test('progress is shown only with an explicit meaning and remains finite and accessible', () => {
  const f = fixture(); f.view.update({ ...reverse, progress: 0.8 });
  assert.equal(f.parts.progress.hidden, true, 'no generic strength or completion bar');
  f.view.update({ ...reverse, progress: 0.6, progressLabel: 'STEADY FLIGHT · 1s' });
  assert.equal(f.parts.progress.hidden, false); assert.equal(f.parts.caption.textContent, 'STEADY FLIGHT · 0.6 / 1.0 s');
  assert.equal(f.parts.fill.style.transform, 'scaleX(0.6)');
  assert.equal(f.parts.progress.getAttribute('aria-valuenow'), '60');
  assert.equal(f.parts.progress.getAttribute('aria-label'), 'STEADY FLIGHT · 0.6 / 1.0 s');
  f.view.update({ ...reverse, progress: NaN, progressLabel: 'Hold steady' });
  assert.equal(f.parts.fill.style.transform, 'scaleX(0)');
  f.view.update({ ...reverse, progress: 7, progressLabel: 'Hold steady' });
  assert.equal(f.parts.fill.style.transform, 'scaleX(1)');
});
test('only semantic instructions are announced; numerical progress and raw held-title changes stay quiet', () => {
  const f = fixture();
  f.view.update(reverse);
  const first = f.parts.announce.textContent, writes = f.parts.announce.writes;
  f.time(100); f.raw({ left: true });
  f.view.update({ ...reverse, title: 'HOLD LEFT', progress: 0.7, progressLabel: 'Steady 0.7 s' });
  assert.equal(f.parts.announce.textContent, first); assert.equal(f.parts.announce.writes, writes);
  f.view.update({ ...reverse, state: 'building', phase: 'Building', action: 'right', title: 'HOLD RIGHT' });
  assert.equal(f.parts.announce.textContent, first, 'normal changes are briefly coalesced');
  f.time(801); f.view.update({ ...reverse, state: 'building', phase: 'Building', action: 'right', title: 'HOLD RIGHT' });
  assert.match(f.parts.announce.textContent, /HOLD RIGHT/);
  f.time(802); f.view.update({ ...reverse, state: 'recover', phase: 'Release', action: 'release-all', title: 'HANDS UP' });
  assert.match(f.parts.announce.textContent, /HANDS UP/, 'urgent recovery does not wait behind chatter');
});
test('stable frames reuse DOM and reset/dispose clear advice without touching input', () => {
  const f = fixture(); f.raw({ right: true }); f.view.update(reverse);
  const chips = [...f.parts.controls.children], textWrites = f.parts.action.writes + f.parts.reason.writes + f.parts.progress.writes;
  for (let i = 0; i < 50; i++) f.view.update(reverse);
  assert.deepEqual(f.parts.controls.children, chips);
  assert.equal(f.parts.action.writes + f.parts.reason.writes + f.parts.progress.writes, textWrites);
  f.view.reset(); assert.equal(f.element.hidden, true); assert.equal(f.parts.announce.textContent, '');
  assert.ok(f.touch.children.every(b => b.dataset.coachAction === '' && !b.classList.contains('held')));
  f.view.update(reverse); assert.equal(f.button('right').classList.contains('held'), true, 'reset never releases a real key');
  f.view.dispose(); f.view.dispose(); f.view.update(reverse); assert.equal(f.element.hidden, true);
});
test('message text remains literal even when a title contains markup', () => {
  const f = fixture(); f.view.update({ ...reverse, title: '<img src=x onerror=attack()>', detail: '<b>literal</b>' });
  assert.equal(f.parts.action.textContent, '<img src=x onerror=attack()>');
  assert.equal(f.parts.reason.textContent, '<b>literal</b>');
});
test('a warning marks secondary feedback without replacing the chosen action and clears on reset', () => {
  const f = fixture(); f.view.update({ ...reverse, warning: true, feedback: 'FOG CLOSING · Keep climbing.' });
  assert.equal(f.element.dataset.warning, 'true');
  assert.equal(f.parts.action.textContent, reverse.title);
  assert.equal(f.parts.feedback.textContent, 'FOG CLOSING · Keep climbing.');
  f.view.update(reverse); assert.equal(f.element.dataset.warning, 'false');
  f.view.reset(); assert.equal(f.element.dataset.warning, '');
});
test('soaring activity headers stay stable across instructions, phases and safety warnings', () => {
  const f = fixture();
  for (const [activity, label] of [['ridge-soaring', 'RIDGE SOARING'], ['thermalling', 'THERMALLING'], ['soaring-turn', 'SOARING TURN']]) {
    const initial = { ...reverse, state: 'lift', activity, context: 'Current lift', phase: 'Find the line' };
    f.view.update(initial);
    assert.equal(f.parts.kicker.textContent, label);
    f.view.update({ ...initial, action: 'right', title: 'TURN RIGHT', phase: 'Stay with lift' });
    assert.equal(f.parts.kicker.textContent, label);
    assert.equal(f.parts.action.textContent, 'TURN RIGHT');
    f.view.update({ ...initial, context: 'Fog closing', phase: 'Keep climbing', warning: true,
      warningLabel: 'FOG CLOSING', feedback: 'Keep climbing above the fog.' });
    assert.equal(f.parts.kicker.textContent, label, 'safety belongs beside its detail, not in the activity header');
    assert.equal(f.parts.feedback.textContent, 'FOG CLOSING · Keep climbing above the fog.');
    assert.equal(f.parts.action.textContent, reverse.title);
    assert.match(f.parts.announce.textContent, /FOG CLOSING · Keep climbing above the fog/);
  }
  f.view.update(reverse);
  assert.equal(f.parts.kicker.textContent, 'Wingover · Reverse now', 'reactive tricks keep their own context and phase');
});
test('a warning-only semantic card works without a soaring activity', () => {
  const f = fixture();
  f.view.update({ state: 'hazard', context: 'Flight safety', title: 'CLIMB ABOVE THE FOG',
    warning: true, warningLabel: 'FOG CLOSING', feedback: 'The fog is rising below you.', hold: [], release: [] });
  assert.equal(f.element.hidden, false);
  assert.equal(f.parts.kicker.textContent, 'Flight safety');
  assert.equal(f.parts.action.textContent, 'CLIMB ABOVE THE FOG');
  assert.equal(f.parts.feedback.textContent, 'FOG CLOSING · The fog is rising below you.');
  assert.equal(f.parts.controls.hidden, true);
  assert.equal(f.parts.progress.hidden, true);
});
test('quiet transit clears recommended highlights while preserving held keys and the bar chord', () => {
  const f = fixture(), raw = Object.freeze({ left: true, right: true });
  f.raw(raw); f.view.update(reverse);
  assert.equal(f.button('left').dataset.coachAction, 'hold');
  assert.equal(f.button('right').dataset.coachAction, 'release');
  f.view.update(null);
  assert.equal(f.element.hidden, true);
  assert.equal(f.parts.controls.hidden, true);
  assert.equal(f.parts.announce.textContent, '');
  for (const name of ['left', 'right', 'brake', 'bar', 'ears']) {
    assert.equal(f.button(name).dataset.coachAction, '');
    assert.equal(f.chip(name).dataset.advice, '');
    assert.equal(f.chip(name).hidden, true);
    const held = ['left', 'right', 'bar'].includes(name);
    assert.equal(f.button(name).classList.contains('held'), held);
    assert.equal(f.button(name).getAttribute('aria-pressed'), String(held));
  }
  f.raw({}); f.view.update(null);
  assert.ok(f.touch.children.every(b => !b.classList.contains('held')));
  f.view.update(reverse);
  assert.equal(f.button('left').dataset.coachAction, 'hold', 'a newly active coach can recommend again');
  assert.deepEqual(raw, { left: true, right: true });
});
