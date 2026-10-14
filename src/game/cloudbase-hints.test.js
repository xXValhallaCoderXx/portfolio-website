import test from 'node:test';
import assert from 'node:assert/strict';
import { DEEP_WARN, FOG_NEAR, GUST_NEAR, HINT_HOLD, HINT_WIDTH, cloudbaseHint, holdHint, stallHint } from './cloudbase-hints.js';
import { BRAKE } from './flight.js';

// A quiet moment well into a run: gliding in still air with nothing near and the hands up.
const quiet = {
  collapse: 0, stall: 0, stallSide: 0, brake: 0, deep: 0, load: 0, gustAhead: 999, cloud: 0, outside: false, elapsed: 60,
  fogClearance: 300, lift: 0, headroom: 999, climbing: false, thermal: -1, dying: false, flockDir: 1, against: 0, rides: 5,
  searching: 0, touch: false,
};
const hint = (facts) => cloudbaseHint({ ...quiet, ...facts });

test('a collapsed wing outranks every other hint, then a stall, the brake and a gust, then a cloud', () => {
  const everything = {
    collapse: 1, stall: 1, stallSide: 1, load: 0.8, brake: 0.9, deep: 3, gustAhead: 10, cloud: 1, outside: true, elapsed: 1,
    fogClearance: 5, headroom: 10, climbing: true, thermal: 1, against: 5, dying: true, searching: 30,
  };
  assert.match(hint(everything), /^raven strike/);
  assert.match(hint({ ...everything, collapse: 0 }), /^spin/);
  assert.match(hint({ ...everything, collapse: 0, stall: 0 }), /^brake in the red/);
  assert.match(hint({ ...everything, collapse: 0, stall: 0, load: 0 }), /^gust coming/);
  assert.match(hint({ ...everything, collapse: 0, stall: 0, load: 0, gustAhead: 999 }), /^brake going deep/);
  assert.match(hint({ ...everything, collapse: 0, stall: 0, load: 0, gustAhead: 999, deep: 0 }), /^in cloud/);
  assert.match(hint({ ...everything, collapse: 0, stall: 0, load: 0, gustAhead: 999, deep: 0, cloud: 0 }), /turns you back/);
});

test('inside a cloud the hint says how to get out, even with fog close, the same on keys and on a phone', () => {
  assert.equal(hint({ cloud: 0.6, fogClearance: 20 }), 'in cloud — let go, fly straight out');
  assert.equal(hint({ cloud: 0.6, touch: true }), 'in cloud — let go, fly straight out');
  assert.equal(hint({ cloud: 0.2 }), '');
});

test('a stalled wing says to let go, and a spin says why it spun', () => {
  assert.equal(hint({ stall: 2, stallSide: 0 }), 'stalled — let go, the wing flies again');
  assert.equal(hint({ stall: 0.1, stallSide: -1 }), 'spin — too much brake in the turn, let go');
  assert.equal(stallHint(0, 1), '');
  assert.equal(stallHint(1.5, 1), hint({ stall: 1.5, stallSide: 1 }));
});

test('the brake is called out once it has gone deep for a moment, and again in the red, never on a light brake', () => {
  assert.equal(hint({ brake: BRAKE.shelf, deep: DEEP_WARN - 0.01 }), '');
  assert.equal(hint({ brake: 0.8, deep: DEEP_WARN }), 'brake going deep — ease off now');
  assert.equal(hint({ brake: 0.9, deep: 2, load: 0.6 }), 'brake in the red — ease off or it stalls');
  assert.equal(hint({ brake: BRAKE.light, load: 0.59 }), '');
  // Let go with the load still draining, the red is still worth a word.
  assert.equal(hint({ brake: 0, load: 0.7 }), 'brake in the red — ease off or it stalls');
});

test('a gust front coming is called out only to a pilot holding the brake past light, whichever way they face', () => {
  assert.equal(hint({ gustAhead: GUST_NEAR - 1, brake: BRAKE.light + 0.01 }), 'gust coming — ease the brake');
  assert.equal(hint({ gustAhead: 0, brake: 0.9 }), 'gust coming — ease the brake');
  assert.equal(hint({ gustAhead: GUST_NEAR, brake: 0.9, deep: 0 }), '');
  assert.equal(hint({ gustAhead: 10, brake: BRAKE.light }), '');
  assert.equal(hint({ gustAhead: 10, brake: 0 }), '');
});

test('on the third and fourth thermals the hint teaches easing the brake once a circle', () => {
  assert.equal(hint({ thermal: 1, rides: 3, lift: 14, touch: true }), 'ease off ▼ once a circle or it goes deep');
  assert.equal(hint({ thermal: 2, rides: 4, lift: 14 }), 'ease the brake each circle or it goes deep');
  assert.equal(hint({ thermal: 2, rides: 5, lift: 14 }), '');
  assert.equal(hint({ thermal: 1, rides: 2, lift: 14 }), 'climb beside the ravens, never through');
  assert.equal(hint({ thermal: 1, rides: 3, dying: true }), 'lift dying — leave when the ravens leave');
});

test('the launch column teaches circling first, then where to look next, then to leave', () => {
  assert.equal(hint({ elapsed: 2, thermal: 0, lift: 17, fogClearance: 77 }), 'circle in the amber column to climb');
  assert.equal(hint({ elapsed: 12, thermal: 0, lift: 17 }), 'circling ravens mark the next lift');
  assert.equal(hint({ elapsed: 20, thermal: 0, lift: 9, dying: true }), 'lift dying — fly to the circling ravens');
});

test('fog close below is called out with what to do about it, but never in the first seconds', () => {
  assert.equal(hint({ fogClearance: FOG_NEAR - 1, lift: 12, thermal: 1 }), 'fog closing in — keep climbing');
  assert.equal(hint({ fogClearance: FOG_NEAR - 1, lift: 0 }), 'fog closing in — fly to the ravens');
  assert.equal(hint({ fogClearance: FOG_NEAR }), '');
  assert.doesNotMatch(hint({ elapsed: 3, fogClearance: 60 }), /fog/);
});

test('turning against a flock names the way the ravens turn, on every ride', () => {
  assert.equal(hint({ thermal: 2, against: 1.5, flockDir: 1, rides: 9, lift: 14 }), 'ravens turn ▶ here — turn with them');
  assert.equal(hint({ thermal: 1, against: 1.5, flockDir: -1, rides: 1, lift: 14 }), 'ravens turn ◀ here — turn with them');
  assert.equal(hint({ thermal: 1, against: 0.5, rides: 1, lift: 14 }), 'climb beside the ravens, never through');
  assert.equal(hint({ thermal: 1, against: 0, rides: 5, lift: 14 }), '');
  // The launch column has no ravens to turn with.
  assert.doesNotMatch(hint({ thermal: 0, against: 5 }), /turn with/);
  // Turning the short way out of lift that is dying is the right thing to do.
  assert.equal(hint({ thermal: 1, against: 3, dying: true, lift: 5 }), 'lift dying — leave when the ravens leave');
});

test('a hunted thermal that is fading says to leave with its ravens, and a cloud overhead says why the climb stops', () => {
  assert.equal(hint({ thermal: 1, dying: true, lift: 6 }), 'lift dying — leave when the ravens leave');
  assert.equal(hint({ thermal: 1, headroom: 40, climbing: true, lift: 14 }), 'storm cloud above — lift ends at its base');
  assert.equal(hint({ thermal: 1, headroom: 40, climbing: false, rides: 5 }), '');
});

test('searching stays quiet for four seconds, then points at the ravens', () => {
  assert.equal(hint({ searching: 3.9 }), '');
  assert.equal(hint({ searching: 4.1 }), 'ravens circle where air rises — fly there');
});

test('every hint fits one line of a narrow phone', () => {
  const moments = [
    { collapse: 1 }, { stall: 1 }, { stall: 1, stallSide: 1 }, { load: 0.9 }, { gustAhead: 5, brake: 0.6 }, { deep: 1 }, { cloud: 1 },
    { outside: true }, { elapsed: 1 }, { fogClearance: 10, lift: 9 }, { fogClearance: 10 }, { headroom: 10, climbing: true },
    { thermal: 1, against: 2 }, { thermal: 1, against: 2, flockDir: -1 }, { thermal: 0, dying: true }, { thermal: 1, dying: true },
    { thermal: 1, rides: 1 }, { thermal: 1, rides: 3 }, { thermal: 1, rides: 3, touch: true }, { thermal: 0 }, { searching: 9 },
  ];
  const lines = new Set(moments.map(hint));
  assert.equal(lines.size, moments.length, 'each moment has its own line');
  for (const line of lines) {
    assert.ok(line.length > 0);
    assert.ok([...line].length <= HINT_WIDTH, `"${line}" is ${[...line].length} characters`);
  }
});

test('a line stays up long enough to read, but a folded wing or a cloud is said at once', () => {
  const held = { line: '', since: 0 };
  // The first line of any moment shows straight away.
  assert.equal(holdHint(held, 'climb beside the ravens, never through', 10), 'climb beside the ravens, never through');
  // A change of mind half a second later does not flash on screen.
  assert.equal(holdHint(held, 'ravens turn ◀ here — turn with them', 10.5), 'climb beside the ravens, never through');
  assert.equal(holdHint(held, '', 11), 'climb beside the ravens, never through');
  // Once the line has had its time, whatever is true then takes over.
  assert.equal(holdHint(held, 'ravens turn ◀ here — turn with them', 10 + HINT_HOLD), 'ravens turn ◀ here — turn with them');
  assert.equal(held.since, 10 + HINT_HOLD);
  // Urgent lines never wait, and are themselves held like any other.
  assert.equal(holdHint(held, hint({ collapse: 2 }), 11.6), 'raven strike — wing collapsed, hold on');
  assert.equal(holdHint(held, hint({ cloud: 1 }), 11.7), 'in cloud — let go, fly straight out');
  assert.equal(holdHint(held, '', 12), 'in cloud — let go, fly straight out');
  assert.equal(holdHint(held, '', 11.7 + HINT_HOLD), '');
  // After a blank, the next line is not kept waiting.
  assert.equal(holdHint(held, 'fog closing in — keep climbing', 13.3), 'fog closing in — keep climbing');
});

test('a stall, the brake in the red, a gust coming and a brake gone deep are all said at once', () => {
  for (const moment of [{ stall: 1 }, { stall: 1, stallSide: -1 }, { load: 0.9 }, { gustAhead: 5, brake: 0.6 }, { deep: 1 }]) {
    const held = { line: '', since: 0 };
    holdHint(held, 'climb beside the ravens, never through', 10);
    assert.equal(holdHint(held, hint(moment), 10.1), hint(moment));
  }
});

test('a kettlebell coming says how to dodge it, leading with the bar while circling, and gives way only to a folded or stalled wing', () => {
  assert.equal(hint({ bell: 1 }), 'kettlebell — push the bar or straighten');
  assert.equal(hint({ bell: 1, touch: true }), 'kettlebell — ◀▶ for the bar, or straighten');
  assert.equal(hint({ bell: 2 }), 'kettlebell — turn off your line');
  assert.equal(hint({ bell: 2, touch: true }), 'kettlebell — turn off your line');
  const everything = { bell: 1, load: 0.8, brake: 0.9, deep: 3, gustAhead: 10, cloud: 1, outside: true, elapsed: 1, fogClearance: 5 };
  assert.match(hint(everything), /^kettlebell — push/);
  assert.match(hint({ ...everything, bell: 2 }), /^kettlebell — turn/, 'flying straight, it outranks the same as circling');
  assert.match(hint({ ...everything, stall: 1 }), /^stalled/);
  assert.match(hint({ ...everything, collapse: 1 }), /^raven strike/);
});

test('a wing folded by a kettlebell says so, and one folded by a raven still names the raven', () => {
  assert.equal(hint({ collapse: 1, bellHit: true }), 'kettlebell hit — wing collapsed, hold on');
  assert.equal(hint({ collapse: 1, bellHit: false }), 'raven strike — wing collapsed, hold on');
});

test('a close call, the horn and a waiting trail each have a line of their own, said only while it is news', () => {
  assert.equal(hint({ closeCall: 0.5 }), 'close call — 10 kg on the bar');
  assert.equal(hint({ closeCall: 2.5 }), '');
  assert.equal(hint({ horn: 1 }), 'Gjallarhorn — every lift counts double');
  assert.equal(hint({ horn: 3.5 }), '');
  assert.equal(hint({ trail: true }), 'lift dying — follow the plates on the bar');
  assert.equal(hint({ trail: true, thermal: 1, dying: true }), 'lift dying — follow the plates on the bar');
  // Each is news, not a warning: a cloud still comes first, and leaving the zone.
  assert.match(hint({ closeCall: 0.5, horn: 1, trail: true, cloud: 1 }), /^in cloud/);
  assert.match(hint({ closeCall: 0.5, outside: true }), /turns you back/);
  assert.equal(hint({ closeCall: 0.5, horn: 1 }), 'close call — 10 kg on the bar', 'the close call before the horn');
  // Turning against a flock outranks the trail, which outranks a dying lift's own line.
  assert.match(hint({ trail: true, thermal: 1, against: 2, flockDir: -1 }), /^ravens turn ◀/);
  assert.equal(hint({ trail: true, thermal: 0, dying: true }), 'lift dying — follow the plates on the bar');
});

test('every line the meet adds fits one line of a narrow phone, and a kettlebell is said at once', () => {
  const moments = [{ collapse: 1, bellHit: true }, { bell: 1 }, { bell: 1, touch: true }, { bell: 2 }, { closeCall: 0 }, { horn: 0 }, { trail: true }];
  const lines = new Set(moments.map(hint));
  assert.equal(lines.size, moments.length, 'each moment has its own line');
  for (const line of lines) assert.ok([...line].length <= HINT_WIDTH, `"${line}" is ${[...line].length} characters`);
  for (const moment of [{ bell: 1 }, { bell: 2 }, { collapse: 1, bellHit: true }]) {
    const held = { line: '', since: 0 };
    holdHint(held, 'climb beside the ravens, never through', 10);
    assert.equal(holdHint(held, hint(moment), 10.1), hint(moment));
  }
});
