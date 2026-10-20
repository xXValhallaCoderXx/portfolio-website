import test from 'node:test';
import assert from 'node:assert/strict';
import { flightMessageOwner, type FlightMessageFacts } from './flight-message.ts';
const facts: FlightMessageFacts = { blocked: false, urgent: false, coach: true, judges: false, notice: true, hint: true, intro: false };
test('one flight message gives urgent instructions priority over judges and introduction', () => {
  assert.equal(flightMessageOwner({ ...facts, urgent: true, judges: true, intro: true }), 'coach');
  assert.equal(flightMessageOwner({ ...facts, judges: true }), 'judges');
  assert.equal(flightMessageOwner({ ...facts, intro: true }), 'intro');
  assert.equal(flightMessageOwner(facts), 'coach');
});
test('modals suppress all messages; expiry reveals current guidance without queueing notices', () => {
  assert.equal(flightMessageOwner({ ...facts, blocked: true, urgent: true, judges: true }), 'none');
  assert.equal(flightMessageOwner({ ...facts, coach: false }), 'notice');
  assert.equal(flightMessageOwner({ ...facts, coach: false, notice: false }), 'hint');
  assert.equal(flightMessageOwner({ ...facts, coach: false, notice: false, hint: false }), 'none');
});
