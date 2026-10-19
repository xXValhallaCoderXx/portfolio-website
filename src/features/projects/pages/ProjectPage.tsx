import Breadcrumb from '../../../components/molecules/Breadcrumb.tsx';
import type { Project } from '../../../domains/portfolio/portfolio.types.ts';
import { useEffect } from 'react';
import { PROFILE } from '../../../domains/portfolio/content.ts';
import ProjectDetail from '../components/ProjectDetail.tsx';

/** The project's address adds page navigation around the shared detail component. */
export default function ProjectPage({ project, onBack, onOpen }: { project: Project; onBack: () => void; onOpen: (id: string) => void }) {
  useEffect(() => {
    const before = document.title;
    document.title = `${project.title} — ${PROFILE.name}`;
    return () => {
      document.title = before;
    };
  }, [project]);

  return (
    <main className="project-page">
      <Breadcrumb href="/#projects" onBack={onBack} path={project.path}>[ ← back to projects ]</Breadcrumb>
      <ProjectDetail key={project.id} project={project} onBack={onBack} onOpen={onOpen} />
    </main>
  );
}
