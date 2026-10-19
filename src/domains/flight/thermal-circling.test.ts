import test from 'node:test';
import assert from 'node:assert/strict';
import { measureThermalFlight } from '../../test/helpers/test-thermal-flight.ts';

// Minimum climb in forty seconds; measured on both turn directions and drifting sources.
const MINIMUM_GAIN = 25.7232210300;

for (const dir of [-1, 1]) for (const drifting of [false, true]) for (const delay of [0, 0.1, 0.2, 0.3]) {
  test(`real ${drifting ? 'drifting' : 'stationary'} thermal, side ${dir}, ${delay}s reactions retains climb and calm cues`, t => {
    const result = measureThermalFlight({ dir, drifting, delay });
    assert.ok(result.circles >= 2, `${result.circles} complete source-relative circles`);
    assert.ok(result.gain >= MINIMUM_GAIN, `${result.gain}m climb, need ${MINIMUM_GAIN}m`);
    assert.ok(result.changes <= 8, `${result.changes} correction phase changes in 40s`);
    assert.ok(result.qualifiedAt! >= 3 && result.qualifiedAt! < 8, 'the actual manual entry qualifies before measurement');
    assert.equal(result.shownSeconds, 40, 'the confirmed thermal coach stays with the same source');
    assert.equal(result.stallFrames, 0);
    assert.ok(result.maxDistance < 60, 'circles stay inside the actual core envelope');
    assert.ok(result.minimumEase! >= 0.75 - 1e-9 && result.maximumEase <= 1 + 1e-9);
    assert.ok(result.minimumCircle! >= 1.25 - 1e-9);
    t.diagnostic(JSON.stringify(result));
  });
}
