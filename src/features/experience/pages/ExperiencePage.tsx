import Breadcrumb from '../../../components/molecules/Breadcrumb.tsx';
import type { ExperienceEntry } from '../../../domains/portfolio/portfolio.types.ts';
import { useEffect } from 'react';
import { PROFILE } from '../../../domains/portfolio/content.ts';
import ExperienceDetail from '../components/ExperienceDetail.tsx';

export default function ExperiencePage({ entry, onBack }: { entry: ExperienceEntry; onBack: () => void }) {
  useEffect(() => {
    const before = document.title;
    document.title = `${entry.role} at ${entry.company} — ${PROFILE.name}`;
    return () => { document.title = before; };
  }, [entry]);

  return (
    <main className="project-page experience-page">
      <Breadcrumb href="/#experience" onBack={onBack} path={`experience.log/${entry.hash}`}>[ ← back to experience ]</Breadcrumb>
      <ExperienceDetail entry={entry} />
    </main>
  );
}
