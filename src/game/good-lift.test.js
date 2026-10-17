// Acceptance of the slower, flight-first game against actual seeded weather and the shared core.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudbaseRun, CLOUD_RAVENS } from './cloudbase-state.js';
import { createRunWorld, startRun, stepRun, stepBits, finishRun, RUN } from './run-step.js';
import { createMeet } from './meet-state.js';
import { createBells, BELLS } from './bells.js';
import { createStyle } from './meet-style.js';
import { createReferenceKeys, createReferencePilot, TST } from './pilots.js';
import { summariseRun } from './meet-sheet.js';
const make = (seed, style = null) => startRun(createRunWorld({ sky: createCloudbaseRun(), meet: createMeet(), bells: createBells(), style }), seed);
let flights;
function survey() {
  return flights ??= Array.from({length:32}, (_, i) => {
    const world = make(i + 1, createStyle());
    const keys = createReferenceKeys(TST);
    let reason = null;
    let beforeStrikes = 0;
    let strikes = 0;
    let beforeThrows = 0;
    while (!reason && world.steps <= 36000) {
      const elapsed = world.sky.state.elapsed;
      reason = stepBits(world, keys(world));
      if (world.sky.state.pilot.strikes > strikes && (elapsed < 59.9 || world.g.pos.y < CLOUD_RAVENS.grace)) beforeStrikes += world.sky.state.pilot.strikes - strikes;
      strikes = world.sky.state.pilot.strikes;
      if (world.sky.state.peak < BELLS.floor) beforeThrows = Math.max(beforeThrows, world.bells.state.thrown);
    }
    assert.ok(reason, `seed ${i+1} terminates`);
    finishRun(world, reason);
    const sheet = summariseRun(world, reason);
    return { ...sheet, beforeStrikes, beforeThrows };
  });
}
test('skilled seeded soaring lasts five to eight minutes without exaggerated lift', (t) => {
  const runs = survey();
  const durations = runs.map(r => r.seconds).sort((a,b)=>a-b);
  const median = (durations[15] + durations[16]) / 2;
  t.diagnostic(`32 skies: median ${median.toFixed(1)}s; ${runs.filter(r=>r.seconds>=300 && r.seconds<=480).length}/32 within five to eight minutes; ${runs.filter(r=>r.peak>=150).length}/32 reach the opener`);
  assert.ok(median >= 300 && median <= 480, `median ${median.toFixed(1)}s; ${durations.map(Math.round)}`);
  assert.ok(runs.filter(r=>r.seconds>=300 && r.seconds<=480).length >= 22, 'most skies allow a useful soaring session');
  assert.ok(runs.every(r=>r.steps<=36000 && r.seconds<=600.01));
  assert.ok(runs.filter(r=>r.peak>=150).length>=28, 'the first banking line is approachable');
});
test('the calm opening and progression gates hold across a multi-seed flight survey', () => {
  for (const run of survey()) {
    assert.equal(run.beforeStrikes, 0, `early raven strike on seed${run.seed}`);
    assert.equal(run.beforeThrows, 0, `early attack on seed${run.seed}`);
    assert.ok(Number.isFinite(run.total) && run.total>=0);
    assert.equal(run.trace.n, Math.floor(run.steps/60)+1);
  }
});
test('watching and scoring maneuvers cannot change the flight or weather', () => {
  const a=make(17), b=make(17,createStyle());
  const intent={turn:0,brake:false,bar:false,ears:false};
  for(let n=0;n<1200;n++) {
    intent.turn=n<600?0.35:-0.35;
    const ea=stepRun(a,intent,RUN.step), eb=stepRun(b,intent,RUN.step);
    assert.equal(ea,eb); assert.deepEqual(a.g.pilot,b.g.pilot); assert.deepEqual(a.g.canopy,b.g.canopy);
    if(ea)break;
  }
  assert.deepEqual(a.sky.state,b.sky.state);
});
test('ordinary circling and transfer guidance do not farm maneuver rewards', () => {
  for(const run of survey()) assert.equal(run.stats.style,0, `ordinary soaring style on seed${run.seed}`);
});

test('the reference pilot chooses reachable lift over a closer cell about to fade at the edge', () => {
  const world = make(1);
  Object.assign(world.g.pos, { x: 0, y: 1000, z: 0 });
  world.sky.state.thermals.forEach(t => { t.live = false; });
  Object.assign(world.sky.state.thermals[1], { x: -10, z: -20, live: true, strength: 1, life: 100, age: 10, edgeFade: 2, vx: 0, vz: 0 });
  Object.assign(world.sky.state.thermals[2], { x: 80, z: 0, live: true, strength: 1, life: 100, age: 10, edgeFade: -1, vx: 0, vz: 0 });
  const intent = createReferencePilot({ catches: false }).decide(world, {});
  assert.ok(intent.turn > 0, 'turn east toward the lasting source, rather than west toward the dying one');
});
