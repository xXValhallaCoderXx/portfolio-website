import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ABOUT, CONTACT, EXPERIENCE, PROJECTS, SKILLS, STATS } from '../content.js';
import { DEMOS } from './demos/index.js';
import { SKETCHES } from './sketches/index.js';
import Ridge from './Ridge.jsx';
import Sheet from './Sheet.jsx';

// The body of each section. The page's waypoints and the flight's landing panels both render these.

/**
 * How a project's report is opened. The page provides a function that goes to the project's own
 * address; in the flight there is no page to go to, so the report opens in a sheet over the landing.
 */
export const OpenProject = createContext(null);

function AboutBody() {
  return (
    <div className="about">
      <div className="prose">
        {ABOUT.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="tags">
          {ABOUT.flags.map((flag) => (
            <span key={flag}>{flag}</span>
          ))}
        </p>
      </div>
      <aside className="card">
        <p className="card-title">pilot log</p>
        <dl className="facts">
          {[...STATS, ...ABOUT.facts].map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label.toLowerCase()}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

/** One role unfolded: where things stood, what I did, and what changed. */
function FieldReport({ entry, id }) {
  const Sketch = SKETCHES[entry.sketch];
  const { situation, contribution, changed } = entry.report;
  return (
    <div className="report" id={id} role="region" aria-label={`Field report: ${entry.role} at ${entry.company}`}>
      <p className="report-title">
        field report <span className="dim">· {entry.hash}</span>
      </p>
      <div className="report-parts">
        <section className="situation">
          <h4>The situation</h4>
          <p>{situation}</p>
        </section>
        <section className="contribution">
          <h4>My contribution</h4>
          <ul>
            {contribution.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section className="changed">
          <h4>What changed</h4>
          <ul>
            {changed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
      {Sketch && (
        <section className="behind">
          <h4>Behind the scenes</h4>
          <Sketch />
        </section>
      )}
    </div>
  );
}

function ExperienceBody() {
  const [open, setOpen] = useState(null);
  // The role under the reader's eye, and the one under their pointer or keyboard focus if any.
  const [near, setNear] = useState(EXPERIENCE[0].hash);
  const [pointed, setPointed] = useState(null);
  const list = useRef(null);

  useEffect(() => {
    let queued = 0;
    const read = () => {
      queued = 0;
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
    // Captured, so that scrolling inside a landing panel in the flight counts as well.
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(queued);
      removeEventListener('scroll', onScroll, { capture: true });
      removeEventListener('resize', onScroll);
    };
  }, []);

  // A camp picked on the ridge unfolds its role and brings it into view.
  const pick = useCallback((hash) => {
    setOpen(hash);
    requestAnimationFrame(() =>
      list.current?.querySelector(`[data-hash="${hash}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
  }, []);

  const lit = pointed ?? near;
  return (
    <div className="ascent">
      <ol className="stops" ref={list}>
        {EXPERIENCE.map((entry, i) => {
          const unfolded = open === entry.hash;
          const reportId = `report-${entry.hash}`;
          return (
            <li
              className={`stop${unfolded ? ' open' : ''}${lit === entry.hash ? ' lit' : ''}`}
              data-hash={entry.hash}
              onPointerEnter={() => setPointed(entry.hash)}
              onPointerLeave={() => setPointed(null)}
              onFocus={() => setPointed(entry.hash)}
              onBlur={() => setPointed(null)}
              key={entry.hash}
            >
              <p className="stop-when">
                <span className="camp-tag">camp {EXPERIENCE.length - i}</span> {entry.years}
              </p>
              <h3>
                {entry.company} <span className="dim">·</span> <b>{entry.role}</b>
              </h3>
              <p className="stop-text">{entry.text}</p>
              <button
                className="link"
                aria-expanded={unfolded}
                aria-controls={reportId}
                onClick={() => setOpen(unfolded ? null : entry.hash)}
              >
                [ {unfolded ? 'close this chapter ↑' : 'explore this chapter ↓'} ]
              </button>
              {unfolded && <FieldReport entry={entry} id={reportId} />}
            </li>
          );
        })}
      </ol>
      <Ridge roles={EXPERIENCE} lit={lit} open={open} onPick={pick} />
    </div>
  );
}

/**
 * A project's picture: its screenshot, or when there is none its diagram (in the report) or the
 * short glyph that stands in for it in a list.
 */
function ProjectPicture({ project, full = false }) {
  if (!project.image) return <pre className="diagram">{full ? project.diagram : project.glyph}</pre>;
  const src = full && project.image.full ? project.image.full : project.image.src;
  return <img src={src} alt={project.image.alt} loading="lazy" />;
}

function ProjectLinks({ project }) {
  return project.links.map((link) => (
    <a href={link.url} key={link.label} target="_blank" rel="noreferrer">
      [ {link.label} ↗ ]
    </a>
  ));
}

/** Everything about one project, in reading order. The page and the flight both show this. */
export function ProjectReport({ project }) {
  const Demo = DEMOS[project.demo];
  return (
    <div className={`dossier${project.image?.tall ? ' tall' : ''}`}>
      <section>
        <h3>What it is</h3>
        <p className="lead">{project.summary}</p>
      </section>
      {Demo && (
        <section>
          <h3>Try it</h3>
          <div className="scene">
            <Demo />
          </div>
        </section>
      )}
      {project.why && (
        <section>
          <h3>Why I built it</h3>
          <p>{project.why}</p>
        </section>
      )}
      <section className="built">
        <div>
          <h3>What I built</h3>
          <ul>
            {project.built.map((line) => (
              <li key={line.text}>{line.text}</li>
            ))}
          </ul>
        </div>
        <figure>
          <ProjectPicture project={project} full />
        </figure>
      </section>
      <section>
        <h3>Where it stands</h3>
        <p>
          <span className="status">{project.status}</span> <span className="dim">{project.year}</span>
        </p>
        <p className="tags">
          {project.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </p>
        <p className="links">
          <ProjectLinks project={project} />
          {project.links.length === 0 && <span className="dim">// the repository is private</span>}
        </p>
      </section>
    </div>
  );
}

/**
 * A project's playable preview. Where there is room it is simply there; on a phone it waits behind
 * a button, so the page stays short and nothing starts until it is asked for.
 */
function Preview({ project }) {
  const [shown, setShown] = useState(() => innerWidth >= 760);
  const Demo = DEMOS[project.demo];
  if (!shown) {
    return (
      <button className="try" onClick={() => setShown(true)}>
        [ ▶ try a preview ]
      </button>
    );
  }
  return (
    <div className="scene">
      <Demo compact />
    </div>
  );
}

/** The link that opens a project's report: a real address on the page, a sheet in the flight. */
function Explore({ project, onRead, children }) {
  const openOnPage = useContext(OpenProject);
  return (
    <a
      className="explore"
      href={`/projects/${project.id}`}
      onClick={(event) => {
        // A click meant for a new tab or window is left to the browser.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        if (openOnPage) openOnPage(project.id);
        else onRead(project);
      }}
    >
      {children}
    </a>
  );
}

function ProjectsBody() {
  const [reading, setReading] = useState(null);
  const close = useCallback(() => setReading(null), []);
  const playable = PROJECTS.filter((project) => project.demo);
  const others = PROJECTS.filter((project) => !project.demo);
  return (
    <div className="destinations">
      <div className="playable">
        {playable.map((project, i) => (
          <article className={`destination${i === 0 ? ' featured' : ''}`} key={project.id}>
            <div className="destination-text">
              <p className="dim">
                {project.path} <span className="status">{project.status}</span>
              </p>
              <h3>{project.title}</h3>
              <p>{project.tagline}</p>
            </div>
            <Preview project={project} />
            {i === 0 && (
              <figure className="destination-shot">
                <ProjectPicture project={project} />
              </figure>
            )}
            <p className="links">
              <Explore project={project} onRead={setReading}>
                [ explore project → ]
              </Explore>
              <ProjectLinks project={project} />
            </p>
          </article>
        ))}
      </div>
      <p className="list-label">also on the map</p>
      <ul className="side-quests">
        {others.map((project) => (
          <li key={project.id}>
            <figure>
              <ProjectPicture project={project} />
            </figure>
            <div>
              <p className="dim">
                {project.path} <span className="status">{project.status}</span>
              </p>
              <h3>{project.title}</h3>
              <p>{project.tagline}</p>
              <p className="links">
                <Explore project={project} onRead={setReading}>
                  [ explore project → ]
                </Explore>
                <ProjectLinks project={project} />
              </p>
            </div>
          </li>
        ))}
      </ul>
      {reading && (
        <Sheet title={`${reading.path} — destination report`} label={reading.title} onClose={close}>
          <div className="readme-body">
            <div>
              <h2 className="report-name">{reading.title}</h2>
              <p className="dim">{reading.tagline}</p>
              <ProjectReport project={reading} />
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function SkillsBody() {
  return (
    <dl className="gear">
      {SKILLS.map((group) => (
        <div key={group.label}>
          <dt>{group.label}/</dt>
          <dd className="tags">
            {group.items.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ContactBody() {
  return (
    <div className="contact">
      <h3 className="shout">
        <span>&gt;</span> {CONTACT.heading}
      </h3>
      <p>{CONTACT.text}</p>
      <p className="links">
        {CONTACT.links
          .filter((link) => link.url)
          .map((link) => (
            <a className="button" href={link.url} key={link.label} target="_blank" rel="noreferrer">
              [ {link.label} ↗ ]
            </a>
          ))}
      </p>
    </div>
  );
}

export const BODIES = { about: AboutBody, experience: ExperienceBody, projects: ProjectsBody, skills: SkillsBody, contact: ContactBody };
