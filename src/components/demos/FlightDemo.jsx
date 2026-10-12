import { useEffect, useRef, useState } from 'react';

// A sample flight replayed the way Flight Log replays a real one: the route on a map, a pilot
// marker moving along it, the altitude chart underneath, and a scrubber. The track is made up.

const DURATION = 14 * 60; // the flight's length, in seconds
const RATE = 60; // playback speed: the app's fastest
const ROUTE =
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

function altitudeAt(t) {
  const i = Math.max(
    1,
    CLIMB.findIndex(([at]) => at >= t),
  );
  const [t0, a0] = CLIMB[i - 1];
  const [t1, a1] = CLIMB[i];
  const ease = (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, (t - t0) / (t1 - t0))))) / 2;
  return a0 + (a1 - a0) * ease;
}

const speedAt = (t) => Math.round(33 + 6 * Math.sin(t * 31) - 4 * Math.cos(t * 9));
const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const CHART = Array.from({ length: 81 }, (_, i) => `${(i / 80) * 320},${44 - ((altitudeAt(i / 80) - 100) / 1100) * 40}`).join(' ');

export default function FlightDemo() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState(null);
  const at = useRef(0);
  const route = useRef(null);

  // The route is measured once, so the marker and the flown part can be drawn from plain points.
  useEffect(() => {
    const length = route.current.getTotalLength();
    setTrack(Array.from({ length: 241 }, (_, i) => route.current.getPointAtLength((length * i) / 240)));
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now) => {
      at.current = Math.min(1, at.current + (((now - last) / 1000) * RATE) / DURATION);
      last = now;
      setT(at.current);
      if (at.current >= 1) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seek = (next) => {
    at.current = next;
    setT(next);
  };

  const here = track ? track[Math.round(t * 240)] : { x: 46, y: 62 };
  const flown = track
    ? track
        .slice(0, Math.round(t * 240) + 1)
        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(' ')
    : '';
  return (
    <div className="demo flight-demo">
      <svg
        className="flight-map"
        viewBox="0 0 320 190"
        role="img"
        aria-label="A sample flight drawn on a map: a route from a hillside launch out over the water and back to land."
      >
        <path className="water" d="M0 96 C40 84 70 112 112 104 C150 96 170 76 214 84 C256 92 286 70 320 78 L320 190 L0 190 Z" />
        <path
          className="ground"
          d="M30 70 C30 44 62 34 80 48 C96 60 88 84 66 88 C46 90 30 86 30 70 Z M42 68 C42 54 60 48 70 56 C78 64 74 76 62 78 C50 80 42 76 42 68 Z"
        />
        <path className="ground" d="M236 150 C236 138 252 132 264 138 C276 144 276 160 262 164 C248 168 236 162 236 150 Z" />
        <path className="planned-route" d={ROUTE} ref={route} />
        <polyline className="flown-route" points={flown} />
        <g className="pin">
          <circle cx="46" cy="62" r="3" />
          <text x="54" y="58">
            start
          </text>
          <circle cx="104" cy="160" r="3" />
          <text x="112" y="172">
            stop
          </text>
        </g>
        <g className="pilot-marker" transform={`translate(${here.x} ${here.y})`}>
          <circle r="7" />
          <path d="M-6 -1 Q0 -7 6 -1 M-4 0 L0 5 L4 0" />
        </g>
      </svg>

      <svg className="flight-chart" viewBox="0 0 320 48" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={`0,48 ${CHART} 320,48`} />
        <polyline points={CHART} />
        <line x1={t * 320} x2={t * 320} y1="0" y2="48" />
      </svg>

      <dl className="readouts">
        <div>
          <dt>time</dt>
          <dd>
            {clock(t * DURATION)} <span className="dim">/ {clock(DURATION)}</span>
          </dd>
        </div>
        <div>
          <dt>altitude</dt>
          <dd>{Math.round(altitudeAt(t)).toLocaleString('en')} m</dd>
        </div>
        <div>
          <dt>speed</dt>
          <dd>{t > 0 && t < 1 ? speedAt(t) : 0} km/h</dd>
        </div>
      </dl>

      <div className="demo-bar">
        <button
          className={t === 0 ? 'primary' : undefined}
          onClick={() => {
            if (!playing && t >= 1) seek(0);
            setPlaying(!playing);
          }}
        >
          [ {playing ? '❚❚ pause' : t > 0 && t < 1 ? '▶ resume' : '▶ replay flight'} ]
        </button>
        <input
          type="range"
          min="0"
          max="1000"
          value={Math.round(t * 1000)}
          onChange={(event) => seek(event.target.value / 1000)}
          aria-label="Scrub through the flight"
          aria-valuetext={`${clock(t * DURATION)} of ${clock(DURATION)}`}
        />
        <span className="dim">×{RATE}</span>
      </div>
      <p className="demo-note">// a sample track, not a real flight</p>
    </div>
  );
}
