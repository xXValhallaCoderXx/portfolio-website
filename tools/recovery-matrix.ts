// The recovery matrix: how each wing comes out of every failure it can have, hands off and flown by
// the recovery guide 0.15 s late, as seconds to steady flight, metres lost and degrees turned, when a
// guide watching called it saved, and every failure it went through on the way. Its numbers are what gliders.js's GLIDER_RECOVERY pins (glider-recovery.test.js holds the
// solver to them). Run with `npm run recovery:matrix` for every glider, or name wings:
// `npm run recovery:matrix -- en-c acro classic`.
import { FAILURES, canInduce } from '../src/domains/flight/flight.ts';
import { GLIDERS } from '../src/domains/good-lift/gliders.ts';
import { flyFailure, guided, type FailureFlight } from '../src/test/helpers/test-failures.ts';

// Seconds until the wing flies steady (Infinity: never), metres lost, degrees turned, and the failures
// it went through; and, flown, when the recovery guide watching it called it saved.
const time = (seconds: number) => Number.isFinite(seconds) ? seconds.toFixed(2).padStart(6) : ' never';
const shown = (flight: FailureFlight) => !flight.induced ? '  cannot be started yet' :
  `${time(flight.seconds)} s ${flight.lost.toFixed(0).padStart(5)} m ${flight.turned.toFixed(0).padStart(5)}°  saved ${time(flight.saved)} s  ` +
  flight.seen.join(' → ');
// A front collapse, a stall and a deep stall fold both halves alike: one side says it all.
const SYMMETRIC = new Set(['frontal', 'stall', 'deep']);

const asked = process.argv.slice(2);
const wings = asked.length ? asked : [...GLIDERS];
for (const wing of wings) {
  console.log(wing);
  for (const kind of FAILURES) {
    if (!canInduce(wing, kind)) continue;
    for (const side of SYMMETRIC.has(kind) ? [1] : [-1, 1]) {
      const label = `${kind.padEnd(8)} ${SYMMETRIC.has(kind) ? '     ' : side < 0 ? 'left ' : 'right'}`;
      console.log(`  ${label} off   ${shown(flyFailure(wing, kind, { side }))}`);
      console.log(`  ${label} flown ${shown(flyFailure(wing, kind, { side, hands: guided(0.15) }))}`);
    }
  }
}
