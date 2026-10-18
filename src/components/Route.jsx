import { useEffect, useRef } from 'react';
import { NOTES, ROUTE } from '../content.js';
import { contourTile } from '../contours.js';
import { BODIES } from './Sections.jsx';

// The page below the hero is one flight path. It leaves the hero where the glider hangs, winds down
// the margin through a waypoint per section, and a small glider follows it as the page scrolls.
// Scrolling is never taken over: the glider goes where the reader already is.

const TAKE_OFF = 1400; // metres, the height the top bar counts down from
// How far across the margin each waypoint sits, so the path has somewhere to wind to.
const SWAY = [0.66, 0.3, 0.72, 0.34, 0.62];

// The hanging pilot swings like a pendulum when the wing changes direction.
const SWING = { stiffness: 46, damping: 5.5, push: 0.0052, limit: 0.75 };

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A smooth path down through `points`, top to bottom, never doubling back on itself. */
function pathThrough(points) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const reach = (to.y - from.y) / 2;
    d += ` C${from.x} ${from.y + reach} ${to.x} ${to.y - reach} ${to.x} ${to.y}`;
  }
  return d;
}

function Waypoint({ index, waypoint }) {
  const Body = BODIES[waypoint.id];
  const titleId = `${waypoint.id}-title`;
  return (
    <section className="waypoint" id={waypoint.id} aria-labelledby={titleId} style={{ '--sway': SWAY[index % SWAY.length] }}>
      <span className="node" data-node aria-hidden="true" />
      <header className="waypoint-head">
        <span className="number">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2 id={titleId}>{waypoint.title}</h2>
          <p className="sub">{waypoint.sub}</p>
        </div>
        <span className="spacer" />
      </header>
      <div className="waypoint-body">
        <Body />
      </div>
      {NOTES[waypoint.id] && index > 0 && <p className="note">{NOTES[waypoint.id]}</p>}
    </section>
  );
}

/** `hud` is the element in the top bar that shows where along the route the reader is. */
export default function Route({ onFly, hud }) {
  const root = useRef(null);
  const line = useRef(null);
  const flown = useRef(null);
  const marker = useRef(null);
  const hang = useRef(null);

  useEffect(() => {
    const { image, size } = contourTile();
    // On the whole document, so a project's own page is drawn over the same map.
    document.documentElement.style.setProperty('--contours', `url(${image})`);
    document.documentElement.style.setProperty('--contour-size', `${size}px`);
  }, []);

  useEffect(() => {
    const el = root.current;
    // The path as measured: its length, points sampled along it, and where each waypoint falls.
    let course = null;
    let frame = 0;
    let last = 0;
    let current = -2;
    const glider = { x: 0, y: 0, lean: 0, vx: 0, swing: 0, spin: 0, placed: false };

    const trace = () => {
      // Put away behind a project's own page there is nothing to measure.
      if (!el.offsetWidth) return;
      // Boxes are reported as drawn, and the warp scales the page while it plays. Dividing that
      // scale back out gives positions as laid out, which is what the path is drawn in.
      const box = el.getBoundingClientRect();
      const scaleX = box.width / el.offsetWidth;
      const scaleY = box.height / el.offsetHeight;
      const edge = el.querySelector('.margin').getBoundingClientRect();
      const margin = { left: box.left + (edge.left - box.left) / scaleX, width: edge.width / scaleX };
      const nodes = [...el.querySelectorAll('[data-node]')].map((node) => {
        const at = node.getBoundingClientRect();
        return { x: (at.left + at.width / 2 - box.left) / scaleX, y: (at.top + at.height / 2 - box.top) / scaleY };
      });
      // How far down the page the route starts, again as laid out.
      let top = 0;
      for (let at = el; at; at = at.offsetParent) top += at.offsetTop;
      // Long stretches between waypoints get extra bends, alternating sides of the margin.
      const points = [nodes[0]];
      for (let i = 1; i < nodes.length; i += 1) {
        const from = nodes[i - 1];
        const to = nodes[i];
        const bends = i > 1 && margin.width > 70 ? Math.max(0, Math.round((to.y - from.y) / 380) - 1) : 0;
        let side = from.x - (margin.left - box.left) > margin.width / 2 ? 0.2 : 0.8;
        for (let k = 1; k <= bends; k += 1) {
          points.push({ x: margin.left - box.left + margin.width * side, y: from.y + ((to.y - from.y) * k) / (bends + 1) });
          side = 1 - side;
        }
        points.push(to);
      }
      const d = pathThrough(points);
      line.current.setAttribute('d', d);
      flown.current.setAttribute('d', d);
      const length = line.current.getTotalLength();
      const samples = [];
      for (let at = 0; at <= length; at += 6) samples.push(line.current.getPointAtLength(at).y);
      course = { length, samples, top, end: nodes.at(-1).y, stops: nodes.slice(1, -1).map((node) => node.y) };
      flown.current.style.strokeDasharray = length;
      // The path has moved, so the glider is set down on it again rather than flown across.
      glider.placed = false;
      follow();
    };

    // How far along the path the point at height `y` is. The path only ever descends.
    const lengthAt = (y) => {
      const { samples, length } = course;
      if (y <= samples[0]) return 0;
      if (y >= samples.at(-1)) return length;
      let low = 0;
      let high = samples.length - 1;
      while (high - low > 1) {
        const mid = (low + high) >> 1;
        if (samples[mid] <= y) low = mid;
        else high = mid;
      }
      return (low + (y - samples[low]) / (samples[high] - samples[low])) * 6;
    };

    const draw = (now) => {
      frame = 0;
      // Nothing to follow while the page is put away behind a project's own page.
      if (!course || !el.offsetHeight) return;
      // A scroll event can arrive after this frame's timestamp but before its RAF callbacks.
      const dt = now > last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      // Follow the reader down the viewport, reaching the actual final node at the bottom.
      // On tall screens that node can sit below the usual 80% tracking position.
      const room = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const progress = room > 0 ? Math.max(0, Math.min(1, scrollY / room)) : 0;
      const startEye = innerHeight * 0.36;
      const finalEye = Math.max(innerHeight * 0.8, course.top + course.end - room);
      const eye = scrollY + startEye + (finalEye - startEye) * progress;
      const along = lengthAt(eye - course.top);
      const target = line.current.getPointAtLength(along);
      const ahead = line.current.getPointAtLength(Math.min(course.length, along + 14));
      const lean = Math.atan2(ahead.x - target.x, Math.max(1, ahead.y - target.y)) * -0.7;

      let settled = true;
      // A jump of more than a window or so, such as a link to another section, is not flown through.
      if (still() || !glider.placed || Math.abs(target.y - glider.y) > innerHeight * 1.5) {
        Object.assign(glider, { x: target.x, y: target.y, lean, vx: 0, swing: 0, spin: 0, placed: true });
      } else {
        const ease = 1 - Math.exp(-dt * 12);
        const x = glider.x + (target.x - glider.x) * ease;
        const vx = (x - glider.x) / dt;
        const push = (vx - glider.vx) / dt;
        glider.spin += (-SWING.stiffness * glider.swing - SWING.damping * glider.spin - SWING.push * push) * dt;
        glider.swing = Math.max(-SWING.limit, Math.min(SWING.limit, glider.swing + glider.spin * dt));
        glider.vx = vx;
        glider.x = x;
        glider.y += (target.y - glider.y) * ease;
        glider.lean += (lean - glider.lean) * ease;
        settled =
          Math.hypot(target.x - glider.x, target.y - glider.y) < 0.4 && Math.abs(glider.swing) < 0.004 && Math.abs(glider.spin) < 0.02;
      }
      const degrees = (radians) => (radians * 180) / Math.PI;
      marker.current.setAttribute(
        'transform',
        `translate(${glider.x.toFixed(1)} ${glider.y.toFixed(1)}) rotate(${degrees(glider.lean).toFixed(1)})`,
      );
      hang.current.setAttribute('transform', `rotate(${degrees(glider.swing).toFixed(1)})`);
      const covered = lengthAt(glider.y);
      flown.current.style.strokeDashoffset = course.length - covered;

      // Which waypoint the glider has reached, for the page, the tabs and the top bar's readout.
      const reached = course.stops.filter((y) => glider.y >= y - 6).length - 1;
      if (reached !== current) {
        current = reached;
        el.querySelectorAll('.waypoint').forEach((waypoint, i) => waypoint.classList.toggle('reached', i <= reached));
      }
      // The standalone report owns /# links. Refresh home tabs even when returning to the
      // same waypoint, since React clears the report's active tab when the page changes.
      document.querySelectorAll('.tabs a[href^="#"]').forEach((tab) => {
        const active = tab.getAttribute('href') === `#${ROUTE[reached]?.id}`;
        if (active && !tab.hasAttribute('aria-current')) tab.setAttribute('aria-current', 'true');
        else if (!active && tab.hasAttribute('aria-current')) tab.removeAttribute('aria-current');
      });
      if (hud?.current) {
        const height = Math.round((TAKE_OFF * (1 - covered / course.length)) / 10) * 10;
        const place = reached < 0 ? 'take-off' : `wpt ${String(reached + 1).padStart(2, '0')} ${ROUTE[reached].id}`;
        hud.current.textContent = `${place} · alt ${height.toLocaleString('en')} m`;
      }
      if (!settled) frame = requestAnimationFrame(draw);
    };

    const follow = () => {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };

    // The page's length changes when a chapter unfolds or a picture loads; the path is redrawn to fit.
    const watcher = new ResizeObserver(trace);
    watcher.observe(el);
    addEventListener('scroll', follow, { passive: true });
    addEventListener('resize', trace);
    return () => {
      watcher.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener('scroll', follow);
      removeEventListener('resize', trace);
      document.querySelectorAll('.tabs a[href^="#"]').forEach((tab) => tab.removeAttribute('aria-current'));
    };
  }, [hud]);

  return (
    <main className="route" ref={root}>
      <i className="margin" aria-hidden="true" />
      <svg className="flight-path" aria-hidden="true">
        <path className="planned" ref={line} />
        <path className="flown" ref={flown} />
        <defs>
          <radialGradient id="glider-aura">
            <stop offset="0" stopColor="#2dd4ee" stopOpacity="0.45" />
            <stop offset="1" stopColor="#2dd4ee" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="glider" ref={marker}>
          <g className="glider-shape">
            <circle className="aura" cy="8" r="34" fill="url(#glider-aura)" />
            <path className="wing" d="M-20 3 Q0 -15 20 3 Q0 -5 -20 3 Z" />
            <g ref={hang}>
              <path className="lines" d="M-16 0 L0 23 L16 0 M-7 -3 L0 23 L7 -3" />
              <circle className="pilot" cy="24" r="3.4" />
            </g>
          </g>
        </g>
      </svg>

      <div className="take-off">
        {/* The way in to the route: it shows there is more below, and takes the visitor there. */}
        <button className="take-off-button" onClick={() => document.getElementById(ROUTE[0].id)?.scrollIntoView()}>
          <span className="node" data-node aria-hidden="true" />
          <span className="flag">take-off</span>
          <span className="cue">
            follow the route <i aria-hidden="true">↓</i>
          </span>
        </button>
        <p className="note">{NOTES.about}</p>
      </div>

      {ROUTE.map((waypoint, i) => (
        <Waypoint index={i} waypoint={waypoint} key={waypoint.id} />
      ))}

      <div className="horizon">
        <span className="node" data-node aria-hidden="true" />
        <p className="flag">next horizon</p>
        <button className="link" onClick={() => onFly()}>
          [ ./fly.sh: fly the fjord ]
        </button>
      </div>
    </main>
  );
}
