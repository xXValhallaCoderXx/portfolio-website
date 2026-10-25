import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonSelection, lessonStage, menuContext } from './menu-model.ts';
import { compactCoachCue } from './coach-cue.ts';

test('preview selection never changes the active lesson or manufactures a resume for an ended attempt', () => {
  assert.deepEqual(lessonSelection('steering', 'thermal'), { active: 'steering', selected: 'thermal', same: false, resume: false, action: 'Start Thermal climb' });
  assert.equal(lessonSelection('steering', 'steering').resume, true);
  assert.equal(lessonSelection('steering', 'steering', false).action, 'Start Steering & braking');
});
test('phase indicators include every real steering release and have no clock-based advancement', () => {
  const phases = ['level', 'turn-first', 'release-first', 'turn-second', 'release-second', 'turn-sharp', 'release-sharp', 'brake', 'recovery'];
  phases.forEach((phase, index) => assert.equal(lessonStage('steering', phase).index, index));
  assert.equal(lessonStage('steering', 'unknown').index, -1);
  assert.equal(lessonStage('thermal', 'acquire').index, 1);
  assert.equal(lessonStage('thermal', 'circle').index, 2);
  assert.equal(lessonStage('pitch', 'catch').index, 1);
  assert.equal(lessonStage('pitch', 'recovery').index, 2);
});
test('Free Form and Practice Sky retain different menu contexts', () => {
  assert.equal(menuContext('flying'), 'free-form');
  assert.equal(menuContext('cloudbase'), 'game');
  assert.equal(menuContext('training'), 'training');
});
test('first-input cues follow targets when foundation lessons have no hold array', () => {
  const message = { lessonId: 'steering', action: 'left', hold: [], brakeTargets: { left: .3, right: 0, tolerance: .07 } };
  for (const device of ['touch', 'mouse', 'keyboard'] as const) {
    const cue = compactCoachCue(message, {}, device);
    assert.equal(cue.side, 'left'); assert.equal(cue.position, 0); assert.equal(cue.callout, 'PULL ↓');
    assert.match(cue.cue, device === 'keyboard' ? /A \/ ←/ : /left/);
  }
});
test('opposite release, hold and easing are resolved from each requested pair', () => {
  const message = { action: 'left', hold: ['left'], release: ['right'], brakeTargets: { left: .82, right: 0, tolerance: .07 } };
  assert.match(compactCoachCue(message, { rightBrake: .82 }, 'keyboard').cue, /^Release D \/ →; Q/);
  assert.match(compactCoachCue(message, { rightBrake: .82 }, 'touch').cue, /^Release right; pull the left/);
  assert.equal(compactCoachCue(message, { leftBrake: .82 }, 'touch').callout, 'HOLD HERE');
  assert.equal(compactCoachCue(message, { leftBrake: 1 }, 'touch').callout, 'EASE ↑');
  const catchPull = { action: 'brake', brakeTargets: { left: .6, right: .6, tolerance: .07 } };
  assert.match(compactCoachCue(catchPull, { leftBrake: 1, rightBrake: 1 }, 'keyboard').cue, /^Release Shift; Space/);
  const circle = { action: 'right', brakeTargets: { left: .2, right: .5, tolerance: .07 } };
  assert.match(compactCoachCue(circle, { leftBrake: .5, rightBrake: .2 }, 'keyboard').cue, /^Release A \/ ←; D \+ W/);
  assert.match(compactCoachCue({ brakeTargets: { left: .2, right: .2, tolerance: .07 } }, { leftBrake: .6, rightBrake: .6 }, 'keyboard').cue, /^Release Space/);
  const release = compactCoachCue({ action: 'release-all', brakeTargets: { left: 0, right: 0, tolerance: .07 } }, {}, 'keyboard');
  assert.equal(release.position, null); assert.match(release.cue, /both turn and brake/);
});

test('a card asking for the speed bar with the hands up says so on every device, and holds once it is held', () => {
  const message = { brakeTargets: { left: 0, right: 0, tolerance: 0.07, bar: true } };
  assert.match(compactCoachCue(message, {}, 'keyboard').cue, /↑ · speed bar/);
  assert.match(compactCoachCue(message, {}, 'touch').cue, /Hold BAR/);
  assert.equal(compactCoachCue(message, {}, 'touch').callout, 'BAR ↑');
  assert.equal(compactCoachCue(message, { bar: true }, 'keyboard').callout, 'HOLD HERE');
  assert.equal(compactCoachCue(message, { bar: true, leftBrake: 0.3 }, 'keyboard').status, 'pull', 'a brake held keeps the bar from acting');
});
