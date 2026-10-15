import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLESSED, CENTRE_RIDES, DEEP_WARN, EARS_CLIMB, ENTRY_RIDES, FOG_NEAR, FRONTS_TAUGHT, GUST_NEAR, HINT_HOLD, HINT_WIDTH, LOST_SAID, STONES_AGAIN, STONES_NEWS,
  TIP_SAID, TRICKS_TAUGHT, TRICK_SAID, TUCK_SAID, TURN_SAID, cloudbaseHint, holdHint, stallHint,
} from './cloudbase-hints.js';
import { BRAKE } from './flight.js';
import { MEET } from './meet-state.js';
import { BLESSING, RUNE, RUNE_NAME, RUNE_SIGN } from './meet-runes.js';

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
  assert.equal(hint({ brake: 0.8, deep: DEEP_WARN, lift: 5 }), 'brake going deep — ease off now');
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
  assert.equal(holdHint(held, hint({ collapse: 2 }), 11.6), 'raven strike — hold brake, let go, twice');
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

test('a wing folded by a kettlebell says so, and one folded by a raven still names the raven, each saying how to pump it open', () => {
  assert.equal(hint({ collapse: 1, bellHit: true }), 'kettlebell hit — hold brake, let go, twice');
  assert.equal(hint({ collapse: 1, bellHit: false }), 'raven strike — hold brake, let go, twice');
  assert.equal(hint({ collapse: 1, bellHit: true, touch: true }), 'kettlebell hit — hold ▼, let go, twice');
  assert.equal(hint({ collapse: 1, touch: true }), 'raven strike — hold ▼, let go, twice');
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
  const moments = [
    { collapse: 1, bellHit: true }, { bell: 1 }, { bell: 1, touch: true }, { bell: 2 }, { closeCall: 0 }, { horn: 0 }, { trail: true }, { depth: 0 },
    { thermal: 1, rides: 2, shallow: true }, { thermal: 1, rides: 2, shallow: true, touch: true },
    { thermal: 1, rides: 2, shallow: true, touch: true, flockDir: -1 },
  ];
  const lines = new Set(moments.map(hint));
  assert.equal(lines.size, moments.length, 'each moment has its own line');
  for (const line of lines) assert.ok([...line].length <= HINT_WIDTH, `"${line}" is ${[...line].length} characters`);
  for (const moment of [{ bell: 1 }, { bell: 2 }, { collapse: 1, bellHit: true }]) {
    const held = { line: '', since: 0 };
    holdHint(held, 'climb beside the ravens, never through', 10);
    assert.equal(holdHint(held, hint(moment), 10.1), hint(moment));
  }
});

test('from the second thermal on, a circle that missed the core is taught to centre, by the flock\'s way on a phone', () => {
  assert.equal(hint({ thermal: 1, rides: 2, shallow: true, lift: 14 }), 'straighten in the surge, turn as it fades');
  assert.equal(hint({ thermal: 2, rides: 3, shallow: true, lift: 14, touch: true, flockDir: 1 }), 'surge — lift your thumb off ▶ for a beat');
  assert.equal(hint({ thermal: 1, rides: CENTRE_RIDES, shallow: true, touch: true, flockDir: -1 }), 'surge — lift your thumb off ◀ for a beat');
  // Not on the first thermal, which teaches where to circle, nor once circles are centred, nor for ever.
  assert.equal(hint({ thermal: 1, rides: 1, shallow: true }), 'climb beside the ravens, never through');
  assert.equal(hint({ thermal: 1, rides: 2, shallow: false }), 'climb beside the ravens, never through');
  assert.equal(hint({ thermal: 2, rides: 3, shallow: false }), 'ease the brake each circle or it goes deep');
  assert.equal(hint({ thermal: 1, rides: CENTRE_RIDES + 1, shallow: true }), '');
  // The launch column has no core to find.
  assert.equal(hint({ thermal: 0, rides: 3, shallow: true }), 'circling ravens mark the next lift');
  // Turning against the flock, a trail to follow and a dying thermal all come first.
  assert.match(hint({ thermal: 1, rides: 3, shallow: true, against: 2 }), /^ravens turn/);
  assert.match(hint({ thermal: 1, rides: 3, shallow: true, trail: true }), /^lift dying — follow/);
  assert.match(hint({ thermal: 1, rides: 3, shallow: true, dying: true }), /^lift dying — leave/);
});

test('the run\'s first rep to depth is news for a moment, after a close call and the horn', () => {
  assert.equal(hint({ depth: 0.5, thermal: 1, rides: 3 }), 'depth — centred circle, 5 kg on the bar');
  assert.equal(hint({ depth: 2.6, thermal: 1, rides: 9 }), '');
  assert.match(hint({ depth: 0.5, closeCall: 0.5 }), /^close call/);
  assert.match(hint({ depth: 0.5, horn: 1 }), /^Gjallarhorn/);
  assert.match(hint({ depth: 0.5, outside: true }), /turns you back/);
});

test('the meet\'s news names the weights the meet itself loads', () => {
  assert.ok(hint({ closeCall: 0 }).includes(` ${MEET.close} kg `));
  assert.ok(hint({ depth: 0 }).includes(` ${MEET.deep} kg `));
});

test('the Beast coming says how to dodge it as any kettlebell does, on keys and on a phone, and starts with the word that has it said at once', () => {
  assert.equal(hint({ bell: 1, beast: true }), 'kettlebell — the Beast: bar or straighten');
  assert.equal(hint({ bell: 1, beast: true, touch: true }), 'kettlebell — the Beast: ◀▶ or straighten');
  assert.equal(hint({ bell: 2, beast: true }), 'kettlebell — the Beast: turn off your line');
  assert.equal(hint({ bell: 2, beast: true, touch: true }), 'kettlebell — the Beast: turn off your line');
  assert.equal(hint({ bell: 0, beast: true }), '', 'only while it is coming');
  assert.match(hint({ bell: 1, beast: true, collapse: 1 }), /^raven strike/);
  assert.match(hint({ bell: 1, beast: true, load: 0.9, cloud: 1, deep: 3 }), /^kettlebell — the Beast/);
  for (const moment of [{ bell: 1, beast: true }, { bell: 1, beast: true, touch: true }, { bell: 2, beast: true }]) {
    const held = { line: '', since: 0 };
    holdHint(held, 'climb beside the ravens, never through', 10);
    assert.equal(holdHint(held, hint(moment), 10.1), hint(moment));
  }
});

test('a close call says what it put on the bar: the Beast\'s more, and twice as much under Tiwaz, as a rep to depth is', () => {
  assert.equal(hint({ closeCall: 0.5, beastClose: true }), `close call, the Beast — ${MEET.beast} kg on the bar`);
  assert.equal(hint({ closeCall: 0.5, double: true }), `close call — ${MEET.close * BLESSING.double} kg on the bar`);
  assert.equal(hint({ closeCall: 0.5, beastClose: true, double: true }), 'close call, the Beast — 40 kg on the bar');
  assert.equal(hint({ depth: 0.5, double: true }), 'depth — centred circle, 10 kg on the bar');
  assert.equal(hint({ closeCall: 2.5, beastClose: true }), '');
});

test('each blessing taken is news for three seconds, in its own words, and one already spent is not said', () => {
  const said = [RUNE.fehu, RUNE.algiz, RUNE.ansuz, RUNE.tiwaz].map((rune) => hint({ blessing: rune, blessed: 0.2 }));
  assert.deepEqual(said, BLESSED.slice(1));
  assert.deepEqual(said.map((line) => line.split(' ')[0]), [RUNE_SIGN[1], RUNE_SIGN[2], RUNE_SIGN[3], RUNE_SIGN[4]]);
  assert.ok(said.every((line, i) => line.includes(RUNE_NAME[i + 1])));
  assert.equal(hint({ blessing: RUNE.fehu, blessed: 3.1 }), '');
  assert.equal(hint({ blessing: RUNE.none, blessed: 0.5 }), '', 'Algiz spent straight away has nothing to say');
  // News: a cloud and the horn come first, the run's first rep to depth after.
  assert.match(hint({ blessing: RUNE.tiwaz, blessed: 1, cloud: 1 }), /^in cloud/);
  assert.match(hint({ blessing: RUNE.tiwaz, blessed: 1, horn: 1 }), /^Gjallarhorn/);
  assert.match(hint({ blessing: RUNE.tiwaz, blessed: 1, depth: 0.5 }), /^ᛏ Tiwaz/);
});

test('a kettlebell turned aside by Algiz, and a bar lost to a strike under Tiwaz once the wing has opened, are each said for a moment', () => {
  assert.equal(hint({ glanced: 0.5 }), 'ᛉ Algiz turned the kettlebell aside');
  assert.equal(hint({ glanced: 2.1 }), '');
  assert.equal(hint({ barLost: 1, collapse: 1.4, bellHit: true }), 'kettlebell hit — hold brake, let go, twice', 'the fold is said first');
  assert.equal(hint({ barLost: 2.5 }), 'ᛏ Tiwaz — the strike took the whole bar');
  assert.equal(hint({ barLost: 5.1 }), '');
  assert.match(hint({ glanced: 0.5, closeCall: 0.5 }), /^ᛉ Algiz/);
  assert.match(hint({ barLost: 3, horn: 1 }), /^ᛏ Tiwaz — the strike/);
});

test('rune stones are news as they are raised, saying where, or that one replaces the blessing held, and again for a moment as a slow climb comes level with them, never after', () => {
  const raised = { stones: 500, stonesNew: 1, stonesLevel: Infinity };
  assert.equal(hint(raised), 'rune stones at 500 m — fly through one');
  assert.equal(hint({ ...raised, stones: 1000 }), 'rune stones at 1,000 m — fly through one');
  assert.equal(hint({ ...raised, stones: 1000, blessing: RUNE.algiz }), 'rune stones at 1,000 m — one replaces yours');
  assert.equal(hint({ ...raised, stonesNew: STONES_NEWS + 0.1 }), '', 'then the climb has the hint back');
  // Level, STONES_AGAIN or more after they were raised: for as long as their news, from that moment.
  const level = 'fly through a glowing rune for its blessing';
  const slow = (stonesLevel) => ({ stones: 500, stonesNew: STONES_AGAIN + 2 + stonesLevel, stonesLevel });
  assert.equal(hint(slow(0)), level);
  assert.equal(hint(slow(STONES_NEWS - 0.1)), level);
  assert.equal(hint(slow(STONES_NEWS)), '');
  assert.equal(hint({ stones: 500, stonesNew: STONES_AGAIN, stonesLevel: 0 }), level);
  assert.equal(hint({ ...slow(0), stones: 0 }), '', 'none waiting, none said');
  // A strong climb comes level while their own news is still up, which goes on saying where they are,
  // and then the climb has the hint back: it has just been told.
  assert.equal(hint({ stones: 500, stonesNew: 3, stonesLevel: 0.2 }), 'rune stones at 500 m — fly through one');
  assert.equal(hint({ stones: 500, stonesNew: STONES_NEWS + 0.5, stonesLevel: 1.7 }), '');
  assert.equal(hint({ stones: 500, stonesNew: STONES_AGAIN - 0.1, stonesLevel: 0 }), '');
  // They give way to news, the fog and a storm cloud being climbed toward, and come before the ravens' way.
  assert.match(hint({ ...slow(1), blessing: RUNE.fehu, blessed: 0.5 }), /^ᚠ Fehu/);
  assert.match(hint({ ...slow(1), fogClearance: 40 }), /^fog closing in/);
  assert.match(hint({ ...slow(1), headroom: 30, climbing: true }), /^storm cloud above/);
  assert.match(hint({ stones: 500, stonesNew: 1, stonesLevel: Infinity, headroom: 30, climbing: true }), /^storm cloud above/);
  assert.equal(hint({ ...slow(1), thermal: 1, against: 3 }), level);
});

test('the iron loose in the sky is pointed out while it is there to be had: a strike\'s own plates, the plate under a cloud, the first fronts\' plates and the fog\'s bait', () => {
  assert.equal(hint({ sprayed: true }), 'your plates sprayed — catch any on the way');
  assert.equal(hint({ thunder: true }), '25 kg under the cloud — grab it and leave');
  // Climbing toward the cloud, its own warning comes first; once the climb stops under it, the plate.
  assert.equal(hint({ thunder: true, headroom: 30, climbing: true }), 'storm cloud above — lift ends at its base');
  assert.equal(hint({ thunder: true, headroom: 30, climbing: false }), '25 kg under the cloud — grab it and leave');
  assert.equal(hint({ front: true, fronts: 1 }), 'plates on the gust — widen your circle');
  assert.equal(hint({ front: true, fronts: FRONTS_TAUGHT }), 'plates on the gust — widen your circle');
  assert.equal(hint({ front: true, fronts: FRONTS_TAUGHT + 1 }), '', 'after the first fronts the plates speak for themselves');
  assert.equal(hint({ bait: true }), 'fog bait — be over it as the fog lifts it');
  // In the order they are gone in: the sprayed plates first, the bait last of them.
  assert.match(hint({ sprayed: true, stones: 500, stonesNew: 1, stonesLevel: 1, thunder: true, front: true, fronts: 1, bait: true }), /^your plates/);
  assert.match(hint({ stones: 500, stonesNew: 1, stonesLevel: Infinity, thunder: true }), /^rune stones/);
  assert.match(hint({ front: true, fronts: 1, bait: true }), /^fog bait/);
  // The fog, a storm cloud climbed toward and the news outrank all of them; turning against the
  // flock and a trail outrank the bait; and a dying lift waits for it.
  assert.match(hint({ sprayed: true, fogClearance: 40 }), /^fog closing in/);
  assert.match(hint({ sprayed: true, headroom: 30, climbing: true }), /^storm cloud above/);
  assert.match(hint({ bait: true, horn: 1 }), /^Gjallarhorn/);
  assert.match(hint({ bait: true, thermal: 1, against: 2 }), /^ravens turn/);
  assert.match(hint({ bait: true, trail: true }), /^lift dying — follow/);
  assert.match(hint({ bait: true, thermal: 1, dying: true }), /^fog bait/);
});

test('a front\'s plates wait for the first lesson of the climb, which has only two thermals, for centring and for a dying lift, which they would not help, and come before the brake\'s lesson', () => {
  const front = { front: true, fronts: 1 };
  assert.equal(hint({ ...front, thermal: 1, rides: 1, lift: 14 }), 'climb beside the ravens, never through');
  assert.equal(hint({ ...front, thermal: 2, rides: 2, lift: 14 }), 'climb beside the ravens, never through');
  assert.equal(hint({ ...front, thermal: 1, rides: 3, shallow: true, lift: 14 }), 'straighten in the surge, turn as it fades');
  assert.equal(hint({ ...front, thermal: 1, rides: 3, dying: true }), 'lift dying — leave when the ravens leave');
  assert.match(hint({ ...front, thermal: 1, rides: 3, against: 2 }), /^ravens turn/);
  // From the third thermal, and in the launch column, the plates are pointed out while they come.
  for (const rides of [3, 4, 5]) assert.equal(hint({ ...front, thermal: 1, rides, lift: 14 }), 'plates on the gust — widen your circle');
  assert.equal(hint({ ...front, thermal: 0, rides: 1, lift: 14 }), 'plates on the gust — widen your circle');
  assert.equal(hint({ thermal: 1, rides: 3, lift: 14 }), 'ease the brake each circle or it goes deep', 'and the brake\'s lesson has it back');
});

test('the teaching lines are not crowded out: level with the stones, the centring and the brake lessons have the hint back once the moment to dash has passed', () => {
  const level = { stones: 500, stonesNew: STONES_AGAIN + 10, stonesLevel: STONES_NEWS - 0.1 };
  const passed = { ...level, stonesLevel: STONES_NEWS };
  const centring = { thermal: 1, rides: 3, shallow: true, lift: 14 };
  const brake = { thermal: 2, rides: 4, lift: 14 };
  const ravens = { thermal: 1, rides: 2, lift: 14 };
  for (const lesson of [centring, brake, ravens]) assert.equal(hint({ ...lesson, ...level }), 'fly through a glowing rune for its blessing');
  assert.equal(hint({ ...centring, ...passed }), 'straighten in the surge, turn as it fades');
  assert.equal(hint({ ...brake, ...passed }), 'ease the brake each circle or it goes deep');
  assert.equal(hint({ ...ravens, ...passed }), 'climb beside the ravens, never through');
  // Climbing on past them, with the stones still waiting, the lessons keep it.
  assert.equal(hint({ ...brake, ...level, stonesLevel: 25 }), 'ease the brake each circle or it goes deep');
  // A strong climb, level some 3 s after they were raised, has its lesson back as their news ends.
  assert.equal(hint({ ...ravens, stones: 500, stonesNew: STONES_NEWS, stonesLevel: 1 }), 'climb beside the ravens, never through');
  // So too once the stones' news is old and before the climb has come level with them.
  assert.equal(hint({ ...centring, stones: 500, stonesNew: STONES_NEWS + 1, stonesLevel: Infinity }), 'straighten in the surge, turn as it fades');
});

test('every line the rune stones, the Beast and the loose iron add fits one line of a narrow phone, and each moment has its own', () => {
  const moments = [
    { bell: 1, beast: true }, { bell: 1, beast: true, touch: true }, { bell: 2, beast: true },
    { closeCall: 0, beastClose: true }, { closeCall: 0, double: true }, { glanced: 0 }, { barLost: 3 }, { depth: 0, double: true },
    ...[1, 2, 3, 4].map((rune) => ({ blessing: rune, blessed: 0 })),
    { stones: 500, stonesNew: 0, stonesLevel: Infinity }, { stones: 1000, stonesNew: 0, stonesLevel: Infinity },
    { stones: 1000, stonesNew: 0, stonesLevel: Infinity, blessing: RUNE.tiwaz }, { stones: 500, stonesNew: 9, stonesLevel: 0 },
    { sprayed: true }, { thunder: true }, { front: true, fronts: 1 }, { bait: true },
  ];
  const lines = moments.map(hint);
  assert.equal(new Set(lines).size, moments.length, 'each moment has its own line');
  for (const line of lines) {
    assert.ok(line.length > 0);
    assert.ok([...line].length <= HINT_WIDTH, `"${line}" is ${[...line].length} characters`);
  }
  for (const line of BLESSED.slice(1)) assert.ok([...line].length <= HINT_WIDTH, `"${line}"`);
});

test('Gjallarhorn is said the moment it sounds, whatever line was up a moment before', () => {
  const held = { line: '', since: 0 };
  holdHint(held, 'ravens circle where air rises — fly there', 109.6);
  assert.equal(holdHint(held, hint({ horn: 0 }), 110), 'Gjallarhorn — every lift counts double');
});

test('high in a run a stall says both beats, let go and then brake the surge as it flies again, where a gentle one says only to let go', () => {
  assert.equal(hint({ stall: 1, harsh: true }), 'stalled — let go, then brake the surge');
  assert.equal(hint({ stall: 1, stallSide: 1, harsh: true }), 'spin — let go, then brake the surge');
  assert.equal(hint({ stall: 1 }), 'stalled — let go, the wing flies again');
  // Over the fjord, where nothing is harsh, the lines are as they always were.
  assert.equal(stallHint(1, 0), 'stalled — let go, the wing flies again');
  assert.equal(stallHint(1, -1), 'spin — too much brake in the turn, let go');
  assert.equal(stallHint(0, 0, true), '');
});

test('a surging wing is said at once with how to catch it, and the tuck a missed one ends in says so for the next, after a fold and a stall but before a kettlebell', () => {
  assert.equal(hint({ surging: 1 }), 'wing surging — brake till it swings back');
  assert.equal(hint({ surging: 1, touch: true }), 'wing surging — hold ▼ till it swings back');
  assert.equal(hint({ tucked: 0.4 }), 'front tuck — brake as the wing surges');
  assert.equal(hint({ tucked: 0.4, touch: true }), 'front tuck — hold ▼ as the wing surges');
  assert.equal(hint({ tucked: TUCK_SAID }), '');
  assert.match(hint({ surging: 1, collapse: 1 }), /^raven strike/);
  assert.match(hint({ surging: 1, stall: 1, harsh: true }), /^stalled/);
  assert.match(hint({ surging: 1, tucked: 0.4, bell: 1, load: 0.9, cloud: 1 }), /^wing surging/);
  assert.match(hint({ tucked: 0.4, bell: 1, load: 0.9, cloud: 1 }), /^front tuck/);
  for (const moment of [{ surging: 1 }, { tucked: 0.4 }]) {
    const held = { line: '', since: 0 };
    holdHint(held, 'climb beside the ravens, never through', 10);
    assert.equal(holdHint(held, hint(moment), 10.1), hint(moment), 'said at once');
  }
});

test('with the ears in, a kettlebell is dodged by turning off the line, never by the bar they leave no room for', () => {
  assert.equal(hint({ bell: 1, ears: 1 }), 'kettlebell — turn off your line');
  assert.equal(hint({ bell: 1, ears: 0.6, beast: true }), 'kettlebell — the Beast: turn off your line');
  assert.equal(hint({ bell: 1, ears: 0.2 }), 'kettlebell — push the bar or straighten');
});

test('the brake going deep out of lift names the ears as the way down, on keys and on a phone, until they have been used, and in lift still says ease off', () => {
  assert.equal(hint({ deep: 1, lift: 0 }), 'brake going deep — let go; E to sink fast');
  assert.equal(hint({ deep: 1, lift: 0, touch: true }), 'brake going deep — let go; ▼▼ sinks fast');
  assert.equal(hint({ deep: 1, lift: 0, earsUsed: true }), 'brake going deep — ease off now');
  assert.equal(hint({ deep: 1, lift: 5 }), 'brake going deep — ease off now');
});

test('the ears held in climbing air say they will not beat it, and to fly out of the lift as well', () => {
  assert.equal(hint({ earsClimb: EARS_CLIMB + 0.1 }), 'ears won\'t beat this lift — fly out too');
  assert.equal(hint({ earsClimb: EARS_CLIMB }), '');
});

test('too high over the next plate of a trail for the bar to reach it, the hint names the ears, before the trail\'s own line', () => {
  assert.equal(hint({ trailHigh: true, trail: true }), 'too high for the plates — big ears (E)');
  assert.equal(hint({ trailHigh: true, trail: true, touch: true }), 'too high for the plates — ▼▼ big ears');
  assert.equal(hint({ trail: true }), 'lift dying — follow the plates on the bar');
});

test('on the way into the first thermals the hint teaches the entry, and the moment to turn in is said at once, the way the ravens turn', () => {
  assert.equal(hint({ approach: true, approachDir: 1, rides: 0 }), 'ravens on your ▶; turn ▶ as that wing lifts');
  assert.equal(hint({ approach: true, approachDir: -1, rides: ENTRY_RIDES - 1 }), 'ravens on your ◀; turn ◀ as that wing lifts');
  assert.equal(hint({ approach: true, approachDir: 1, rides: ENTRY_RIDES }), '');
  assert.equal(hint({ turnIn: 0.2, turnSide: 1 }), 'turn ▶ now — into the lifted wing');
  assert.equal(hint({ turnIn: 0.2, turnSide: -1 }), 'turn ◀ now — into the lifted wing');
  assert.equal(hint({ turnIn: TURN_SAID }), '');
  // A fold, a stall, a surge, a kettlebell, the brake and a cloud all come first.
  assert.match(hint({ turnIn: 0.2, turnSide: 1, cloud: 1 }), /^in cloud/);
  assert.match(hint({ turnIn: 0.2, turnSide: 1, bell: 2 }), /^kettlebell/);
  const held = { line: '', since: 0 };
  holdHint(held, hint({ approach: true, approachDir: 1, rides: 0 }), 10);
  assert.equal(holdHint(held, hint({ turnIn: 0, turnSide: 1 }), 10.2), 'turn ▶ now — into the lifted wing', 'said at once');
});

test('every line the wing\'s new moments add fits one line of a narrow phone, and each moment has its own', () => {
  const moments = [
    { collapse: 1, touch: true }, { collapse: 1, bellHit: true, touch: true }, { stall: 1, harsh: true }, { stall: 1, stallSide: 1, harsh: true },
    { surging: 1 }, { surging: 1, touch: true }, { tucked: 0.4 }, { tucked: 0.4, touch: true },
    { deep: 1, lift: 0 }, { deep: 1, lift: 0, touch: true }, { earsClimb: 9 }, { trailHigh: true }, { trailHigh: true, touch: true }, { approach: true, approachDir: 1, rides: 0 }, { approach: true, approachDir: -1, rides: 0 },
    { turnIn: 0, turnSide: 1 }, { turnIn: 0, turnSide: -1 },
    { tipped: 0.5 }, { nearTuck: true }, { nearTuck: true, touch: true }, { nearTip: true },
    { landed: 0.5, trick: 'wingover ×12', points: 12_345 }, { lost: 0.5 }, { unscored: 0.5 }, { inHand: 'wingover ×10' }, { inHand: 'pitch ×4', inHandPitch: true },
    { pitching: true, tricksLanded: 0 }, { pitching: true, tricksLanded: 0, touch: true }, { wingover: true, tricksLanded: 0 },
    { wingover: true, tricksLanded: 0, touch: true },
  ];
  const lines = moments.map(hint);
  assert.equal(new Set(lines).size, moments.length, 'each moment has its own line');
  for (const line of lines) {
    assert.ok(line.length > 0);
    assert.ok([...line].length <= HINT_WIDTH, `"${line}" is ${[...line].length} characters`);
  }
});

test('a trick near its fold is warned of at once, after a surge, a tuck or a tip but before a kettlebell, and a tip says how to keep off the next', () => {
  assert.equal(hint({ tipped: 0.5 }), 'tip collapse — stop swapping short of red');
  assert.equal(hint({ tipped: TIP_SAID }), '');
  assert.equal(hint({ nearTuck: true }), 'too far ahead — brake it sooner');
  assert.equal(hint({ nearTuck: true, touch: true }), 'too far ahead — ▼ sooner');
  assert.equal(hint({ nearTip: true }), 'too steep — ease off or a tip folds');
  assert.match(hint({ nearTuck: true, surging: 1 }), /^wing surging/);
  assert.match(hint({ nearTip: true, tipped: 0.5 }), /^tip collapse/);
  assert.match(hint({ nearTip: true, bell: 1, load: 0.9 }), /^too steep/);
  for (const moment of [{ tipped: 0.5 }, { nearTuck: true }, { nearTip: true }]) {
    const held = { line: '', since: 0 };
    holdHint(held, 'climb beside the ravens, never through', 10);
    assert.equal(holdHint(held, hint(moment), 10.1), hint(moment), 'said at once');
  }
});

test('a set of tricks landed or lost is said, then how to land one in hand, and how to fly them until two have landed; below the grace height, that style waits', () => {
  assert.equal(hint({ landed: 1, trick: 'wingover ×5', points: 245 }), 'landed — wingover ×5, +245 style');
  assert.equal(hint({ landed: 1, trick: 'tricks ×9', points: 1250 }), 'landed — tricks ×9, +1,250 style');
  assert.equal(hint({ landed: TRICK_SAID, trick: 'wingover ×5', points: 245 }), '');
  assert.equal(hint({ lost: 1 }), 'trick lost — level out to land the next');
  assert.equal(hint({ lost: LOST_SAID }), '');
  assert.equal(hint({ unscored: 1 }), 'style counts from 260 m — climb first');
  assert.equal(hint({ inHand: 'wingover ×3' }), 'wingover ×3 — level out to land it');
  assert.equal(hint({ inHand: 'pitch ×3', inHandPitch: true }), 'pitch ×3 — brake the surge to land it');
  assert.equal(hint({ pitching: true, tricksLanded: 0 }), 'pitch: brake when ahead, let go when behind');
  assert.equal(hint({ pitching: true, tricksLanded: 0, touch: true }), 'pitch: ▼ when ahead, let go when behind');
  assert.equal(hint({ wingover: true, tricksLanded: 1 }), 'wingover — swap turns as each swing peaks');
  assert.equal(hint({ wingover: true, tricksLanded: 1, touch: true }), 'wingover — ◀ ▶ in turn as each swing peaks');
  assert.equal(hint({ wingover: true, pitching: true, tricksLanded: TRICKS_TAUGHT }), '', 'taught until two have landed');
  // A set in hand is said over how to fly it; the meet's news, a kettlebell and the depth come first.
  assert.match(hint({ inHand: 'wingover ×3', wingover: true, tricksLanded: 0 }), /level out to land it$/);
  assert.match(hint({ depth: 1, landed: 1, trick: 'pitch ×3', points: 115 }), /^depth/);
  assert.match(hint({ bell: 2, inHand: 'wingover ×3' }), /^kettlebell/);
});
