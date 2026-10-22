import test from 'node:test';
import assert from 'node:assert/strict';
import { flightMessageOwner, flightSecondaryOwner, type FlightMessageFacts } from './flight-message.ts';
const facts: FlightMessageFacts = { blocked: false, urgent: false, coach: true, judges: false, notice: true, hint: true, intro: false };
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
