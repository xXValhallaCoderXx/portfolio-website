import { useEffect } from 'react';
import { PROFILE, SECTIONS } from '../content.js';
import ProjectDetail from './ProjectDetail.jsx';

const forge = SECTIONS.find((section) => section.id === 'projects');

/** The project's address adds page navigation around the shared detail component. */
export default function ProjectPage({ project, onBack, onOpen, onFly }) {
  useEffect(() => {
    const before = document.title;
    document.title = `${project.title} — ${PROFILE.name}`;
    return () => {
      document.title = before;
    };
  }, [project]);

  const back = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onBack();
  };

  return (
    <main className="project-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/#projects" onClick={back}>
          [ ← back to projects ]
        </a>
        <span className="dim project-path">{project.path}</span>
        <button className="link project-fly" onClick={() => onFly('projects')}>
          ↗ fly to {forge.place}
        </button>
      </nav>
      <ProjectDetail key={project.id} project={project} onBack={onBack} onOpen={onOpen} />
    </main>
  );
}
