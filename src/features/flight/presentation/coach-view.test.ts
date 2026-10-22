import type { FlightInput } from '../../../domains/flight/models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { coachGesture, createCoachView } from './coach-view.ts';
import { actionMessage } from '../../../domains/coaching/coach-actions.ts';
import { keyboardBrakes } from '../../../domains/flight/brake-input.ts';

test('device captions expose reachable normal, thermal, wingover and loop demands', () => {
  const target = (left: number, right: number) => ({ brakeTargets: { left, right, tolerance: 0.07 } });
  assert.equal(coachGesture(target(0.3, 0), 'left', 'hold', 'keyboard'), 'A / ←');
  assert.equal(coachGesture(target(0.5, 0.2), 'left', 'hold', 'keyboard'), 'A + W · circle');
  assert.equal(coachGesture(target(0.5, 0.2), 'brake', 'hold', 'keyboard'), 'W · gentle both brakes');
  assert.equal(coachGesture(target(0.5, 0.2), 'right', 'release', 'keyboard'), 'release D / →');
  assert.equal(coachGesture(target(0.2, 0.2), 'brake', 'hold', 'keyboard'), 'W · gentle both brakes');
  assert.equal(coachGesture(target(0.82, 0), 'left', 'hold', 'keyboard'), 'Q · swing brake');
  assert.equal(coachGesture(target(0, 1), 'right', 'hold', 'keyboard'), 'Shift + D');
  assert.equal(coachGesture(target(0, 0), 'brake', 'release', 'keyboard'), 'release the keys');
  assert.equal(coachGesture(target(0.6, 0.6), 'brake', 'hold', 'touch'), 'pull both handles down');
  assert.equal(coachGesture(target(0, 0), 'right', 'release', 'touch'), 'lift right thumb');
});

test('thermal approach and alignment use ordinary turn keys until both brakes are requested', () => {
  for (const phase of ['approach', 'align']) for (const side of ['left', 'right'] as const) {
    const message = { context: 'thermal', phase, action: side, hold: [side], release: [side === 'left' ? 'right' : 'left', 'bar'] };
    assert.equal(coachGesture(message, side, 'hold', 'keyboard'), side === 'left' ? 'A / ←' : 'D / →');
    assert.equal(coachGesture({ ...message, brakeTargets: { left: side === 'left' ? 0.3 : 0, right: side === 'right' ? 0.3 : 0, tolerance: 0.07 } }, side, 'hold', 'keyboard'), side === 'left' ? 'A / ←' : 'D / →');
    assert.equal(coachGesture({ ...message, phase: 'circle', hold: [side, 'brake'] }, side, 'hold', 'keyboard'), side === 'left' ? 'A + W · circle' : 'D + W · circle');
  }
});

test('easing full brake into a recovery catch requests the reachable working shortcut', () => {
  const request = actionMessage({ action: 'brake', state: 'recover', brakeDepth: 'working' },
    { controlMode: 'brakes', leftBrake: 1, rightBrake: 1 });
  assert.equal(coachGesture(request, 'brake', 'release', 'keyboard', true), 'release Shift · keep Space');
  const working = { controlMode: 'brakes' as const, ...keyboardBrakes(new Set(['Space'])) };
  assert.equal(actionMessage(request, working).accepted, true);
  const tooShallow = { controlMode: 'brakes' as const, ...keyboardBrakes(new Set(['KeyW'])) };
  assert.equal(actionMessage(request, tooShallow).accepted, false);
});

// A small DOM boundary records writes; real layout and native input handling are browser QA.
class Node {
  ownerDocument: { createElement(): Node }; children: Node[]; dataset: Record<string, string | undefined>; style: { transform: string };
  attributes: Map<string, string>; selectors: Map<string, Node>; writes: number; _text: string; _hidden: boolean; className = '';
  constructor(document: { createElement: () => Node; }) {
    this.ownerDocument = document; this.children = []; this.dataset = {}; this.style = { transform: '' };
    this.attributes = new Map(); this.selectors = new Map(); this.writes = 0; this._text = ''; this._hidden = false;
  }
  get textContent() { return this._text; }
  set textContent(value: string) { this.writes++; this._text = value; }
  get hidden() { return this._hidden; }
  set hidden(value: boolean) { this.writes++; this._hidden = value; }
  set innerHTML(value: string) { throw new Error('The coach must use textContent'); }
  append(...nodes: Node[]) { this.children.push(...nodes); }
  querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
  setAttribute(name: string, value: string) { this.writes++; this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
}
function fixture(warning = false, canAnnounce = () => true) {
  const document = { createElement: () => new Node(document) };
  const element = new Node(document), parts: Record<string, Node> = {};
  for (const name of ['action', 'reason', 'controls', 'feedback', 'acknowledgement', 'progress', 'announce', 'cancel']) {
    parts[name] = new Node(document); element.selectors.set(`[data-coach="${name}"]`, parts[name]);
  }
  if (warning) { parts.warning = new Node(document); element.selectors.set('[data-coach="warning"]', parts.warning); }
  parts.kicker = new Node(document); element.selectors.set('.fj-coach-kicker', parts.kicker);
  parts.caption = new Node(document); parts.fill = new Node(document);
  parts.progress.selectors.set('span', parts.caption); parts.progress.selectors.set('i > b', parts.fill);
  let raw: FlightInput = {}, time = 0;
  const view = createCoachView({ element, input: () => raw, now: () => time, canAnnounce });
  const chip = (name: string) => parts.controls.children.find((child) => child.dataset.control === name)!;
  return { view, element, parts, chip, raw: (value: FlightInput) => { raw = value; }, time: (value: number) => { time = value; } };
}
const reverse = Object.freeze({ state: 'timing', context: 'Wingover', phase: 'Reverse now', action: 'left', title: 'RELEASE RIGHT, THEN LEFT', detail: 'Swap with the swing.', hold: Object.freeze(['left']), release: Object.freeze(['right']) });

test('coach chips describe drags and easing without keyboard or double-tap instructions', () => {
  const f = fixture(), raw = { controlMode: 'brakes' as const, leftBrake: .3, rightBrake: 0 };
  f.raw(raw);
  f.view.update(actionMessage({ action: 'left', hold: ['left', 'brake'], brakeDepth: 'working', release: ['right', 'bar'] }, raw));
  assert.equal(f.chip('left').children[0].textContent, 'Pulling left brake');
  assert.equal(f.chip('left').children[1].textContent, 'drag left');
  assert.equal(f.chip('left').children[1].className, 'fj-coach-gesture');
  assert.equal(f.chip('brake').hidden, true, 'one hand is never labelled as both brakes');
  const deep = { controlMode: 'brakes' as const, leftBrake: 1, rightBrake: 1 };
  f.raw(deep);
  f.view.update(actionMessage({ action: 'brake', brakeDepth: 'working' }, deep));
  assert.equal(f.chip('brake').children[0].textContent, 'Ease the pull to working range');
  assert.equal(f.chip('brake').children[1].textContent, 'ease toward center');
  const working = { controlMode: 'brakes' as const, leftBrake: .6, rightBrake: .6 };
  f.raw(working); f.view.update(actionMessage({ action: 'deep-brake' }, working));
  assert.equal(f.chip('brake').children[0].textContent, 'Pull both brakes deeper');
  assert.equal(f.chip('brake').children[1].textContent, 'drag down');
});
test('explicit release and hold instructions reflect brake pairs without changing the message or controls', () => {
  const f = fixture(), raw = Object.freeze({ controlMode: 'brakes' as const, leftBrake: 0, rightBrake: .3 });
  f.raw(raw); f.view.update(reverse);
  assert.equal(f.element.hidden, false);
  assert.equal(f.parts.kicker.textContent, 'Wingover · Reverse now');
  assert.equal(f.parts.action.textContent, 'RELEASE RIGHT, THEN LEFT');
  assert.equal(f.chip('right').children[0].textContent, 'Release right brake');
  assert.equal(f.chip('right').children[1].textContent, 'ease right');
  assert.equal(f.chip('left').children[0].textContent, 'Pull left brake');
  assert.equal(f.chip('left').children[1].textContent, 'drag left');
  assert.equal(f.parts.feedback.hidden, true, 'a held input is not credited as good timing');
  f.raw({ controlMode: 'brakes' as const, leftBrake: .3, rightBrake: 0 }); f.view.update(reverse);
  assert.equal(f.chip('left').children[0].textContent, 'Pulling left brake');
  assert.equal(f.chip('right').hidden, true, 'an already released opposite hand does not add another instruction');
  assert.equal(raw.rightBrake, .3); assert.deepEqual(reverse.hold, ['left']);
});
test('hands up presents release feedback for either hand and settles to a compact neutral message', () => {
  const f = fixture();
  const fields = { state: 'recover', context: 'Recovery', action: 'release-all', title: 'HANDS UP', hold: [], release: ['left', 'right', 'brake', 'bar', 'ears'] };
  const raw = Object.freeze({ controlMode: 'brakes' as const, leftBrake: .3, rightBrake: 0 });
  f.raw(raw); f.view.update(actionMessage(fields, raw));
  assert.equal(f.chip('left').children[0].textContent, 'Release left brake');
  assert.equal(f.chip('right').hidden, true);
  assert.equal(f.chip('brake').children[0].textContent, 'Release the pull');
  assert.equal(f.chip('brake').children[1].textContent, 'slide up / let go');
  const neutral = { controlMode: 'brakes' as const, leftBrake: 0, rightBrake: 0 };
  f.raw(neutral); f.view.update(actionMessage(fields, neutral));
  assert.ok(f.parts.controls.children.slice(0, 3).every((chip) => chip.hidden));
  assert.equal(f.parts.controls.children[3].textContent, 'Hands up');
  assert.equal(f.parts.controls.children[3].hidden, false);
  assert.equal(raw.leftBrake, .3);
});
test('only manual drag controls are created; unavailable bar, ears and digital inputs produce no chips', () => {
  const f = fixture();
  f.raw({ left: true, right: true, brake: true, deepBrake: true, bar: true, ears: true });
  f.view.update({ state: 'building', context: 'Flight', action: 'none', title: 'Current controls', hold: [], release: ['bar', 'ears'] });
  assert.deepEqual(f.parts.controls.children.slice(0, 3).map((chip) => chip.dataset.control), ['left', 'right', 'brake']);
  assert.equal(f.chip('bar'), undefined); assert.equal(f.chip('ears'), undefined);
  assert.equal(f.parts.controls.hidden, true);
  f.raw({ controlMode: 'brakes' as const, leftBrake: .6, rightBrake: .6 });
  f.view.update({ state: 'building', action: 'brake', title: 'Pull both', hold: ['brake'], release: ['bar', 'ears'] });
  assert.equal(f.chip('brake').children[0].textContent, 'Holding both brakes');
});
test('deep brake is a continuous pull and quiet coaching clears its visual advice', () => {
  const f = fixture();
  const shape = { state: 'building', context: 'Pitch', action: 'deep-brake', brakeDepth: 'deep',
    title: 'PULL BOTH BRAKES DEEP', hold: ['brake'], release: ['bar'] };
  f.view.update(shape);
  assert.equal(f.chip('brake').children[0].textContent, 'Pull both brakes deeper');
  f.raw({ controlMode: 'brakes' as const, leftBrake: .6, rightBrake: .6 }); f.view.update(shape);
  assert.equal(f.chip('brake').children[0].textContent, 'Pull both brakes deeper');
  f.raw({ controlMode: 'brakes' as const, leftBrake: 1, rightBrake: 1 }); f.view.update(shape);
  assert.equal(f.chip('brake').children[0].textContent, 'Holding both deep brakes');
  f.view.update({ ...shape, action: 'brake', brakeDepth: 'working', title: 'EASE BOTH TO WORKING BRAKE' });
  assert.equal(f.chip('brake').children[0].textContent, 'Ease the pull to working range');
  assert.equal(f.chip('brake').dataset.advice, 'release', 'a deep hold does not fulfil a working catch');
  f.view.update(null);
  assert.equal(f.chip('brake').hidden, true);
  assert.equal(f.chip('brake').dataset.advice, '');
});
test('asymmetric pulls never claim both brakes are deep or satisfy a bilateral catch', () => {
  const f = fixture();
  for (const direction of ['left', 'right']) {
    const opposite = direction === 'left' ? 'right' : 'left';
    const raw = Object.freeze({ controlMode: 'brakes' as const, [`${direction}Brake`]: 1, [`${opposite}Brake`]: .2 });
    f.raw(raw);
    const deep = actionMessage({ action: 'deep-brake' }, raw);
    f.view.update(deep);
    assert.equal(deep.accepted, false, 'both hands must reach the deep range');
    assert.equal(f.chip('brake').children[0].textContent, 'Pull both brakes deeper');
    const working = actionMessage({ action: 'brake', brakeDepth: 'working' }, raw);
    f.view.update(working);
    assert.equal(working.accepted, false, 'one deep hand cannot satisfy a bilateral working catch');
    assert.equal(f.chip('brake').children[0].textContent, 'Ease the pull to working range');
    assert.equal(f.chip('brake').dataset.advice, 'release');
    const side = actionMessage({ action: direction, hold: [direction], release: [opposite], brakeDepth: 'deep' }, raw);
    f.view.update(side);
    assert.equal(side.accepted, true, 'the same pair can satisfy a deliberate deep side pull');
    assert.equal(f.chip(direction).children[0].textContent, `Pulling ${direction} brake`);
    assert.equal(f.chip('brake').children[0].textContent, 'Holding both brakes');
    assert.deepEqual(raw, { controlMode: 'brakes' as const, [`${direction}Brake`]: 1, [`${opposite}Brake`]: .2 });
  }
});
test('thermal circle and ease cues describe both brakes without changing the resolved titles', () => {
  const f = fixture();
  for (const direction of ['left', 'right']) {
    const opposite = direction === 'left' ? 'right' : 'left';
    const fields = { state: 'lift', context: 'thermal', activity: 'thermalling', phase: 'circle',
      action: direction, stableTitle: true, brakeDepth: 'working',
      title: `CIRCLE ${direction.toUpperCase()} + NORMAL BRAKE`, hold: [direction, 'brake'], release: [opposite, 'bar'] };
    const neutral = { controlMode: 'brakes' as const, leftBrake: 0, rightBrake: 0 };
    f.raw(neutral); f.view.update(actionMessage(fields, neutral));
    const title = f.parts.action.textContent;
    assert.equal(title, `CIRCLE ${direction.toUpperCase()} · KEEP BOTH BRAKES`);
    const raw = { controlMode: 'brakes' as const, [`${direction}Brake`]: .5, [`${opposite}Brake`]: .2 };
    f.raw(raw); f.view.update(actionMessage(fields, raw));
    assert.equal(f.parts.action.textContent, title);
    assert.equal(f.chip(direction).dataset.held, 'true'); assert.equal(f.chip('brake').dataset.held, 'true');
    assert.equal(f.chip('brake').hidden, true, 'the side + W caption already describes the complete pair');
    const ease = { ...fields, phase: 'ease', action: 'straight',
      title: `EASE ${direction.toUpperCase()} · KEEP BRAKE`, hold: ['brake'], release: ['left', 'right', 'bar'] };
    f.view.update(actionMessage(ease, raw));
    assert.equal(f.chip(direction).dataset.advice, 'release');
    const both = { controlMode: 'brakes' as const, leftBrake: .2, rightBrake: .2 };
    f.raw(both); f.view.update(actionMessage(ease, both));
    assert.equal(f.parts.action.textContent, 'EASE SIDE PULL · KEEP BOTH BRAKES');
    assert.equal(f.chip(direction).hidden, true);
    assert.equal(f.chip('brake').dataset.held, 'true');
    assert.deepEqual(raw, { controlMode: 'brakes' as const, [`${direction}Brake`]: .5, [`${opposite}Brake`]: .2 });
  }
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
  f.time(100); f.raw({ controlMode: 'brakes' as const, leftBrake: .3, rightBrake: 0 });
  f.view.update({ ...reverse, title: 'HOLD LEFT', progress: 0.7, progressLabel: 'Steady 0.7 s' });
  assert.equal(f.parts.announce.textContent, first); assert.equal(f.parts.announce.writes, writes);
  f.view.update({ ...reverse, state: 'building', phase: 'Building', action: 'right', title: 'HOLD RIGHT' });
  assert.equal(f.parts.announce.textContent, first, 'normal changes are briefly coalesced');
  f.time(801); f.view.update({ ...reverse, state: 'building', phase: 'Building', action: 'right', title: 'HOLD RIGHT' });
  assert.match(f.parts.announce.textContent, /HOLD RIGHT/);
  f.time(802); f.view.update({ ...reverse, state: 'recover', urgent: true, phase: 'Release', action: 'release-all', title: 'HANDS UP' });
  assert.match(f.parts.announce.textContent, /HANDS UP/, 'urgent recovery does not wait behind chatter');
});
test('fixed-step acknowledgement leaves the instruction and announcements stable while raw input stays live', () => {
  const f = fixture();
  const intent = { ...reverse, intentId: 'wingover:left:1', acknowledged: false };
  f.view.update(intent);
  const first = f.parts.announce.textContent, writes = f.parts.announce.writes;
  f.raw({ controlMode: 'brakes', leftBrake: .82, rightBrake: 0 });
  f.view.update({ ...intent, acknowledged: true, phase: 'hold' });
  assert.equal(f.parts.action.textContent, reverse.title);
  assert.equal(f.parts.acknowledgement.textContent, 'Good · keep that pull');
  assert.equal(f.parts.acknowledgement.hidden, false);
  assert.equal(f.parts.announce.textContent, first); assert.equal(f.parts.announce.writes, writes);
  assert.equal(f.chip('left').dataset.held, 'true');
  f.view.update({ ...intent, acknowledged: true, warning: true });
  assert.equal(f.parts.acknowledgement.hidden, true, 'safety is not accompanied by reassuring input feedback');
  f.view.update(null);
  assert.equal(f.parts.acknowledgement.textContent, '');
});
test('stable frames reuse DOM and reset/dispose clear advice without touching input', () => {
  const f = fixture(), raw = Object.freeze({ controlMode: 'brakes' as const, leftBrake: 0, rightBrake: .3 }); f.raw(raw); f.view.update(reverse);
  const chips = [...f.parts.controls.children], textWrites = f.parts.action.writes + f.parts.reason.writes + f.parts.progress.writes;
  for (let i = 0; i < 50; i++) f.view.update(reverse);
  assert.deepEqual(f.parts.controls.children, chips);
  assert.equal(f.parts.action.writes + f.parts.reason.writes + f.parts.progress.writes, textWrites);
  f.view.reset(); assert.equal(f.element.hidden, true); assert.equal(f.parts.announce.textContent, '');
  assert.ok(f.parts.controls.children.every((chip) => chip.hidden));
  f.view.update(reverse); assert.equal(f.chip('right').dataset.held, 'true', 'reset never releases a real brake');
  assert.equal(raw.rightBrake, .3);
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
test('navigation keeps its human heading while internal alignment phases change', () => {
  const f = fixture();
  f.view.update({ ...reverse, owner: 'navigation', heading: 'NEXT LIFT', phase: 'approach' });
  assert.equal(f.parts.kicker.textContent, 'NEXT LIFT');
  f.view.update({ ...reverse, owner: 'navigation', heading: 'NEXT LIFT', phase: 'align' });
  assert.equal(f.parts.kicker.textContent, 'NEXT LIFT');
});
test('quiet transit clears recommendations without changing held brake demands', () => {
  const f = fixture(), raw = Object.freeze({ controlMode: 'brakes' as const, leftBrake: 0, rightBrake: .3 });
  f.raw(raw); f.view.update(reverse);
  assert.equal(f.chip('left').dataset.advice, 'hold');
  assert.equal(f.chip('right').dataset.advice, 'release');
  f.view.update(null);
  assert.equal(f.element.hidden, true);
  assert.equal(f.parts.controls.hidden, true);
  assert.equal(f.parts.announce.textContent, '');
  for (const name of ['left', 'right', 'brake']) {
    assert.equal(f.chip(name).dataset.advice, '');
    assert.equal(f.chip(name).hidden, true);
  }
  f.view.update(reverse);
  assert.equal(f.chip('left').dataset.advice, 'hold', 'a newly active coach can recommend again');
  assert.deepEqual(raw, { controlMode: 'brakes' as const, leftBrake: 0, rightBrake: .3 });
});

test('lesson escape is shown on the active card and disappears for banked, cancelled and absent instruction', () => {
  const f = fixture();
  const raw = Object.freeze({ controlMode: 'brakes' as const, leftBrake: .2, rightBrake: .5 }); f.raw(raw);
  f.view.update({ ...reverse, canCancelLesson: true, lessonId: 'wingover' });
  assert.equal(f.parts.cancel.hidden, false);
  assert.equal(raw.rightBrake, .5); assert.equal(raw.leftBrake, .2);
  f.view.update({ ...reverse, state: 'banked' }); assert.equal(f.parts.cancel.hidden, true);
  f.view.update({ ...reverse, canCancelLesson: true }); f.view.update(null);
  assert.equal(f.parts.cancel.hidden, true);
  f.view.update({ ...reverse, canCancelLesson: true }); f.view.reset();
  assert.equal(f.parts.cancel.hidden, true);
});


test('the warning strip precedes the action without duplicating feedback and clears on reset', () => {
  const f = fixture(true);
  f.view.update({ ...reverse, warning: true, warningLabel: 'FOG CLOSE', feedback: 'Keep climbing.' });
  assert.equal(f.parts.warning.hidden, false);
  assert.equal(f.parts.warning.textContent, '⚠ FOG CLOSE · Keep climbing.');
  assert.equal(f.parts.action.textContent, reverse.title);
  assert.equal(f.parts.feedback.hidden, true);
  f.view.update(reverse);
  assert.equal(f.parts.warning.hidden, true);
  f.view.reset(); assert.equal(f.parts.warning.textContent, '');
});
test('a modal or judges result suppresses coach announcements until the current instruction owns the slot', () => {
  let canSpeak = false;
  const f = fixture(true, () => canSpeak);
  f.view.update({ ...reverse, state: 'recover' });
  assert.equal(f.parts.announce.textContent, '');
  canSpeak = true; f.view.update({ ...reverse, state: 'recover' });
  assert.match(f.parts.announce.textContent, /RELEASE RIGHT, THEN LEFT/);
  canSpeak = false; f.view.update({ ...reverse, state: 'recover' });
  assert.equal(f.parts.announce.textContent, '');
});
