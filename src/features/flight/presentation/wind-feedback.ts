import type { AirSample } from '../../../domains/flight/models.ts';
// Presentation of the sampled air. These helpers never advance weather or change the wing.
import { FLIGHT } from '../../../domains/flight/flight.ts';
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const octant = (angle: number) => ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
const clamp = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));

/** World destination and relative arrow describe the same local horizontal air vector. */
export function windReadout(air: { windX?: number; windZ?: number }, yaw = 0) {
  const x = air.windX || 0, z = air.windZ || 0;
  const speed = Math.hypot(x, z);
  if (speed < 0.15) return 'calm · 0 km/h';
  const heading = Math.atan2(x, -z);
  return `${ARROWS[octant(heading - yaw)]} to ${COMPASS[octant(heading)]} ${Math.round(speed * 3.6)} km/h`;
}

/** A source cue explains environmental lift/sink, rather than the pilot's resulting climb. */
export function ridgeFeedback<T extends AirSample>(air: T) {
  const ridge = air.ridge || 0, lee = air.lee || 0, thermal = air.thermal || 0;
  if (lee >= 0.4 && (air.windY || 0) < -0.2 && lee > ridge)
    return { state: 'lee', title: 'SINKING AIR', detail: 'Wind has passed over the cliff; air drops on this sheltered side.', progress: clamp(lee / 4, 0, 1) };
  if (ridge >= 0.35 && (air.windY || 0) > 0.2 && ridge >= thermal && ridge > lee) {
    const strong = (air.windY ?? 0) >= FLIGHT.sink.trim + 0.25;
    return strong
      ? { state: 'ridge', title: 'RIDGE LIFT', detail: 'Ease the turn and fly along the cliff. Watch the vario to confirm your climb.', progress: clamp(ridge / 4, 0, 1) }
      : { state: 'weak', title: 'WEAK RISING AIR', detail: 'This slows your descent. Watch the vario to find air strong enough to climb.', progress: clamp(ridge / 4, 0, 1) };
  }
  return null;
}

/** The first trail is optional news, queued briefly behind more urgent flight instructions. */
export function createPlateNotice() {
  let seen = false, pending = false, detectedAt = -Infinity, until = -Infinity;
  function reset() {
    seen = pending = false;
    detectedAt = until = -Infinity;
  }
  function step(trails: number, clock: number, available: boolean) {
    if (!(trails >= 1)) { reset(); return null; }
    if (!seen) { seen = pending = true; detectedAt = clock; }
    if (clock >= detectedAt + 20) { pending = false; return null; }
    if (!available) return null;
    if (pending) { pending = false; until = Math.min(clock + 6, detectedAt + 20); }
    if (clock >= until) return null;
    return { state: 'plates', title: 'OPTIONAL PLATES', detail: 'Collect bonus kg on the trail toward the next thermal, or keep soaring.', progress: 1 };
  }
  return { reset, step };
}

/** One short notice per transition; a hazard or maneuver can defer it without consuming it. */
export function createWindNotice() {
  let transition = 0, detectedAt = -Infinity, until = -Infinity, heading = 0, pending = false;
  function reset() {
    transition = 0; detectedAt = until = -Infinity; heading = 0; pending = false;
  }
  function step(weather: { transition?: number; toHeading?: number; heading?: number; shifting?: boolean; progress?: number } | null | undefined, clock: number, available: boolean) {
    if (!weather) { reset(); return null; }
    const id = weather.transition ?? 0;
    if (id < transition) reset(); // a fresh run reuses its weather pool
    if (id > transition) {
      transition = id;
      detectedAt = clock;
      heading = weather.toHeading ?? weather.heading ?? 0;
      pending = true;
      until = -Infinity;
    }
    if (pending && clock - detectedAt > 35) pending = false;
    if (!available) return null;
    if (pending) { pending = false; until = clock + 6; }
    if (clock >= until) return null;
    const direction = DIRECTIONS[octant(weather.shifting ? heading : weather.heading ?? heading)];
    const change = weather.shifting ? 'Wind is turning' : 'Wind now blows';
    return { state: 'wind', title: 'WIND SHIFT', detail: `${change} toward the ${direction}. Read the air along the cliffs.`, progress: clamp(weather.progress ?? 0, 0, 1) };
  }
  return { reset, step };
}
