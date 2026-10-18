import { SKETCHES } from './sketches/index.js';

const SECTIONS = [
  { key: 'situation', heading: 'The situation', className: 'situation' },
  { key: 'contribution', heading: 'My contribution', className: 'contribution' },
  { key: 'changed', heading: 'What changed', className: 'changed' },
];

/** All of the existing report stays readable with the page's own scroll. */
export default function ExperienceReport({ entry, embedded = false }) {
  const Heading = embedded ? 'h3' : 'h2';
  const Sketch = SKETCHES[entry.sketch];
  return (
    <div className="experience-report">
      <div className="experience-report-parts">
        {SECTIONS.map(({ key, heading, className }) => (
          <section className={`experience-report-section ${className}`} key={key}>
            <Heading>{heading}</Heading>
            {Array.isArray(entry.report[key]) ? (
              <ul>{entry.report[key].map((line) => <li key={line}>{line}</li>)}</ul>
            ) : <p>{entry.report[key]}</p>}
          </section>
        ))}
      </div>
      {Sketch && (
        <section className="experience-report-behind">
          <Heading>Behind the scenes</Heading>
          <Sketch key={entry.hash} />
        </section>
      )}
    </div>
  );
}
