import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EXPERIENCE } from '../content.js';
import CompactRidge from './CompactRidge.jsx';
import ExperienceDetail from './ExperienceDetail.jsx';
import Ridge from './Ridge.jsx';
import Sheet from './Sheet.jsx';

// Like projects, roles have addresses on the page and a reading sheet in the flight.
export const OpenExperience = createContext(null);

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const yearSpan = (dates) => {
  const years = dates.match(/\d{4}/g) ?? [];
  const first = years[0];
  const last = dates.includes('now') ? 'now' : years.at(-1);
  return first === last ? first : `${first}–${last === 'now' ? last : last.slice(2)}`;
};
const initialCamp = () => {
  const hash = history.state?.returnTo?.experience ?? history.state?.experience;
  return EXPERIENCE.some((entry) => entry.hash === hash) ? hash : EXPERIENCE[0].hash;
};

/** The career overview stays mounted while its role pages are being read. */
export default function Experience() {
  const openOnPage = useContext(OpenExperience);
  const root = useRef(null);
  const list = useRef(null);
  const heading = useRef(null);
  const focusHeading = useRef(false);
  const swipe = useRef(null);
  const suppressClick = useRef(false);
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState(initialCamp);
  const [view, setView] = useState(() =>
    (history.state?.returnTo?.experienceView ?? history.state?.experienceView) === 'list' ? 'list' : 'ridge');
  const [summaries, setSummaries] = useState(true);
  const [near, setNear] = useState(initialCamp);
  const [pointed, setPointed] = useState(null);
  const [reading, setReading] = useState(null);
  const close = useCallback(() => setReading(null), []);
  const index = EXPERIENCE.findIndex((entry) => entry.hash === selected);
  const current = EXPERIENCE[index];
  const lit = pointed ?? near;

  useLayoutEffect(() => {
    if (focusHeading.current && compact && view === 'ridge') {
      heading.current?.focus({ preventScroll: true });
      focusHeading.current = false;
    }
  }, [compact, view, selected]);

  useLayoutEffect(() => {
    const measure = () => {
      const width = root.current?.clientWidth;
      if (width) setCompact(width <= 820);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

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
    const onScroll = () => { queued ||= requestAnimationFrame(read); };
    read();
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(queued);
      removeEventListener('scroll', onScroll, { capture: true });
      removeEventListener('resize', onScroll);
    };
  }, [compact]);

  const choose = useCallback((hash) => {
    if (!EXPERIENCE.some((entry) => entry.hash === hash)) return;
    setSelected(hash);
    setNear(hash);
    setPointed(null);
  }, []);

  const pickCamp = (hash) => {
    choose(hash);
    requestAnimationFrame(() =>
      list.current?.querySelector(`[data-hash="${hash}"]`)?.scrollIntoView({
        block: 'center', behavior: reducedMotion() ? 'instant' : 'smooth',
      }),
    );
  };
  const step = (direction) => {
    const next = index + direction;
    if (next < 0 || next >= EXPERIENCE.length) return;
    if (next === 0 || next === EXPERIENCE.length - 1) focusHeading.current = true;
    choose(EXPERIENCE[next].hash);
  };
  const read = (event, entry) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    choose(entry.hash);
    if (openOnPage) openOnPage(entry.hash, view);
    else setReading(entry);
  };
  const startSwipe = (event) => {
    suppressClick.current = false;
    swipe.current = null;
    if (!event.isPrimary || event.pointerType !== 'touch' || getSelection()?.toString()) return;
    swipe.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const endSwipe = (event) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.pointer !== event.pointerId || getSelection()?.toString()) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    suppressClick.current = Math.hypot(dx, dy) > 12;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? -1 : 1);
  };

  return (
    <div className="experience" ref={root}
      onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation(); }}
      onKeyUp={(event) => event.stopPropagation()}
    >
      {compact ? (
        <div className="experience-mobile">
          <div className="experience-toolbar">
            <div className="experience-view" role="group" aria-label="Experience view">
              <button type="button" aria-pressed={view === 'ridge'} onClick={() => setView('ridge')}>ridge</button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>list</button>
            </div>
          </div>
          <p className="experience-announcement" role="status">
            Camp {EXPERIENCE.length - index} of {EXPERIENCE.length}: {current.company}, {current.role}, {current.years}
          </p>
          {view === 'list' ? (
            <ol className="experience-list">
              {EXPERIENCE.map((entry, entryIndex) => (
                <li key={entry.hash}>
                  <a href={`/experience/${entry.hash}`} onClick={(event) => read(event, entry)}>
                    <span className="experience-list-dates">
                      <span>camp {EXPERIENCE.length - entryIndex}</span>{yearSpan(entry.years)}
                    </span>
                    <span className="experience-list-role"><span>{entry.company}</span><b>{entry.role}</b></span>
                    <span aria-hidden="true">›</span>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <CompactRidge roles={EXPERIENCE} selected={selected} onSelect={choose} />
              <nav className="experience-nav" aria-label="Career camps">
                <button type="button" aria-label="Older camp" disabled={index === EXPERIENCE.length - 1} onClick={() => step(1)}>← older</button>
                <span>camp <b>{EXPERIENCE.length - index}</b> of {EXPERIENCE.length}</span>
                <button type="button" aria-label="Newer camp" disabled={index === 0} onClick={() => step(-1)}>newer →</button>
              </nav>
              <article className="experience-card"
                onPointerDown={startSwipe} onPointerUp={endSwipe}
                onPointerCancel={() => { swipe.current = null; suppressClick.current = true; }}
                onClickCapture={(event) => {
                  if (suppressClick.current && event.detail !== 0) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  suppressClick.current = false;
                }}
              >
                <a className="experience-entry-link" href={`/experience/${current.hash}`} onClick={(event) => read(event, current)}>
                  <p className="experience-when"><span className="camp-tag">camp {EXPERIENCE.length - index}</span> · {current.years}</p>
                  <h3 className="experience-current-heading" tabIndex={-1} ref={heading}>
                    {current.company} <span className="dim">·</span> <b>{current.role}</b>
                  </h3>
                  <p className="experience-summary">{current.text}</p>
                  <span className="experience-read">[ view role → ]</span>
                </a>
              </article>
            </>
          )}
        </div>
      ) : (
        <div className="experience-desktop">
          <div className="ascent">
            <div className="experience-story">
              <div className="experience-toolbar">
                <div className="experience-density" role="group" aria-label="Experience detail">
                  <button type="button" aria-pressed={summaries} onClick={() => setSummaries(true)}>summaries</button>
                  <button type="button" aria-pressed={!summaries} onClick={() => setSummaries(false)}>titles only</button>
                </div>
              </div>
              <ol className="experience-stops" ref={list}>
                {EXPERIENCE.map((entry, entryIndex) => (
                  <li className={`experience-stop${lit === entry.hash ? ' lit' : ''}${selected === entry.hash ? ' selected' : ''}`}
                    data-hash={entry.hash} key={entry.hash}
                    onPointerEnter={() => setPointed(entry.hash)} onPointerLeave={() => setPointed(null)}
                    onFocus={() => setPointed(entry.hash)}
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPointed(null); }}
                  >
                    <a className="experience-entry-link" href={`/experience/${entry.hash}`} onClick={(event) => read(event, entry)}>
                      <p className="experience-when"><span className="camp-tag">camp {EXPERIENCE.length - entryIndex}</span> · {entry.years}</p>
                      <h3 className="experience-role-heading experience-role">{entry.company} <span className="dim">·</span> <b>{entry.role}</b></h3>
                      {summaries && <p className="experience-summary">{entry.text}</p>}
                      <span className="experience-read">[ view role → ]</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
            <Ridge roles={EXPERIENCE} lit={lit} open={reading?.hash} onPick={pickCamp} />
          </div>
        </div>
      )}
      {reading && (
        <Sheet title={`experience.log/${reading.hash} — field report`} label={`${reading.role} at ${reading.company}`}
          className="experience-report-window" onClose={close}
        >
          <div className="readme-body"><ExperienceDetail entry={reading} embedded /></div>
        </Sheet>
      )}
    </div>
  );
}
