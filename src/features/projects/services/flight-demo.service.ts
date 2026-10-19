// A sample flight replayed the way Flight Log replays a real one: the route on a map, a pilot
// marker moving along it, the altitude chart underneath, and a scrubber. The track is made up.

export const DURATION = 14 * 60; // the flight's length, in seconds
export const RATE = 60; // playback speed: the app's fastest
export const ROUTE =
  'M46 62 C70 38 104 34 128 50 C144 60 150 46 140 38 C128 30 118 44 130 54 C150 70 196 52 232 66 ' +
  'C262 78 280 104 262 126 C244 146 212 132 190 140 C176 146 182 160 194 156 C206 152 198 138 186 144 C160 158 128 150 104 160';

// Height above sea level through the flight: launch, two climbs in thermals, and the glide down.
const CLIMB = [
  [0, 640],
  [0.08, 615],
  [0.3, 1180],
  [0.5, 830],
  [0.64, 1065],
  [0.86, 430],
  [1, 120],
];

export function altitudeAt(t: number) {
  const i = Math.max(
    1,
    CLIMB.findIndex(([at]) => at >= t),
  );
  const [t0, a0] = CLIMB[i - 1];
  const [t1, a1] = CLIMB[i];
  const ease = (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, (t - t0) / (t1 - t0))))) / 2;
  return a0 + (a1 - a0) * ease;
}

export const speedAt = (t: number) => Math.round(33 + 6 * Math.sin(t * 31) - 4 * Math.cos(t * 9));
export const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export const CHART = Array.from({ length: 81 }, (_, i) => `${(i / 80) * 320},${44 - ((altitudeAt(i / 80) - 100) / 1100) * 40}`).join(' ');

