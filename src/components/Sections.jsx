import { createContext, useCallback, useContext, useState } from 'react';
import { ABOUT, CONTACT, PROJECTS, SKILLS, STATS } from '../content.js';
import { DEMOS } from './demos/index.js';
import Experience from './Experience.jsx';
import Sheet from './Sheet.jsx';
import ProjectDetail from './ProjectDetail.jsx';
import ProjectVideo from './ProjectVideo.jsx';

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

/**
 * A project's card picture, or the short glyph that stands in for it in a list.
 */
function ProjectPicture({ project }) {
  if (!project.image) return <pre className="diagram">{project.glyph}</pre>;
  return <img src={project.image.src} alt={project.image.alt} loading="lazy" />;
}

function ProjectLinks({ project }) {
  return project.links.map((link) => (
    <a href={link.url} key={link.label} target="_blank" rel="noreferrer">
      [ {link.label} ↗ ]
    </a>
  ));
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
            {project.video ? <ProjectVideo project={project} /> : <Preview project={project} />}
            {i === 0 && !project.video && (
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
        <Sheet
          key={reading.id}
          title={`${reading.path} — destination report`}
          label={reading.title}
          className="project-report-window"
          onClose={close}
        >
          <div className="readme-body project-report-body">
            <ProjectDetail
              project={reading}
              onBack={close}
              onOpen={(id) => setReading(PROJECTS.find((project) => project.id === id))}
              embedded
            />
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

export const BODIES = {
  about: AboutBody,
  experience: Experience,
  projects: ProjectsBody,
  skills: SkillsBody,
  contact: ContactBody,
};
