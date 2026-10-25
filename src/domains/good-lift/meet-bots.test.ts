import type { BotScore, BotDeadline } from './meet-bots.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, BOT_FLIGHT, MEDALS, createBotFlight, createBots, landing, medalFor, medalsOf, owing } from './meet-bots.ts';
import { TST, createReferencePilot, flyPilot } from './pilots.ts';
import { createRunWorld, startRun } from './run-step.ts';
import { createCloudbaseRun } from './cloudbase-state.ts';
import { createMeet } from './meet-state.ts';
import { createBells } from './bells.ts';
import { summariseRun } from './meet-sheet.ts';
import { seedFor } from './daily.ts';
import { outranks } from './board.ts';
import { GLIDERS, planFor } from './gliders.ts';

// Two skies: today's Daily Sky as the arch would open it on one day, and a named one.
const SKIES = [seedFor(20_756), 7];

// What each bot comes to on a sky flown whole on the EN-A every pilot starts on, as the tests fly the
// reference pilots (pilots.js): the scores the bots in the page must come to. Each sky's flown once,
// for every test here.
const flown = new Map<number, BotScore[]>();
function reference(seed: number) {
  if (!flown.has(seed)) {
    flown.set(seed, BOTS.map(({ pilot }) => {
      const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells() }), seed);
      const { reason } = flyPilot(world, createReferencePilot({ ...pilot, plan: planFor(GLIDERS[0]) }), { limit: BOT_FLIGHT.limit });
      const sheet = summariseRun(world, reason ?? undefined);
      return { total: sheet.total, peak: sheet.peak, red: sheet.lifts.map((lift) => lift.red), reason: sheet.reason };
    }));
  }
  return flown.get(seed)!;
}
const plain = (scores: readonly (BotScore | null)[]) => scores.map((score) => {
  assert.ok(score); const { total, peak, red, reason } = score;
  return { total, peak, red: [...red], reason };
});

// The page's scheduler as a queue the test runs by hand, and a clock that moves a millisecond each
// time it is read: a slice then flies four chunks before its four milliseconds are up.
function page() {
  const queue: { handle: number; work: (deadline?: BotDeadline) => void }[] = [];
  let handles = 0;
  let ticks = 0;
  return {
    now: () => ticks++,
    later: (work: (deadline?: BotDeadline) => void) => {
      handles += 1;
      queue.push({ handle: handles, work });
      return handles;
    },
    cancel: (handle: number) => {
      const at = queue.findIndex((each) => each.handle === handle);
      if (at >= 0) queue.splice(at, 1);
    },
    // Runs the next slice, with the idle time the browser offers it, if it says, and whether it
    // gave up waiting for some.
    next(idle?: number, timedOut = false) {
      const { work } = queue.shift()!;
      work(idle === undefined ? undefined : { timeRemaining: () => idle, didTimeout: timedOut });
    },
    get waiting() { return queue.length; },
  };
}

test('the bots are TST first, then the pilot holding its line on the light brake, then the collector, and set three medals', () => {
  assert.deepEqual(BOTS.map((bot) => bot.id), ['tst', 'holder', 'collector']);
  assert.equal(BOTS[0].pilot, TST);
  assert.equal(BOTS[0].name, 'TST');
  assert.deepEqual(BOTS[1].pilot, { brake: 'eased' });
  assert.deepEqual(BOTS[2].pilot, { ...TST, collect: true });
  assert.deepEqual(MEDALS, ['bronze', 'silver', 'gold']);
  assert.equal(MEDALS.length, BOTS.length);
});

test('flown a slice at a time, each bot comes to exactly what the same pilot does when the tests fly it whole', () => {
  for (const seed of SKIES) {
    const flight = createBotFlight();
    assert.deepEqual([flight.seed, flight.done, flight.advance(100)], [-1, false, false], 'nothing to fly before a sky is laid out');
    flight.start(seed);
    let slices = 0;
    while (!flight.advance(BOT_FLIGHT.chunk)) slices += 1;
    assert.equal(flight.landed, BOTS.length);
    assert.deepEqual(plain(flight.scores), reference(seed), `seed ${seed}`);
    // Every step was flown a chunk at a time: no chunk flew more than its share.
    assert.ok(flight.steps > 0 && slices >= Math.floor(flight.steps / BOT_FLIGHT.chunk) - BOTS.length, `${flight.steps} steps in ${slices} slices`);
    // Laid out again, the same sky flies to the same scores, all at once too.
    flight.start(seed);
    assert.deepEqual([flight.landed, flight.steps], [0, 0]);
    assert.equal(flight.advance(), true);
    assert.deepEqual(plain(flight.scores), reference(seed));
  }
});

test('the medals go lightest first by what the bots lifted on the sky, not by who they are', () => {
  const scores = (...totals: number[]) => totals.map((total, i) => ({ total, peak: 1000 + i, red: [] }));
  assert.deepEqual(medalsOf(scores(237.5, 145, 360)).map(({ medal, total, by }) => [medal, total, by]), [['bronze', 145, 'holder'], ['silver', 237.5, 'tst'], ['gold', 360, 'collector']]);
  assert.deepEqual(medalsOf(scores(115, 145, 160)).map(({ by }) => by), ['tst', 'holder', 'collector']);
  assert.deepEqual(medalsOf(scores(400, 145, 160)).map(({ by }) => by), ['holder', 'collector', 'tst']);
  // Level on kilos, the higher peak sets the heavier medal; level on both, the bot that flew first the lighter.
  assert.deepEqual(medalsOf([{ total: 240, peak: 900 }, { total: 240, peak: 1100 }, { total: 760, peak: 1300 }].map((each) => ({ ...each, red: [] }))).map(({ by }) => by), ['tst', 'holder', 'collector']);
  assert.deepEqual(medalsOf([{ total: 240, peak: 900 }, { total: 240, peak: 900 }, { total: 760, peak: 1300 }].map((each) => ({ ...each, red: [] }))).map(({ by }) => by), ['tst', 'holder', 'collector']);
  // And on the skies the bots really fly, the medals climb, each one a bot's own score.
  for (const seed of SKIES) {
    const medals = medalsOf(reference(seed));
    assert.deepEqual(medals.map((mark) => mark.medal), MEDALS);
    for (let i = 1; i < medals.length; i++) assert.equal(outranks(medals[i - 1], medals[i]), false, `seed ${seed}`);
    assert.deepEqual(new Set(medals.map((mark) => mark.by)), new Set(BOTS.map((bot) => bot.id)));
    for (const mark of medals) assert.equal(mark.total, reference(seed)[BOTS.findIndex((bot) => bot.id === mark.by)].total);
  }
});

test('a run takes a medal for each bot it beats, as the board ranks runs, and only if the sky judged it', () => {
  const scores = [{ total: 237.5, peak: 1040, red: [] }, { total: 145, peak: 1152, red: [] }, { total: 360, peak: 1300, red: [] }];
  const run = (total: number, peak = 1000, reason = 'fog') => ({ total, peak, reason });
  assert.equal(medalFor(run(100), scores), '');
  assert.equal(medalFor(run(145, 1152), scores), '', 'a tie on both is the bot\'s');
  assert.equal(medalFor(run(145, 1153), scores), 'bronze');
  assert.equal(medalFor(run(150), scores), 'bronze');
  assert.equal(medalFor(run(237.5, 1041), scores), 'silver');
  assert.equal(medalFor(run(300), scores), 'silver');
  assert.equal(medalFor(run(362.5, 10), scores), 'gold');
  assert.equal(medalFor(run(362.5, 10, 'landed'), scores), 'gold', 'a touchdown judges the bar as the fog does');
  for (const reason of ['quit', '', undefined]) assert.equal(medalFor({ total: 999, peak: 3000, reason }, scores), '', String(reason));
  // Against the bots of a real sky: level with the bronze mark takes nothing, a metre higher takes a
  // medal, and a plate over the gold mark takes gold.
  for (const seed of SKIES) {
    const real = reference(seed);
    const [bronze, , gold] = medalsOf(real);
    assert.equal(medalFor(run(bronze.total, bronze.peak), real), '', `seed ${seed}`);
    assert.notEqual(medalFor(run(bronze.total, bronze.peak + 1), real), '', `seed ${seed}`);
    assert.equal(medalFor(run(gold.total + 2.5, 0), real), 'gold', `seed ${seed}`);
  }
});

test('the bots fly a few milliseconds at a time while the page is idle, never as one long task, and land only after the ask', () => {
  const clock = page();
  const bots = createBots(clock);
  const told: (readonly BotScore[])[] = [];
  bots.fly(SKIES[0], (scores) => { assert.ok(scores); told.push(scores); });
  assert.deepEqual([told.length, clock.waiting, bots.state.steps], [0, 1, 0], 'nothing is flown within the ask');
  let slices = 0;
  let most = 0;
  while (clock.waiting) {
    const before = bots.state.steps;
    clock.next();
    slices += 1;
    most = Math.max(most, bots.state.steps - before);
  }
  // Four chunks in each four milliseconds, so no slice flies more than four chunks' steps.
  assert.equal(most, 4 * BOT_FLIGHT.chunk);
  assert.ok(slices >= bots.state.steps / most, `${slices} slices for ${bots.state.steps} steps`);
  assert.equal(told.length, 1);
  assert.deepEqual(plain(told[0]), reference(SKIES[0]));
  assert.deepEqual(bots.state, { seed: SKIES[0], asked: -1, flying: false, landed: BOTS.length, steps: bots.state.steps, kept: 1 });
});

test('the first slices of a visit make the bots\' worlds and then lay out their sky, each by itself, and fly nothing', () => {
  const clock = page();
  const bots = createBots(clock);
  bots.fly(SKIES[1], () => {});
  clock.next();
  assert.deepEqual([bots.state.seed, bots.state.steps, clock.waiting], [-1, 0, 1], 'the worlds made');
  clock.next();
  assert.deepEqual([bots.state.seed, bots.state.steps, clock.waiting], [SKIES[1], 0, 1], 'the sky laid out');
  clock.next();
  assert.equal(bots.state.steps, 4 * BOT_FLIGHT.chunk);
});

test('a slice takes the idle time the browser offers, and at least a chunk, but a whole slice where the browser has no idle time to give', () => {
  const clock = page();
  const bots = createBots(clock);
  bots.fly(SKIES[1], () => {});
  clock.next();
  clock.next();
  // The idle time offered (none said, where there are no idle callbacks), whether the browser gave
  // up waiting for any, and the chunks flown in four milliseconds.
  for (const [idle, timedOut, chunks] of [[1, false, 1], [2, false, 2], [0, false, 1], [0, true, 4], [undefined, false, 4]] as const) {
    const before = bots.state.steps;
    clock.next(idle, timedOut);
    assert.equal(bots.state.steps - before, chunks! * BOT_FLIGHT.chunk, `${idle} ms idle${timedOut ? ', timed out' : ''}`);
  }
  // A page busy every frame gives the bots a slice each time the wait runs out: a twentieth of its time at most.
  assert.ok(BOT_FLIGHT.slice / BOT_FLIGHT.wait <= 1 / 20, `${BOT_FLIGHT.slice} ms in every ${BOT_FLIGHT.wait}`);
});

test('a slice starts no chunk that the last one says would take it past its time', () => {
  // The chunks a whole slice flies, its first after the worlds are made and the sky laid out, on a
  // clock read as the slice starts and after each chunk, where each chunk takes `took` ms.
  const flown = (took: number[]) => {
    let time = 0;
    let reads = 0;
    const queue: ((deadline?: BotDeadline) => void)[] = [];
    const bots = createBots({ now: () => (reads++ === 0 ? time : (time += took.shift() ?? 1)), later: (work) => queue.push(work), cancel: () => {} });
    bots.fly(SKIES[1], () => {});
    queue.shift()!();
    queue.shift()!();
    queue.shift()!();
    return bots.state.steps / BOT_FLIGHT.chunk;
  };
  // A cold first chunk of 3 ms leaves a millisecond, too little for another like it.
  assert.equal(flown([3]), 1);
  // Chunks of a millisecond fill the four.
  assert.equal(flown([1, 1, 1, 1, 1]), 4);
  // Half a millisecond each, eight of them.
  assert.equal(flown(Array(12).fill(0.5)), 8);
});

test('bots that have flown a sky are kept for the visit, so the same sky never flies them twice', () => {
  const clock = page();
  const bots = createBots(clock);
  const told: (readonly BotScore[])[] = [];
  bots.fly(SKIES[1], (scores) => { assert.ok(scores); told.push(scores); });
  while (clock.waiting) clock.next();
  const steps = bots.state.steps;
  // Asked again, they answer from what the visit keeps on the next slice, flying nothing.
  bots.fly(SKIES[1], (scores) => { assert.ok(scores); told.push(scores); });
  assert.equal(told.length, 1);
  clock.next();
  assert.deepEqual([told.length, clock.waiting, bots.state.steps], [2, 0, steps]);
  assert.equal(told[1], told[0]);
  assert.equal(bots.known(SKIES[1]), told[0]);
  assert.ok(Object.isFrozen(told[0]) && Object.isFrozen(told[0][0]) && Object.isFrozen(told[0][0].red), 'what is kept cannot be changed by whoever is told it');
  assert.equal(bots.known(SKIES[0]), null);
});

test('scores the store kept for the day are handed back without flying, and the visit keeps the last sixteen skies', () => {
  const clock = page();
  const bots = createBots(clock);
  const stored = [{ total: 115, peak: 1040, red: [0, 1] }, { total: 145, peak: 1152, red: [] }, { total: 160, peak: 1110, red: [0] }];
  bots.remember(SKIES[0], stored);
  let told!: readonly BotScore[];
  bots.fly(SKIES[0], (scores) => { assert.ok(scores); told = scores; });
  clock.next();
  assert.deepEqual(told, stored);
  assert.notEqual(told[0].red, stored[0].red);
  assert.equal(bots.state.steps, 0);
  // Sixteen more skies remembered: the first is forgotten, and one remembered again is the newest.
  assert.equal(BOT_FLIGHT.keep, 16);
  for (let seed = 100; seed < 116; seed++) bots.remember(seed, stored);
  assert.equal(bots.known(SKIES[0]), null);
  assert.ok(bots.known(100) && bots.known(115));
  bots.remember(100, stored);
  bots.remember(200, stored);
  assert.deepEqual([bots.known(100) !== null, bots.known(101), bots.state.kept], [true, null, 16]);
});

test('a run flown in between stops the bots, who fly on from where they were for the same sky and start afresh for another', () => {
  const clock = page();
  const bots = createBots(clock);
  const told: { seed: number; scores: readonly BotScore[] }[] = [];
  const ask = (seed: number) => bots.fly(seed, (scores) => { assert.ok(scores); told.push({ seed, scores }); });
  ask(SKIES[0]);
  for (let i = 0; i < 20; i++) clock.next();
  const partway = bots.state.steps;
  assert.ok(partway > 0 && bots.state.flying);
  // A run begins: the bots stop, and nothing more is flown or said.
  bots.pause();
  assert.deepEqual([clock.waiting, bots.state.flying, bots.state.asked], [0, false, -1]);
  assert.equal(told.length, 0);
  // The same sky's next sheet: on from where they were.
  ask(SKIES[0]);
  clock.next();
  assert.ok(bots.state.steps > partway);
  // Another sky's sheet before they land: that sky, laid out in a slice of its own, from the gate.
  ask(SKIES[1]);
  clock.next();
  assert.deepEqual([bots.state.seed, bots.state.steps], [SKIES[1], 0]);
  clock.next();
  assert.ok(bots.state.steps > 0 && bots.state.steps <= 4 * BOT_FLIGHT.chunk);
  while (clock.waiting) clock.next();
  // Only the last ask is answered, with its own sky's bots; the first sky, asked again, starts over.
  assert.deepEqual(told.map(({ seed }) => seed), [SKIES[1]]);
  assert.deepEqual(plain(told[0].scores), reference(SKIES[1]));
  ask(SKIES[0]);
  while (clock.waiting) clock.next();
  assert.deepEqual(told.map(({ seed }) => seed), [SKIES[1], SKIES[0]]);
  assert.deepEqual(plain(told[1].scores), reference(SKIES[0]));
  // Disposed, they stop for good.
  ask(SKIES[1]);
  bots.dispose();
  assert.equal(clock.waiting, 0);
});

test('the run held up against TST is the best the sky judged since the bots were last asked for that sky, whichever sheet it was on', () => {
  const sheet = (seed: number, total: number, peak = 1000, reason = 'fog') => ({ seed, reason, total, peak, at: total });
  // A judged run is owed; a run its pilot ended is not, and leaves the one owed before it be.
  assert.deepEqual(owing(null, sheet(7, 200)), { seed: 7, total: 200, style: 0, peak: 1000 });
  assert.equal(owing(null, sheet(7, 900, 2000, 'quit')), null);
  assert.deepEqual(owing({ seed: 7, total: 200, peak: 1000 }, sheet(7, 900, 2000, 'quit')), { seed: 7, total: 200, peak: 1000 });
  // On the same sky the better run is owed, a touchdown judged as the fog judges.
  assert.deepEqual(owing({ seed: 7, total: 200, peak: 1000 }, sheet(7, 150)), { seed: 7, total: 200, peak: 1000 });
  assert.deepEqual(owing({ seed: 7, total: 200, peak: 1000 }, sheet(7, 200, 1001, 'landed')), { seed: 7, total: 200, style: 0, peak: 1001 });
  // Another sky's run is forgotten: the bots have left its sky.
  assert.equal(owing({ seed: 7, total: 200, peak: 1000 }, sheet(8, 0, 0, 'quit')), null);
  assert.deepEqual(owing({ seed: 7, total: 900, peak: 1000 }, sheet(8, 100)), { seed: 8, total: 100, style: 0, peak: 1000 });
  // So is one on another glider: the bots fly the glider of the run they are asked for.
  const on = (wing: string, total: number, reason = 'fog') => ({ ...sheet(7, total, 1000, reason), wing });
  assert.deepEqual(owing({ seed: 7, wing: 'en-a', total: 900, peak: 1000 }, on('acro', 100)), { seed: 7, wing: 'acro', total: 100, style: 0, peak: 1000 });
  assert.equal(owing({ seed: 7, wing: 'en-a', total: 900, peak: 1000 }, on('acro', 100, 'quit')), null);
  assert.deepEqual(owing({ seed: 7, wing: 'acro', total: 900, peak: 1000 }, on('acro', 100)), { seed: 7, wing: 'acro', total: 900, peak: 1000 });
});

test('what the bots tell a sheet names its run and sky, the medals, the one it took, TST for the board, and whether it beat TST', () => {
  const scores = [{ total: 145, peak: 1152, red: [0, 1] }, { total: 115, peak: 1040, red: [] }, { total: 360, peak: 1300, red: [0] }];
  const run = { at: 1_791_000_000_000, seed: 7, reason: 'fog', total: 150, peak: 900 };
  const said = landing(run, scores, ['beat-the-bot']);
  assert.deepEqual(said, {
    at: run.at,
    seed: 7,
    medals: [{ medal: 'bronze', total: 115, peak: 1040, by: 'holder' }, { medal: 'silver', total: 145, peak: 1152, by: 'tst' }, { medal: 'gold', total: 360, peak: 1300, by: 'collector' }],
    medal: 'silver',
    beat: true,
    tst: { who: 'TST', total: 145, peak: 1152, red: [0, 1] },
    fresh: ['beat-the-bot'],
    scores,
  });
  assert.deepEqual([landing({ ...run, total: 145, peak: 1152 }, scores).beat, landing({ ...run, total: 145, peak: 1152 }, scores).fresh], [false, []], 'level with TST is no win');
  assert.deepEqual([landing({ ...run, reason: 'quit' }, scores).medal, landing({ ...run, reason: 'quit' }, scores).beat], ['', false]);
});

test('bots fly the player\'s glider, the EN-A unless another is named, each glider\'s kept apart', async () => {
  const clock = page();
  const bots = createBots(clock);
  const starter = [{ total: 115, peak: 1040, red: [0] }], acro = [{ total: 90, peak: 980, red: [] }];
  bots.remember(SKIES[1], starter);
  bots.remember(SKIES[1], acro, 'acro');
  assert.deepEqual(bots.known(SKIES[1]), starter);
  assert.deepEqual(bots.known(SKIES[1], 'en-a'), starter);
  assert.deepEqual(bots.known(SKIES[1], 'acro'), acro);
  assert.equal(bots.known(SKIES[1], 'en-d'), null);
  // A glider's bots fly in that glider.
  const flight = createBotFlight();
  flight.start(SKIES[1], 'en-c');
  assert.equal(flight.wing, 'en-c');
  flight.advance(10);
  flight.start(SKIES[1]);
  assert.equal(flight.wing, 'en-a');
});

test('on every glider TST lifts a sky\'s worth, inside the band every class keeps to', () => {
  // Means over three Daily skies: a broken bot, one that lands or leaves its lift, falls out. Over 16
  // skies, as SIM_VERSION 6 shipped, the A lifts 258 kg, the B 270, the C 233, the D 223 and the acro
  // 266, strikes folding the half they hit and each bot flying it out by the recovery guide; one sky
  // to the next spreads each by more than a hundred kilos either way, so the order the classes come
  // in is no promise.
  const BAND = Object.freeze({ low: 90, high: 450 });
  for (const wing of GLIDERS) {
    let total = 0;
    for (let day = 20000; day < 20003; day++) {
      const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), wing }), seedFor(day));
      const flown = flyPilot(world, createReferencePilot({ ...TST, plan: planFor(wing) }));
      total += summariseRun(world, flown.reason ?? 'time').total;
    }
    const mean = total / 3;
    assert.ok(mean >= BAND.low && mean <= BAND.high, `${wing}: TST lifts ${mean.toFixed(0)} kg`);
  }
});
