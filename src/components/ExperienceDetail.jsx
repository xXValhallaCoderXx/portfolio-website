import ExperienceReport from './ExperienceReport.jsx';

/** One report for a role's own page and the flight's reading sheet. */
export default function ExperienceDetail({ entry, embedded = false }) {
  const Heading = embedded ? 'h2' : 'h1';
  return (
    <article className="experience-detail">
      <header className="experience-detail-head">
        <p className="dim">experience.log · {entry.hash}</p>
        <Heading tabIndex={-1} data-detail-heading>{entry.role}</Heading>
        <p className="experience-company">{entry.company}</p>
        <p className="experience-dates">{entry.years}</p>
        <p className="experience-detail-summary">{entry.text}</p>
      </header>
      <ExperienceReport entry={entry} embedded={embedded} />
    </article>
  );
}
