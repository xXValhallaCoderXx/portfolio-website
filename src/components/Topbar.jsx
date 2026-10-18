import { useEffect, useId, useRef, useState } from 'react';
import { PROFILE, ROUTE } from '../content.js';
import { ACHIEVEMENTS, beltFor } from '../game/achievements.js';

const COMPACT = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';

export default function Topbar({ detail, hud, progress, crt, onCrt, onSection, onFly }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const linksId = useId();

  useEffect(() => {
    const media = matchMedia(COMPACT);
    const resize = () => { if (!media.matches) setOpen(false); };
    const navigate = () => setOpen(false);
    media.addEventListener('change', resize);
    addEventListener('popstate', navigate);
    addEventListener('hashchange', navigate);
    return () => {
      media.removeEventListener('change', resize);
      removeEventListener('popstate', navigate);
      removeEventListener('hashchange', navigate);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <nav className={`topbar${open ? ' menu-open' : ''}`} aria-label="Main navigation" ref={root}>
      <div className="chrome">
        <i /><i /><i />
        <span className="dim">{PROFILE.user}@{PROFILE.host}: ~/portfolio — zsh</span>
        <span className="spacer" />
        {detail ? <span className="hud">{detail.path}</span> : <span className="hud" ref={hud} />}
        {progress.unlocked.length > 0 && (
          <span className="belt" title="Earned in flight">
            belt: {beltFor(progress)} · {progress.unlocked.length}/{ACHIEVEMENTS.length}
          </span>
        )}
        <button className="link" role="switch" aria-checked={crt} onClick={onCrt}>
          crt_effects {crt ? 'ON' : 'OFF'}
        </button>
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
