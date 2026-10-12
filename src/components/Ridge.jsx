import { useEffect, useId, useRef, useState } from 'react';

// The career drawn as a climb: one camp per role up a ridge, the first job at the foot and the
// current one at the summit. The camp for the role being read is the one that is lit.

// The trail's switchbacks, from the foot of the ridge to its summit, in the drawing's own units.
const TRAIL = [
  [50, 404],
  [132, 356],
  [86, 304],
  [178, 254],
  [122, 198],
  [198, 142],
  [168, 62],
];

const ROCK = [
  'M0 432 L34 372 L62 330 L84 276 L104 236 L122 176 L146 104 L168 38 L190 92 L210 128 L228 186 L250 232 L268 292 L286 352 L300 432',
  'M168 38 L160 120 L138 210 L150 300 L120 432',
  'M168 38 L182 130 L204 220 L196 320 L224 432',
  'M122 176 L160 120 L182 130 L210 128',
  'M84 276 L138 210 L204 220 L250 232',
  'M62 330 L150 300 L196 320 L268 292',
  'M34 372 L120 432 M286 352 L224 432',
];

// The point a given fraction of the way along the trail.
function along(fraction) {
  const lengths = TRAIL.slice(1).map(([x, y], i) => Math.hypot(x - TRAIL[i][0], y - TRAIL[i][1]));
  let left = fraction * lengths.reduce((sum, length) => sum + length, 0);
  for (let i = 0; i < lengths.length; i += 1) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = Math.min(1, left / lengths[i]);
      return [TRAIL[i][0] + (TRAIL[i + 1][0] - TRAIL[i][0]) * t, TRAIL[i][1] + (TRAIL[i + 1][1] - TRAIL[i][1]) * t];
    }
    left -= lengths[i];
  }
  return TRAIL[0];
}

/** `target` followed smoothly: the value eases toward it over a few frames instead of jumping. */
function useGlide(target) {
  const [value, setValue] = useState(target);
  const now = useRef(target);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      now.current = target;
      setValue(target);
      return undefined;
    }
    let frame = 0;
    let last = performance.now();
    const step = (time) => {
      const dt = Math.min(0.1, (time - last) / 1000);
      last = time;
      now.current += (target - now.current) * (1 - Math.exp(-dt * 6));
      if (Math.abs(target - now.current) < 0.002) now.current = target;
      else frame = requestAnimationFrame(step);
      setValue(now.current);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

// The live view is only worth its download where it will run well and is wanted.
const wantsLive = () =>
  !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(pointer: coarse)').matches && innerWidth >= 760;

/**
 * A live look at rune ridge, the shore in the flight where each role has its stone. It loads the
 * first time it scrolls into view, and its camera goes to stone number `index`, oldest first.
 */
function LiveRidge({ index }) {
  const [wanted] = useState(wantsLive);
  const [live, setLive] = useState(false);
  const stage = useRef(null);
  const view = useRef(null);
  const latest = useRef(index);
  latest.current = index;

  useEffect(() => {
    if (!wanted) return undefined;
    let gone = false;
    let loading = null;
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        loading ??= import('../game/ridge.js').then(({ createRidgeView }) => {
          if (gone) return;
          view.current = createRidgeView(stage.current);
          view.current.focus(latest.current);
          setLive(true);
        });
      }
      view.current?.setVisible(entry.isIntersecting);
    });
    seen.observe(stage.current);
    return () => {
      gone = true;
      seen.disconnect();
      view.current?.dispose();
      view.current = null;
      setLive(false);
    };
  }, [wanted]);

  useEffect(() => {
    view.current?.focus(index);
  }, [index, live]);

  if (!wanted) return null;
  return (
    <div className={`ridge-live${live ? ' live' : ''}`} ref={stage} aria-hidden="true">
      <span>live · rune ridge</span>
    </div>
  );
}

/**
 * `roles` are newest first, as on the page. `lit` and `open` are the hashes of the role being read
 * and the role unfolded; `onPick` is told the hash of a camp that was clicked.
 */
export default function Ridge({ roles, lit, open, onPick }) {
  const climb = [...roles].reverse();
  const shown = climb.findIndex((role) => role.hash === lit);
  const role = climb[shown];
  const last = Math.max(1, climb.length - 1);
  // How far up the trail the climb has got, 0 to 1: it follows the role being read, and the trail
  // behind it stays faintly lit.
  const reached = useGlide(Math.max(0, shown) / last);
  const [hereX, hereY] = along(reached);
  const auraId = `aura-${useId().replace(/:/g, '')}`;
  const trail = TRAIL.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return (
    <figure className="ridge">
      <LiveRidge index={Math.max(0, shown)} />
      <svg
        viewBox="0 0 300 440"
        role="img"
        aria-label="The roles as camps up a ridge: the first at the foot, the current one at the summit."
      >
        <defs>
          <radialGradient id={auraId}>
            <stop offset="0" stopColor="#2dd4ee" stopOpacity="0.55" />
            <stop offset="1" stopColor="#2dd4ee" stopOpacity="0" />
          </radialGradient>
        </defs>
        {ROCK.map((line) => (
          <path className="ridge-rock" d={line} key={line} />
        ))}
        <path className="ridge-trail" d={trail} />
        {/* The part of the trail already climbed, drawn along the same line as the dashes. */}
        <path className="ridge-climbed glow" d={trail} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - reached} />
        <path className="ridge-climbed" d={trail} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - reached} />
        <g className="here" transform={`translate(${hereX.toFixed(1)} ${hereY.toFixed(1)})`}>
          <circle className="aura" r="24" fill={`url(#${auraId})`} />
          <circle className="ripple" r="9" />
        </g>
        {climb.map((camp, i) => {
          const [x, y] = along(i / last);
          const state = `${camp.hash === lit ? ' lit' : ''}${camp.hash === open ? ' open' : ''}${i / last <= reached + 0.01 ? ' passed' : ''}`;
          return (
            <g className={`camp${state}`} transform={`translate(${x} ${y})`} onClick={() => onPick(camp.hash)} key={camp.hash}>
              <circle className="fire" r="4" />
              {/* A wide invisible target, so a camp is easy to hit. */}
              <circle r="16" fill="transparent" />
              <text x={x > 150 ? 14 : -14} y="4" textAnchor={x > 150 ? 'start' : 'end'}>
                {camp.years.match(/\d{4}/)?.[0]}
              </text>
            </g>
          );
        })}
      </svg>
      {role && (
        <figcaption>
          <span className="dim">
            camp {shown + 1} of {climb.length}
            {shown === climb.length - 1 ? ' · the summit' : ''}
          </span>
          <b>{role.company}</b>
          <span>{role.role}</span>
          <span className="dim">{role.years}</span>
        </figcaption>
      )}
    </figure>
  );
}
