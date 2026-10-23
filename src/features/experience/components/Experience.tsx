import { EXPERIENCE } from '../../../domains/portfolio/content.ts';
import { yearSpan } from '../../../domains/portfolio/portfolio.service.ts';
import ExperienceDetail from './ExperienceDetail.tsx';
import Ridge from './Ridge.tsx';
import Sheet from '../../../components/molecules/Sheet.tsx';
import { useExperience } from '../hooks/useExperience.ts';

export default function Experience() {
  const { root, list, compact, selected, reading, close, lit, pickCamp, read, setPointed } = useExperience();
  return (
    <div className="experience" ref={root}
      onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation(); }}
      onKeyUp={(event) => event.stopPropagation()}
    >
      {compact ? (
        <div className="experience-mobile">
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
        </div>
      ) : (
        <div className="experience-desktop">
          <div className="ascent">
            <div className="experience-story">
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
                      <p className="experience-summary">{entry.text}</p>
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
