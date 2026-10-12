import { useCallback, useState } from 'react';
import { ABOUT, CONTACT, EXPERIENCE, PROJECTS } from '../content.js';
import Sheet from './Sheet.jsx';

// The body of each section. The page's panes and the flight's landing panels both render these.

function AboutBody() {
  return (
    <div className="about">
      <div>
        <p className="comment"># About Me</p>
        {ABOUT.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div>
        <p className="comment">## Facts</p>
        <dl className="facts">
          {ABOUT.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}:</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className="tags">
          {ABOUT.flags.map((flag) => (
            <span key={flag}>--{flag}</span>
          ))}
        </p>
      </div>
    </div>
  );
}

/** One role in full, shown the way `git show` prints a commit: what it was, then what it added. */
function RoleDetail({ entry, onClose }) {
  return (
    <Sheet title={`experience.log — git show ${entry.hash}`} label={`${entry.role} at ${entry.company}`} onClose={onClose}>
      <div className="readme-body">
        <div>
          <p className="hash">commit {entry.hash}</p>
          <dl className="facts">
            <div>
              <dt>role:</dt>
              <dd>
                <b>{entry.role}</b>
              </dd>
            </div>
            <div>
              <dt>company:</dt>
              <dd>{entry.company}</dd>
            </div>
            <div>
              <dt>date:</dt>
              <dd>{entry.years}</dd>
            </div>
          </dl>
          <p className="lead">{entry.text}</p>
          <ul className="added">
            {entry.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

function ExperienceBody() {
  const [shown, setShown] = useState(null);
  const close = useCallback(() => setShown(null), []);
  return (
    <ol className="log">
      {EXPERIENCE.map((entry, i) => (
        <li key={entry.hash} className={i === 0 ? 'head' : undefined}>
          <button className="role" onClick={() => setShown(entry)}>
            <span className="hash">commit {entry.hash}</span> <span className="dim">[{entry.years}]</span>{' '}
            <b>{entry.role}</b> <span className="at">@ {entry.company}</span>
            <span className="what">{entry.text}</span>
            <span className="more">[ git show {entry.hash} ]</span>
          </button>
        </li>
      ))}
      {shown && <RoleDetail entry={shown} onClose={close} />}
    </ol>
  );
}

/**
 * A project's picture: its screenshot, or when there is none its diagram (in the README) or the
 * short glyph that stands in for it on a card.
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

/** A project's README. */
function ProjectReadme({ project, onClose }) {
  return (
    <Sheet title={`${project.path} — cat README.md`} label={project.title} onClose={onClose}>
      <div className={`readme-body${project.image?.tall ? ' beside' : ''}`}>
        <div>
          <h3 className="comment"># {project.title}</h3>
          <p className="lead">{project.tagline}</p>
          <p className="dim">
            {project.status} · {project.year}
          </p>
          <p>{project.summary}</p>
          <p className="comment">## What I built</p>
          <ul>
            {project.built.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="tags">
            {project.tags.map((tag) => (
              <span key={tag}>--{tag}</span>
            ))}
          </p>
          <p className="links">
            <ProjectLinks project={project} />
            {project.links.length === 0 && <span className="dim">// the repository is private</span>}
          </p>
        </div>
        <figure>
          <ProjectPicture project={project} full />
        </figure>
      </div>
    </Sheet>
  );
}

function ProjectsBody() {
  const [reading, setReading] = useState(null);
  const close = useCallback(() => setReading(null), []);
  return (
    <div className="projects">
      {PROJECTS.map((project) => (
        <article className="project" key={project.id}>
          <button className="shot" onClick={() => setReading(project)} aria-label={`Read about ${project.title}`}>
            <ProjectPicture project={project} />
          </button>
          <div>
            <p className="dim">
              {project.path} <span className="status">{project.status}</span>
            </p>
            <h3>{project.name}</h3>
            <p>{project.tagline}</p>
            <p className="tags">
              {project.tags.map((tag) => (
                <span key={tag}>--{tag}</span>
              ))}
            </p>
            <p className="links">
              <button className="link" onClick={() => setReading(project)}>
                [ cat README.md ]
              </button>
              <ProjectLinks project={project} />
            </p>
          </div>
        </article>
      ))}
      {reading && <ProjectReadme project={reading} onClose={close} />}
    </div>
  );
}

function ContactBody() {
  return (
    <div className="contact">
      <h3 className="shout">
        <span>&gt;</span> {CONTACT.heading}
      </h3>
      <p>// {CONTACT.text}</p>
      <p className="links">
        {CONTACT.links
          .filter((link) => link.url)
          .map((link) => (
            <a className="button" href={link.url} key={link.label} target="_blank" rel="noreferrer">
              [ {link.label} ]
            </a>
          ))}
      </p>
    </div>
  );
}

export const BODIES = { about: AboutBody, experience: ExperienceBody, projects: ProjectsBody, contact: ContactBody };
