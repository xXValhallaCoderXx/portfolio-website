import { ABOUT, CONTACT, EXPERIENCE, PROJECTS } from '../content.js';

// The body of each section. The page and the flight's landing panels both render these.

function AboutBody() {
  return (
    <div className="about">
      <p className="comment"># About Me</p>
      {ABOUT.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p className="tags">
        {ABOUT.flags.map((flag) => (
          <span key={flag}>--{flag}</span>
        ))}
      </p>
    </div>
  );
}

function ExperienceBody() {
  return (
    <ol className="log">
      {EXPERIENCE.map((entry, i) => (
        <li key={entry.hash} className={i === 0 ? 'head' : undefined}>
          <span className="hash">commit {entry.hash}</span> <span className="dim">[{entry.years}]</span>{' '}
          <b>{entry.role}</b>
          <p>{entry.text}</p>
        </li>
      ))}
    </ol>
  );
}

function ProjectsBody() {
  return (
    <div className="cards">
      {PROJECTS.map((project) => (
        <article className="card" key={project.name}>
          <p className="dim">{project.path}</p>
          <h3>{project.name}</h3>
          <p># {project.text}</p>
          <p className="tags">
            {project.tags.map((tag) => (
              <span key={tag}>--{tag}</span>
            ))}
          </p>
          <a href={project.url}>[ open_project → ]</a>
        </article>
      ))}
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
        {CONTACT.links.map((link) => (
          <a className="button" href={link.url} key={link.label}>
            [ {link.label} ]
          </a>
        ))}
      </p>
    </div>
  );
}

export const BODIES = { about: AboutBody, experience: ExperienceBody, projects: ProjectsBody, contact: ContactBody };

/** One section of the page: the command that "printed" it on the left, its body on the right. */
export function Section({ section, onFly }) {
  const Body = BODIES[section.id];
  return (
    <section className="row" id={section.id}>
      <div className="prompt">
        <p>$ {section.command}</p>
        <button className="link" onClick={() => onFly(section.id)}>
          ↗ fly to {section.place}
        </button>
      </div>
      <Body />
    </section>
  );
}
