import Breadcrumb from '../../../components/molecules/Breadcrumb.tsx';
import type { ExperienceEntry } from '../../../domains/portfolio/portfolio.types.ts';
import { useEffect } from 'react';
import { EXPERIENCE, PROFILE } from '../../../domains/portfolio/content.ts';
import ExperienceDetail from '../components/ExperienceDetail.tsx';

function RoleNavigation({ entry, onOpen, position }: {
  entry: ExperienceEntry; onOpen: (hash: string) => void; position: 'top' | 'bottom';
}) {
  const index = EXPERIENCE.findIndex((role) => role.hash === entry.hash);
  const older = index >= 0 ? EXPERIENCE[index + 1] : undefined;
  const newer = index > 0 ? EXPERIENCE[index - 1] : undefined;
  return (
    <nav className="experience-role-nav" aria-label={`Other experience roles (${position})`}>
      {([{ direction: 'older', role: older }, { direction: 'newer', role: newer }] as const).map(({ direction, role }) => role && (
        <a key={direction} className={`experience-adjacent-role ${direction}`} href={`/experience/${role.hash}`}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            onOpen(role.hash);
          }}
        >
          <span className="experience-role-direction">{direction === 'older' ? '← older role' : 'newer role →'}</span>
          <b>{role.role}</b>
          <span>{role.company}</span>
          <span className="experience-adjacent-dates">{role.years}</span>
        </a>
      ))}
    </nav>
  );
}

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
      <RoleNavigation entry={entry} onOpen={onOpen} position="top" />
      <ExperienceDetail entry={entry} />
      <RoleNavigation entry={entry} onOpen={onOpen} position="bottom" />
    </main>
  );
}
