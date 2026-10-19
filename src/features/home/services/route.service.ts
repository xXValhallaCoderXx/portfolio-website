export const TAKE_OFF = 1400; // metres, the height the top bar counts down from
// How far across the margin each waypoint sits, so the path has somewhere to wind to.
export const SWAY = [0.66, 0.3, 0.72, 0.34, 0.62];

// The hanging pilot swings like a pendulum when the wing changes direction.
export const SWING = { stiffness: 46, damping: 5.5, push: 0.0052, limit: 0.75 };



/** A smooth path down through `points`, top to bottom, never doubling back on itself. */
export function pathThrough(points: { x: number; y: number }[]) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const reach = (to.y - from.y) / 2;
    d += ` C${from.x} ${from.y + reach} ${to.x} ${to.y - reach} ${to.x} ${to.y}`;
  }
  return d;
}

