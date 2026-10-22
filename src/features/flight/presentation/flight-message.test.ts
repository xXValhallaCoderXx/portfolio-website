import test from 'node:test';
import assert from 'node:assert/strict';
import { essentialFlightMessage, flightMessageOwner, flightSecondaryOwner, type FlightMessageFacts } from './flight-message.ts';
const facts: FlightMessageFacts = { blocked: false, urgent: false, coach: true, judges: false, notice: true, hint: true, intro: false };
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
test('a valid flight instruction stays visible through judging and introduction', () => {
  assert.equal(flightMessageOwner({ ...facts, urgent: true, judges: true, intro: true }), 'coach');
  assert.equal(flightMessageOwner({ ...facts, judges: true }), 'coach');
  assert.equal(flightMessageOwner({ ...facts, intro: true }), 'coach');
  assert.equal(flightMessageOwner(facts), 'coach');
  assert.equal(flightMessageOwner({ ...facts, coach: false, judges: true }), 'judges');
  assert.equal(flightMessageOwner({ ...facts, coach: false, intro: true }), 'intro');
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
