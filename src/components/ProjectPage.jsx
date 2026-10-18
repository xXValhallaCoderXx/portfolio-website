import { useEffect } from 'react';
import { PROFILE } from '../content.js';
import ProjectDetail from './ProjectDetail.jsx';

/** The project's address adds page navigation around the shared detail component. */
export default function ProjectPage({ project, onBack, onOpen }) {
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
      </nav>
      <ProjectDetail key={project.id} project={project} onBack={onBack} onOpen={onOpen} />
    </main>
  );
}
