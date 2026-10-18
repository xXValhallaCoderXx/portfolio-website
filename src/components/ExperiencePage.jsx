import { useEffect } from 'react';
import { PROFILE } from '../content.js';
import ExperienceDetail from './ExperienceDetail.jsx';

export default function ExperiencePage({ entry, onBack }) {
  useEffect(() => {
    const before = document.title;
    document.title = `${entry.role} at ${entry.company} — ${PROFILE.name}`;
    return () => { document.title = before; };
  }, [entry]);

  return (
    <main className="project-page experience-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/#experience" onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          onBack();
        }}>[ ← back to experience ]</a>
        <span className="dim project-path">experience.log/{entry.hash}</span>
      </nav>
      <ExperienceDetail entry={entry} />
    </main>
  );
}
