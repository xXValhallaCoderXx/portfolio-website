// What one fixed step of the wing costs, in microseconds, for each regime it flies in. Coach
// forecasts fly thousands of steps and the bots and the board's function fly whole runs, so the
// solver's cost is multiplied everywhere: keep ordinary flight at about 5 µs or under. Run with
// `npm run bench:flight` for the classic wing, or name wings: `npm run bench:flight -- en-a acro`
// (best on an idle machine; compare medians, not single runs).
import type { FlightInput } from '../src/domains/flight/models.ts';
import { createFlight, stepFlight } from '../src/domains/flight/flight.ts';
import { brakeByte } from '../src/domains/flight/brake-controls.ts';
import { GLIDERS } from '../src/domains/good-lift/gliders.ts';

const pair = (left: number, right: number = left): FlightInput =>
  ({ controlMode: 'brakes', leftBrake: brakeByte(left) / 255, rightBrake: brakeByte(right) / 255 });
const REGIMES: Array<[string, FlightInput]> = [
  ['trim', pair(0)],
  ['turn 0.5/0.2', pair(0.5, 0.2)],
  ['spiral 0.82', pair(0.82, 0)],
  ['full stall', pair(1)],
  ['legacy turn+brake', { turn: 1, brake: true }],
];
const STEPS = 30_000, ROUNDS = 5, STEP = 1 / 60;

function bench(controls: FlightInput, wing: string) {
  const times: number[] = [];
  for (let round = -1; round < ROUNDS; round++) {
    const g = createFlight({ x: 0, y: 1e6, z: 0 }, wing);
    // Settle into the regime before timing it, so a transient is not what is measured.
    for (let i = 0; i < 600; i++) stepFlight(g, controls, {}, STEP);
    const start = performance.now();
    for (let i = 0; i < STEPS; i++) stepFlight(g, controls, {}, STEP);
    if (round >= 0) times.push((performance.now() - start) * 1000 / STEPS);
  }
  return times.sort((a, b) => a - b)[ROUNDS >> 1];
}

const asked = process.argv.slice(2);
const wings = asked.includes('all') ? ['classic', ...GLIDERS] : asked.length ? asked : ['classic'];
for (const wing of wings) {
  console.log(wing);
  for (const [name, controls] of REGIMES) console.log(`  ${name.padEnd(20)} ${bench(controls, wing).toFixed(2).padStart(6)} µs/step`);
}
