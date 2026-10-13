// Landing grades and leg eligibility are independent of the flight renderer.
export function scoreLanding({ distance, radius, sinkRate }) {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(sinkRate)) {
    throw new RangeError('Landing measurements must be finite, with nonnegative distance and positive radius.');
  }
  const accuracy = 95 * Math.max(0, 1 - distance / radius);
  const softness = 5 * Math.max(0, Math.min(1, (5 - Math.max(0, sinkRate)) / 3));
  const grade = distance <= 1 ? 'bullseye' : distance <= radius / 4 ? 'good' : 'on the ring';
  return { distance, grade, points: Math.round(accuracy + softness) };
}

// Assistance belongs to the whole leg. Taking the controls back never clears it.
export function createLandingLeg() {
  let assisted = true;
  return {
    begin(automatic = false) {
      assisted = Boolean(automatic);
    },
    assist() {
      assisted = true;
    },
    get eligible() {
      return !assisted;
    },
  };
}
