import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { EXPERIENCE } from '../content.js';
import CompactRidge from './CompactRidge.jsx';
import ExperienceReport from './ExperienceReport.jsx';
import Ridge from './Ridge.jsx';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const yearSpan = (dates) => {
  const years = dates.match(/\d{4}/g) ?? [];
  const first = years[0];
  const last = dates.includes('now') ? 'now' : years.at(-1);
  return first === last ? first : `${first}–${last === 'now' ? last : last.slice(2)}`;
};

/** The same career reader on the page and in a flight landing panel. */
export default function Experience() {
  const root = useRef(null);
  const list = useRef(null);
  const heading = useRef(null);
  const focusHeading = useRef(false);
  const swipe = useRef(null);
  const id = useId();
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState(EXPERIENCE[0].hash);
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('situation');
  const [view, setView] = useState('ridge');
  const [summaries, setSummaries] = useState(true);
  const [near, setNear] = useState(EXPERIENCE[0].hash);
  const [pointed, setPointed] = useState(null);
  const previousCompact = useRef(false);
  const index = EXPERIENCE.findIndex((entry) => entry.hash === selected);
  const current = EXPERIENCE[index];
  const lit = pointed ?? near;
  const reportId = (hash) => `${id}-${hash}-report`;

  useLayoutEffect(() => {
    if (focusHeading.current && compact && view === 'ridge') {
      heading.current?.focus({ preventScroll: true });
      focusHeading.current = false;
    }
  }, [compact, view, selected]);

  useLayoutEffect(() => {
    const measure = () => {
      const width = root.current?.clientWidth;
      // The homepage stays mounted behind the flight and project pages.
      if (width) setCompact(width <= 820);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    // Keep an open chapter in view when moving from the career list to the camp reader.
    if (compact && !previousCompact.current && open) setSelected(open);
    previousCompact.current = compact;
    setPointed(null);
  }, [compact, open]);

  useEffect(() => {
    if (compact) return undefined;
    let queued = 0;
    const read = () => {
      queued = 0;
      if (!root.current?.offsetHeight) return;
      const line = innerHeight * 0.42;
      let best = null;
      for (const stop of list.current?.children ?? []) {
        const box = stop.getBoundingClientRect();
        const distance = box.top > line ? box.top - line : box.bottom < line ? line - box.bottom : 0;
        if (!best || distance < best.distance) best = { hash: stop.dataset.hash, distance };
      }
      if (best) setNear(best.hash);
    };
    const onScroll = () => {
      queued ||= requestAnimationFrame(read);
    };
    read();
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(queued);
      removeEventListener('scroll', onScroll, { capture: true });
      removeEventListener('resize', onScroll);
    };
  }, [compact]);

  const choose = useCallback(
    (hash, { expand = false, fromList = false } = {}) => {
      const entry = EXPERIENCE.find((candidate) => candidate.hash === hash);
      if (!entry) return;
      setSelected(hash);
      setNear(hash);
      setOpen((previous) => (expand || (compact && previous !== null) ? hash : previous));
      if (compact || expand) {
        setTab((previous) => (previous === 'behind' && !entry.sketch ? 'situation' : previous));
      }
      if (fromList) {
        focusHeading.current = true;
        setView('ridge');
      }
    },
    [compact],
  );

  const pickCamp = useCallback(
    (hash) => {
      choose(hash, { expand: true });
      requestAnimationFrame(() =>
        list.current?.querySelector(`[data-hash="${hash}"]`)?.scrollIntoView({
          block: 'center',
          behavior: reducedMotion() ? 'instant' : 'smooth',
        }),
      );
    },
    [choose],
  );

  const toggle = (hash) => {
    choose(hash);
    const entry = EXPERIENCE.find((candidate) => candidate.hash === hash);
    setTab((previous) => (previous === 'behind' && !entry.sketch ? 'situation' : previous));
    setOpen((previous) => (previous === hash ? null : hash));
  };
  const step = (direction) => {
    const next = index + direction;
    if (next >= 0 && next < EXPERIENCE.length) {
      if (next === 0 || next === EXPERIENCE.length - 1) focusHeading.current = true;
      choose(EXPERIENCE[next].hash);
    }
  };
  const startSwipe = (event) => {
    if (!event.isPrimary) {
      swipe.current = null;
      return;
    }
    if (
      event.pointerType !== 'touch' ||
      event.target.closest('button, a, input, select, textarea') ||
      getSelection()?.toString()
    )
      return;
    swipe.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const endSwipe = (event) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.pointer !== event.pointerId || getSelection()?.toString()) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? -1 : 1);
  };

  return (
    <div
      className="experience"
      ref={root}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
    >
      {compact ? (
        <div className="experience-mobile">
          <div className="experience-toolbar">
            <div className="experience-view" role="group" aria-label="Experience view">
              <button type="button" aria-pressed={view === 'ridge'} onClick={() => setView('ridge')}>
                ridge
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                list
              </button>
            </div>
          </div>
          <p className="experience-announcement" role="status">
            Camp {EXPERIENCE.length - index} of {EXPERIENCE.length}: {current.company}, {current.role}, {current.years}
          </p>
          {view === 'list' ? (
            <ol className="experience-list">
              {EXPERIENCE.map((entry, entryIndex) => (
                <li key={entry.hash}>
                  <button
                    type="button"
                    aria-current={entry.hash === selected ? 'true' : undefined}
                    onClick={() => choose(entry.hash, { fromList: true })}
                  >
                    <span className="experience-list-dates">
                      <span>camp {EXPERIENCE.length - entryIndex}</span>
                      {yearSpan(entry.years)}
                    </span>
                    <span className="experience-list-role">
                      <span>{entry.company}</span>
                      <b>{entry.role}</b>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <CompactRidge roles={EXPERIENCE} selected={selected} onSelect={choose} />
              <nav className="experience-nav" aria-label="Career camps">
                <button
                  type="button"
                  aria-label="Older camp"
                  disabled={index === EXPERIENCE.length - 1}
                  onClick={() => step(1)}
                >
                  ← older
                </button>
                <span>
                  camp <b>{EXPERIENCE.length - index}</b> of {EXPERIENCE.length}
                </span>
                <button type="button" aria-label="Newer camp" disabled={index === 0} onClick={() => step(-1)}>
                  newer →
                </button>
              </nav>
              <article
                className="experience-card"
                onPointerDown={startSwipe}
                onPointerUp={endSwipe}
                onPointerCancel={() => {
                  swipe.current = null;
                }}
              >
                <p className="experience-when">
                  <span className="camp-tag">camp {EXPERIENCE.length - index}</span> · {current.years}
                </p>
                <h3 className="experience-current-heading" tabIndex={-1} ref={heading}>
                  {current.company} <span className="dim">·</span> <b>{current.role}</b>
                </h3>
                <p className="experience-summary">{current.text}</p>
                <button
                  type="button"
                  className="link experience-explore"
                  aria-expanded={open === selected}
                  aria-controls={reportId(selected)}
                  onClick={() => toggle(selected)}
                >
                  [ {open === selected ? 'close this chapter ↑' : 'explore this chapter ↓'} ]
                </button>
              </article>
              {open === selected && (
                <ExperienceReport entry={current} id={reportId(selected)} compact tab={tab} onTabChange={setTab} />
              )}
            </>
          )}
        </div>
      ) : (
        <div className="experience-desktop">
          <div className="ascent">
            <div className="experience-story">
              <div className="experience-toolbar">
                <div className="experience-density" role="group" aria-label="Experience detail">
                  <button type="button" aria-pressed={summaries} onClick={() => setSummaries(true)}>
                    summaries
                  </button>
                  <button type="button" aria-pressed={!summaries} onClick={() => setSummaries(false)}>
                    titles only
                  </button>
                </div>
              </div>
              <ol className="experience-stops" ref={list}>
                {EXPERIENCE.map((entry, entryIndex) => {
                  const unfolded = open === entry.hash;
                  return (
                    <li
                      className={`experience-stop${unfolded ? ' open' : ''}${lit === entry.hash ? ' lit' : ''}${selected === entry.hash ? ' selected' : ''}`}
                      data-hash={entry.hash}
                      key={entry.hash}
                      onPointerEnter={() => setPointed(entry.hash)}
                      onPointerLeave={() => setPointed(null)}
                      onFocus={() => setPointed(entry.hash)}
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setPointed(null);
                      }}
                    >
                      <h3 className="experience-role-heading">
                        <button
                          type="button"
                          className="experience-stop-heading"
                          aria-pressed={selected === entry.hash}
                          onClick={() => choose(entry.hash)}
                        >
                          <span className="experience-when">
                            <span className="camp-tag">camp {EXPERIENCE.length - entryIndex}</span> · {entry.years}
                          </span>
                          <span className="experience-role">
                            {entry.company} <span className="dim">·</span> <b>{entry.role}</b>
                          </span>
                        </button>
                      </h3>
                      {summaries && <p className="experience-summary">{entry.text}</p>}
                      <button
                        type="button"
                        className="link experience-explore"
                        aria-expanded={unfolded}
                        aria-controls={reportId(entry.hash)}
                        onClick={() => toggle(entry.hash)}
                      >
                        [ {unfolded ? 'close this chapter ↑' : 'explore this chapter ↓'} ]
                      </button>
                      {unfolded && (
                        <ExperienceReport entry={entry} id={reportId(entry.hash)} tab={tab} onTabChange={setTab} />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
            <Ridge roles={EXPERIENCE} lit={lit} open={open} onPick={pickCamp} />
          </div>
        </div>
      )}
    </div>
  );
}
