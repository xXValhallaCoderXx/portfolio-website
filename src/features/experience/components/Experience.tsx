import { EXPERIENCE } from '../../../domains/portfolio/content.ts';
import { yearSpan } from '../../../domains/portfolio/portfolio.service.ts';
import CompactRidge from './CompactRidge.tsx';
import ExperienceDetail from './ExperienceDetail.tsx';
import Ridge from './Ridge.tsx';
import Sheet from '../../../components/molecules/Sheet.tsx';
import { useExperience } from '../hooks/useExperience.ts';

export default function Experience() {
  const { root, list, heading, swipe, suppressClick, compact, selected, view, setView, summaries, setSummaries,
    reading, close, index, current, lit, choose, pickCamp, step, read, startSwipe, endSwipe, setPointed } = useExperience();
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
