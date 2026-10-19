import type { ExperienceEntry } from '../../../domains/portfolio/portfolio.types.ts';
import { useEffect, useRef } from 'react';

const HEIGHTS = [78, 66, 54, 60, 42, 32, 16];
const RIDGE =
  'M0 112 L23.7 101.4 L48 106 L71 85.8 L95 92 L118.3 70.2 L142 84 L165.6 78 L190 70 L213 54.6 L236 62 L260.3 41.6 L285 48 L311 20.8 L338 40';
const CONTOURS =
  'M23.7 101.4 L10 130 M23.7 101.4 L48 130 M71 85.8 L60 130 M71 85.8 L95 130 M118.3 70.2 L105 130 M118.3 70.2 L142 130 M165.6 78 L190 130 M213 54.6 L200 130 M213 54.6 L236 130 M260.3 41.6 L250 130 M260.3 41.6 L285 130 M311 20.8 L300 130 M311 20.8 L338 100';

function heightAt(fraction: number) {
  const position = fraction * (HEIGHTS.length - 1);
  const index = Math.floor(position);
  const next = Math.min(index + 1, HEIGHTS.length - 1);
  return HEIGHTS[index] + (HEIGHTS[next] - HEIGHTS[index]) * (position - index);
}

/** A small, keyboard-accessible version of the career ridge. Role hashes identify camps. */
export default function CompactRidge({ roles, selected, onSelect }: { roles: ExperienceEntry[]; selected: string; onSelect: (hash: string) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const climb = [...roles].reverse();
  const camps = climb.map((role, index) => {
    const fraction = index / Math.max(1, climb.length - 1);
    return { role, x: 7 + fraction * 85, y: heightAt(fraction) };
  });
  const active = camps.find((camp) => camp.role.hash === selected) ?? camps.at(-1);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    const reveal = () => {
      const marker = selectedRef.current;
      if (!marker || scroller.clientWidth === 0) return;

      const bounds = scroller.getBoundingClientRect();
      const viewportLeft = bounds.left + scroller.clientLeft;
      const viewportRight = viewportLeft + scroller.clientWidth;
      const target = marker.getBoundingClientRect();
      let left = scroller.scrollLeft;
      if (target.left < viewportLeft + 4) left += target.left - viewportLeft - 4;
      else if (target.right > viewportRight - 4) left += target.right - viewportRight + 4;
      left = Math.max(0, Math.min(left, scroller.scrollWidth - scroller.clientWidth));
      if (Math.abs(left - scroller.scrollLeft) < 0.5) return;

      // Scroll this small ridge only. scrollIntoView would also move the page or flight report.
      scroller.scrollTo({
        left,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    };

    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [selected, roles]);

  if (!active) return null;

  const firstYear = climb[0].years.match(/\d{4}/)?.[0];
  const latestYears = climb[climb.length - 1].years;
  const lastYear = /\bnow\b/i.test(latestYears) ? 'now' : latestYears.match(/\d{4}/g)?.at(-1);
  const trail = camps.map((camp) => `${(camp.x * 338) / 100},${(camp.y * 130) / 100}`).join(' ');

  return (
    <div className="compact-ridge-scroller" ref={scrollerRef} role="group" aria-label="Career camps, oldest to newest">
      <div className="compact-ridge">
        <svg className="compact-ridge-art" viewBox="0 0 338 130" aria-hidden="true">
          <path className="compact-ridge-rock" d={`${RIDGE} L338 130 L0 130 Z`} fill="var(--raised)" />
          <path className="compact-ridge-contours" d={CONTOURS} stroke="var(--blue)" strokeOpacity="0.18" fill="none" />
          <path
            className="compact-ridge-outline"
            d={RIDGE}
            stroke="var(--blue)"
            strokeOpacity="0.55"
            strokeWidth="1"
            fill="none"
          />
          <polyline
            className="compact-ridge-trail"
            points={trail}
            stroke="var(--cyan)"
            strokeOpacity="0.55"
            strokeWidth="1"
            strokeDasharray="3 4"
            fill="none"
          />
          <g className="compact-ridge-labels" fontFamily="inherit" fontSize="9" fill="var(--dim)">
            <text x="4" y="125">
              {firstYear}
            </text>
            <text x="334" y="125" textAnchor="end">
              {lastYear}
            </text>
          </g>
        </svg>

        {camps.map((camp, index) => (
          <button
            key={camp.role.hash}
            ref={camp === active ? selectedRef : null}
            type="button"
            className={`compact-camp${camp === active ? ' selected' : ''}`}
            style={{ left: `${camp.x}%`, top: `${camp.y}%` }}
            aria-pressed={camp === active}
            aria-label={`Camp ${index + 1} of ${camps.length}: ${camp.role.company}, ${camp.role.role}, ${camp.role.years}`}
            onClick={() => onSelect(camp.role.hash)}
          >
            <span className="compact-camp-symbol" aria-hidden="true" />
          </button>
        ))}

        <svg
          className="compact-ridge-glider"
          viewBox="0 0 24 18"
          style={{ left: `${active.x}%`, top: `${active.y}%` }}
          aria-hidden="true"
        >
          <path d="M2 6 Q12 -1 22 6" stroke="var(--text)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M3 6 L12 15 M21 6 L12 15" stroke="var(--text)" strokeOpacity="0.6" strokeWidth="0.8" fill="none" />
        </svg>
      </div>
    </div>
  );
}
