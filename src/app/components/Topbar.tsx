import type { RefObject } from 'react';
import type { DetailAddress, SectionId } from '../../domains/portfolio/portfolio.types.ts';
import { PROFILE, ROUTE } from '../../domains/portfolio/content.ts';
import TerminalLights from '../../components/atoms/TerminalLights.tsx';
import { useTopbar } from '../hooks/useTopbar.ts';

export default function Topbar({ detail, hud, onSection, onFly }: {
  detail: DetailAddress | null; hud: RefObject<HTMLSpanElement | null>;
  onSection: (section: SectionId) => void; onFly: () => void;
}) {
  const { open, setOpen, root, trigger, linksId } = useTopbar();
  return (
    <nav className={`topbar${open ? ' menu-open' : ''}`} aria-label="Main navigation" ref={root}>
      <div className="chrome">
        <TerminalLights />
        <span className="dim">{PROFILE.user}@{PROFILE.host}: ~/portfolio — zsh</span>
        <span className="spacer" />
        {detail ? <span className="hud">{detail.path}</span> : <span className="hud" ref={hud} />}
      </div>
      <div className="tabs">
        <button className="topbar-menu" aria-expanded={open} aria-controls={linksId} ref={trigger} onClick={() => setOpen(!open)}>
          <span>menu</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        <div className="section-links" id={linksId}>
          {ROUTE.map((waypoint, i) => (
            <a
              href={`${detail ? '/' : ''}#${waypoint.id}`}
              aria-current={detail?.section === waypoint.id ? 'page' : undefined}
              onClick={(event) => {
                setOpen(false);
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                if (detail) {
                  event.preventDefault();
                  onSection(waypoint.id);
                } else {
                  requestAnimationFrame(() => {
                    const heading = document.getElementById(`${waypoint.id}-title`);
                    heading?.setAttribute('tabindex', '-1');
                    heading?.focus({ preventScroll: true });
                  });
                }
              }}
              key={waypoint.id}
            >
              <span className="tab-number">{String(i + 1).padStart(2, '0')}_</span>{waypoint.id}
            </a>
          ))}
        </div>
        <button className="tab-fly" onClick={() => { setOpen(false); onFly(); }}>fly.sh</button>
      </div>
    </nav>
  );
}
