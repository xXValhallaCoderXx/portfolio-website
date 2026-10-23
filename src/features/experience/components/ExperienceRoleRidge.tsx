import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ExperienceEntry } from '../../../domains/portfolio/portfolio.types.ts';
import '../experience-role-ridge.css';

const HEIGHTS = [78, 66, 54, 60, 42, 32, 16];
const RIDGE = 'M0 112 L23.7 101.4 L48 106 L71 85.8 L95 92 L118.3 70.2 L142 84 L165.6 78 L190 70 L213 54.6 L236 62 L260.3 41.6 L285 48 L311 20.8 L338 40';
const CONTOURS = 'M23.7 101.4 L10 130 M23.7 101.4 L48 130 M71 85.8 L60 130 M71 85.8 L95 130 M118.3 70.2 L105 130 M118.3 70.2 L142 130 M165.6 78 L190 130 M213 54.6 L200 130 M213 54.6 L236 130 M260.3 41.6 L250 130 M260.3 41.6 L285 130 M311 20.8 L300 130 M311 20.8 L338 100';

function heightAt(fraction: number) {
  const position = fraction * (HEIGHTS.length - 1);
  const index = Math.floor(position);
  const next = Math.min(index + 1, HEIGHTS.length - 1);
  return 20 + (HEIGHTS[index] + (HEIGHTS[next] - HEIGHTS[index]) * (position - index)) * 0.845;
}

/** A small route map: hovering previews a role; following its link opens the report. */
export default function ExperienceRoleRidge({ roles, selected, onOpen, position }: {
  roles: ExperienceEntry[]; selected: string; onOpen: (hash: string) => void; position: 'top' | 'bottom';
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const tooltip = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef<string | null>(null);
  const focused = useRef<string | null>(null);
  const overTooltip = useRef(false);
  const lastTarget = useRef<string | null>(null);
  const gesture = useRef<{ pointer: number; x: number; y: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const tooltipId = `experience-role-${useId().replace(/:/g, '')}`;
  const climb = [...roles].reverse();
  const camps = climb.map((role, index) => ({
    role,
    x: ((index + 0.5) / climb.length) * 100,
    y: heightAt(index / Math.max(1, climb.length - 1)),
  }));
  const active = camps.find((camp) => camp.role.hash === selected);
  const shown = preview !== dismissed ? roles.find((role) => role.hash === preview) : undefined;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = (hash: string) => {
    cancelClose();
    if (lastTarget.current !== hash) {
      lastTarget.current = hash;
      setDismissed(null);
    }
    setPreview(hash);
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      if (hovered.current || overTooltip.current) return;
      if (focused.current) show(focused.current);
      else setPreview(null);
    }, 200);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useLayoutEffect(() => {
    const region = scroller.current;
    if (!region) return undefined;
    const reveal = () => {
      const marker = links.current.get(selected);
      if (!marker || !region.clientWidth) return;
      const bounds = region.getBoundingClientRect();
      const target = marker.getBoundingClientRect();
      const leftEdge = bounds.left + region.clientLeft + 8;
      const rightEdge = bounds.left + region.clientLeft + region.clientWidth - 8;
      let left = region.scrollLeft;
      if (target.left < leftEdge) left += target.left - leftEdge;
      else if (target.right > rightEdge) left += target.right - rightEdge;
      left = Math.max(0, Math.min(left, region.scrollWidth - region.clientWidth));
      // Only this strip moves. scrollIntoView would also move the document and report.
      if (Math.abs(left - region.scrollLeft) > 0.5) region.scrollTo({ left, behavior: 'instant' });
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(region);
    return () => observer.disconnect();
  }, [selected, roles]);

  useLayoutEffect(() => {
    overTooltip.current = false;
    if (!shown) {
      setTooltipPosition(null);
      return undefined;
    }
    const place = () => {
      const target = links.current.get(shown.hash)?.getBoundingClientRect();
      const box = tooltip.current?.getBoundingClientRect();
      const region = scroller.current?.getBoundingClientRect();
      if (!target || !box || !region) return;
      if (target.right <= Math.max(0, region.left) || target.left >= Math.min(innerWidth, region.right)
        || target.bottom <= 0 || target.top >= innerHeight) {
        hovered.current = null;
        focused.current = null;
        setPreview(null);
        return;
      }
      const left = Math.max(12, Math.min(innerWidth - box.width - 12, target.left + target.width / 2 - box.width / 2));
      const above = target.top - box.height - 8;
      const top = Math.max(8, Math.min(innerHeight - box.height - 8, above >= 8 ? above : target.bottom + 8));
      setTooltipPosition({ left, top });
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setDismissed(shown.hash);
    };
    place();
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    addEventListener('keydown', dismiss);
    const observer = new ResizeObserver(place);
    if (tooltip.current) observer.observe(tooltip.current);
    return () => {
      removeEventListener('resize', place);
      removeEventListener('scroll', place, true);
      removeEventListener('keydown', dismiss);
      observer.disconnect();
    };
  }, [shown?.hash]);

  if (!camps.length) return null;
  const trail = camps.map((camp) => `${(camp.x * 338) / 100},${camp.y}`).join(' ');

  return (
    <nav className="experience-role-ridge" data-role-ridge={position} aria-label={`Experience roles, oldest to newest (${position})`}>
      <div className="experience-role-ridge-scroller" ref={scroller}
        onPointerDownCapture={(event) => {
          if (!event.isPrimary) return;
          suppressClick.current = false;
          gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
        }}
        onPointerMoveCapture={(event) => {
          const start = gesture.current;
          if (!start || start.pointer !== event.pointerId) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
            start.dragged = true;
            suppressClick.current = true;
          }
        }}
        onPointerUpCapture={(event) => {
          if (gesture.current?.pointer !== event.pointerId) return;
          suppressClick.current = gesture.current.dragged;
          gesture.current = null;
        }}
        onPointerCancel={(event) => {
          if (gesture.current?.pointer !== event.pointerId) return;
          suppressClick.current = true;
          gesture.current = null;
        }}
      >
        <div className="experience-role-ridge-track" style={{ '--role-count': camps.length } as CSSProperties}>
          <svg className="experience-role-ridge-art" viewBox="0 0 338 160" preserveAspectRatio="none" aria-hidden="true">
            <g transform="translate(0 20) scale(1 0.65)">
              <path d={`${RIDGE} L338 130 L0 130 Z`} fill="var(--raised)" />
              <path d={CONTOURS} stroke="var(--blue)" strokeOpacity="0.18" fill="none" />
              <path d={RIDGE} stroke="var(--blue)" strokeOpacity="0.55" fill="none" />
            </g>
            <polyline points={trail} stroke="var(--cyan)" strokeOpacity="0.55" strokeDasharray="3 4" fill="none" />
          </svg>
          {camps.map((camp) => {
            const current = camp.role.hash === selected;
            return (
              <a key={camp.role.hash} ref={(node) => {
                if (node) links.current.set(camp.role.hash, node);
                else links.current.delete(camp.role.hash);
              }} className="experience-role-camp" href={`/experience/${camp.role.hash}`}
                style={{ left: `${camp.x}%`, top: `${camp.y}px` }}
                aria-current={current ? 'page' : undefined}
                aria-label={`${camp.role.role} at ${camp.role.company}, ${camp.role.years}`}
                aria-describedby={shown?.hash === camp.role.hash ? tooltipId : undefined}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'touch') return;
                  hovered.current = camp.role.hash;
                  show(camp.role.hash);
                }}
                onPointerLeave={() => { hovered.current = null; closeSoon(); }}
                onFocus={() => { focused.current = camp.role.hash; show(camp.role.hash); }}
                onBlur={() => { focused.current = null; closeSoon(); }}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                  event.preventDefault();
                  if (event.detail !== 0 && suppressClick.current) return;
                  if (!current) onOpen(camp.role.hash);
                }}
              >
                <span className="experience-role-camp-target" aria-hidden="true"><span className="experience-role-camp-symbol" /></span>
                <span className="experience-role-camp-company">{camp.role.company.replace(/\s*\([^)]*\)\s*$/, '')}</span>
                <span className="experience-role-camp-year">{camp.role.years.match(/\d{4}/)?.[0]}</span>
              </a>
            );
          })}
          {active && <svg className="experience-role-ridge-glider" viewBox="0 0 24 18"
            style={{ left: `${active.x}%`, top: `${active.y - 23}px` }} aria-hidden="true">
            <path d="M2 6 Q12 -1 22 6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M3 6 L12 15 M21 6 L12 15" stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.8" fill="none" />
          </svg>}
        </div>
      </div>
      {shown && createPortal(
        <div className="experience-role-ridge-tooltip" id={tooltipId} role="tooltip" ref={tooltip}
          style={{ left: tooltipPosition?.left ?? 0, top: tooltipPosition?.top ?? 0, visibility: tooltipPosition ? 'visible' : 'hidden' }}
          onPointerEnter={() => { overTooltip.current = true; cancelClose(); }}
          onPointerLeave={() => { overTooltip.current = false; closeSoon(); }}
        >
          <strong>{shown.role}</strong>
          <span>{shown.company}</span>
          <span className="experience-role-ridge-tooltip-dates">{shown.years}</span>
        </div>, document.body,
      )}
    </nav>
  );
}
