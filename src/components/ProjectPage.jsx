import { useEffect } from 'react';
import { PROFILE, PROJECTS, SECTIONS } from '../content.js';
import { ProjectReport } from './Sections.jsx';

const forge = SECTIONS.find((section) => section.id === 'projects');

/**
 * A project's own page: its report, with a way back to where the visitor was, a way on to the
 * next project, and the flight to the place the projects stand in.
 */
export default function ProjectPage({ project, onBack, onOpen, onFly }) {
  const next = PROJECTS[(PROJECTS.indexOf(project) + 1) % PROJECTS.length];

  useEffect(() => {
    const before = document.title;
    document.title = `${project.title} — ${PROFILE.name}`;
    return () => {
      document.title = before;
    };
  }, [project]);

  // Plain clicks stay in the page; a click meant for a new tab is left to the browser.
  const within = (action) => (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    action();
  };

  return (
    <main className="project-page" key={project.id}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/#projects" onClick={within(onBack)}>
          [ ← back to projects ]
        </a>
        <span className="dim">{project.path}</span>
        <span className="spacer" />
        <button className="link" onClick={() => onFly('projects')}>
          ↗ fly to {forge.place}
        </button>
      </nav>

      <header className="project-head">
        <p className="dim">destination report</p>
        <h1 className="shout">
          <span>&gt;</span> {project.title.toUpperCase().replace(/ /g, '_')}
        </h1>
        <p className="lead">{project.tagline}</p>
      </header>

      <ProjectReport project={project} />

      <nav className="onward" aria-label="More projects">
        <a href="/#projects" onClick={within(onBack)}>
          [ ← back to projects ]
        </a>
        <a href={`/projects/${next.id}`} onClick={within(() => onOpen(next.id))}>
          [ next destination: {next.title} → ]
        </a>
      </nav>
    </main>
  );
}
