import test from 'node:test';
import assert from 'node:assert/strict';
import { essentialFlightMessage, safetyAlertText, flightMessageOwner, flightSecondaryOwner, type FlightMessageFacts } from './flight-message.ts';
const facts: FlightMessageFacts = { blocked: false, urgent: false, coach: true, judges: false, notice: true, hint: true };
const flying = { stallLoad: 0, stall: 0, tuck: 0, wingPhase: 'flying' as const };
test('normal flight keeps real hazards and preventive physical safety before a full stall', () => {
  const safety = { state: 'recover', owner: 'safety' as const };
  assert.equal(essentialFlightMessage(safety, flying), null);
  assert.equal(essentialFlightMessage(safety, { ...flying, stallLoad: .65 }), null);
  assert.equal(essentialFlightMessage(safety, { ...flying, stallLoad: .66 }), safety);
  assert.equal(essentialFlightMessage(safety, { ...flying, stall: .1 }), safety);
  assert.equal(essentialFlightMessage(safety, { ...flying, tuck: .1 }), safety);
  const warning = { warning: true }, hazard = { state: 'hazard' };
  assert.equal(essentialFlightMessage(warning, flying), warning);
  assert.equal(essentialFlightMessage(hazard, flying), hazard);
});
test('urgent catch and reversal teaching do not return to normal flight', () => {
  for (const phase of ['catch', 'reverse', 'release']) {
    const instruction = { state: 'timing', phase, urgent: true, owner: 'acro' as const };
    assert.equal(essentialFlightMessage(instruction, flying), null);
    assert.equal(essentialFlightMessage(instruction, { ...flying, stallLoad: .8 }), null);
  }
});
test('a valid safety alert takes precedence over judging and notices', () => {
  assert.equal(flightMessageOwner({ ...facts, urgent: true, judges: true }), 'coach');
  assert.equal(flightMessageOwner({ ...facts, judges: true }), 'coach');
  assert.equal(flightMessageOwner(facts), 'coach');
  assert.equal(flightMessageOwner({ ...facts, coach: false, judges: true }), 'judges');
});

test('hazard labels do not expose the routine coaching instruction they interrupt', () => {
  assert.equal(safetyAlertText({ warning: true, warningLabel: 'FOG CLOSING', owner: 'navigation', title: 'CIRCLE LEFT',
    detail: 'Keep working brake and follow the thermal.', feedback: 'Climb above the fog.' }), 'FOG CLOSING');
  assert.equal(safetyAlertText({ warning: true, owner: 'acro', title: 'REVERSE NOW' }), 'Flight safety');
  assert.equal(safetyAlertText({ state: 'hazard', title: 'RAVENS APPROACHING' }), 'RAVENS APPROACHING');
});

test('safety text preserves phase-specific full-stall actions, including an attached warning', () => {
  for (const title of ['HOLD DEEP BRAKE · WAIT UNDER THE WING', 'NORMAL BRAKE FOR BACKFLY',
    'BACKFLY STABLE · RELEASE TO EXIT', 'FRONTAL COLLAPSE · HANDS UP', 'WING REOPENING · KEEP BRAKE RELEASED']) {
    const recovery = { owner: 'safety' as const, state: 'recover', title };
    assert.equal(safetyAlertText(recovery), title);
    assert.equal(safetyAlertText({ ...recovery, warning: true, warningLabel: 'FOG CLOSE' }), `FOG CLOSE · ${title}`);
  }
  assert.equal(safetyAlertText({ state: 'hazard', title: 'FOG CLOSE', warningLabel: 'FOG CLOSE' }), 'FOG CLOSE');
});

test('judges use secondary feedback while safety and overlays suppress it without a queue', () => {
  assert.equal(flightSecondaryOwner({ ...facts, judges: true }), 'judges');
  assert.equal(flightSecondaryOwner({ ...facts, judges: true, urgent: true }), 'none');
  assert.equal(flightSecondaryOwner({ ...facts, judges: true, blocked: true }), 'none');
  assert.equal(flightSecondaryOwner(facts), 'none');
});
test('modals suppress all messages; expiry reveals current guidance without queueing notices', () => {
  assert.equal(flightMessageOwner({ ...facts, blocked: true, urgent: true, judges: true }), 'none');
  assert.equal(flightMessageOwner({ ...facts, coach: false }), 'notice');
  assert.equal(flightMessageOwner({ ...facts, coach: false, notice: false }), 'hint');
  assert.equal(flightMessageOwner({ ...facts, coach: false, notice: false, hint: false }), 'none');
});
