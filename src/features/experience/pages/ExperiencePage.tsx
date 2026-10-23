import Breadcrumb from '../../../components/molecules/Breadcrumb.tsx';
import type { ExperienceEntry } from '../../../domains/portfolio/portfolio.types.ts';
import { useEffect } from 'react';
import { EXPERIENCE, PROFILE } from '../../../domains/portfolio/content.ts';
import ExperienceDetail from '../components/ExperienceDetail.tsx';
import ExperienceRoleRidge from '../components/ExperienceRoleRidge.tsx';

export default function ExperiencePage({ entry, onBack, onOpen }: {
  entry: ExperienceEntry; onBack: () => void; onOpen: (hash: string) => void;
}) {
  useEffect(() => {
    const before = document.title;
    document.title = `${entry.role} at ${entry.company} — ${PROFILE.name}`;
    return () => { document.title = before; };
  }, [entry]);

  return (
    <main className="project-page experience-page">
      <Breadcrumb href="/#experience" onBack={onBack} path={`experience.log/${entry.hash}`}>[ ← back to experience ]</Breadcrumb>
      <ExperienceRoleRidge roles={EXPERIENCE} selected={entry.hash} onOpen={onOpen} position="top" />
      <ExperienceDetail entry={entry} />
      <ExperienceRoleRidge roles={EXPERIENCE} selected={entry.hash} onOpen={onOpen} position="bottom" />
    </main>
  );
}
