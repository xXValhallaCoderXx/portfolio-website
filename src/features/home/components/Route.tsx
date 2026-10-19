import type { ComponentType, CSSProperties, RefObject } from 'react';
import type { Waypoint as WaypointData } from '../../../domains/portfolio/portfolio.types.ts';
import { NOTES, ROUTE } from '../../../domains/portfolio/content.ts';
import { SWAY } from '../services/route.service.ts';
import { useRoute } from '../hooks/useRoute.ts';

function Waypoint({ index, waypoint, sectionBodies }: { index: number; waypoint: WaypointData; sectionBodies: Record<string, ComponentType> }) {
  const Body = sectionBodies[waypoint.id];
  const titleId = `${waypoint.id}-title`;
  return (
    <section className="waypoint" id={waypoint.id} aria-labelledby={titleId} style={{ '--sway': SWAY[index % SWAY.length] } as CSSProperties}>
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

export default function Route({ onFly, hud, sectionBodies }: {
  onFly: () => void; hud: RefObject<HTMLSpanElement | null>; sectionBodies: Record<string, ComponentType>;
}) {
  const { root, line, flown, marker, hang } = useRoute(hud);
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
        <Waypoint index={i} waypoint={waypoint} key={waypoint.id} sectionBodies={sectionBodies} />
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
