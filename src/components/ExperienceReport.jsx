import { useLayoutEffect, useRef } from 'react';
import { SKETCHES } from './sketches/index.js';

const SECTIONS = [
  { key: 'situation', label: 'situation', heading: 'The situation', className: 'situation' },
  { key: 'part', label: 'my part', heading: 'My contribution', className: 'contribution' },
  { key: 'changed', label: 'changed', heading: 'What changed', className: 'changed' },
];

/** A role's existing report, shown together on desktop or a section at a time in compact views. */
export default function ExperienceReport({ entry, id, compact = false, tab = 'situation', onTabChange }) {
  const buttons = useRef([]);
  const panel = useRef(null);
  const Sketch = SKETCHES[entry.sketch];
  const activeSection =
    tab === 'behind' && Sketch ? 'behind' : SECTIONS.some((section) => section.key === tab) ? tab : 'situation';
  const selected = compact || activeSection === 'behind' ? activeSection : 'report';
  const tabs = compact ? [...SECTIONS] : [{ key: 'report', label: 'report' }];
  if (Sketch) tabs.push({ key: 'behind', label: 'behind the scenes' });
  const panelId = `${id}-panel`;
  const tabId = (key) => `${id}-tab-${key}`;

  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [selected, entry.hash]);

  const select = (key) => onTabChange(key === 'report' ? 'situation' : key);
  const onKeyDown = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;

    event.preventDefault();
    event.stopPropagation();
    buttons.current[next]?.focus();
    select(tabs[next].key);
  };

  const section = (definition) => {
    const content = entry.report[definition.key === 'part' ? 'contribution' : definition.key];
    return (
      <section className={`experience-report-section ${definition.className}`} key={definition.key}>
        <h4>{definition.heading}</h4>
        {Array.isArray(content) ? (
          <ul>
            {content.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>{content}</p>
        )}
      </section>
    );
  };

  return (
    <div
      className={`experience-report${compact ? ' compact' : ''}`}
      id={id}
      role="region"
      aria-label={`Field report: ${entry.role} at ${entry.company}`}
    >
      <header className="experience-report-head">
        <p className="experience-report-title">
          field report <span className="dim">· {entry.hash}</span>
        </p>
        <div className="experience-report-tabs" role="tablist" aria-label="Field report sections">
          {tabs.map((item, index) => (
            <button
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabId(item.key)}
              aria-selected={selected === item.key}
              aria-controls={panelId}
              tabIndex={selected === item.key ? 0 : -1}
              onClick={() => select(item.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              key={item.key}
            >
              {compact && item.key === 'behind' ? 'behind' : item.label}
            </button>
          ))}
        </div>
      </header>
      <div
        ref={panel}
        className="experience-report-panel"
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selected)}
        tabIndex={0}
      >
        {activeSection === 'behind' ? (
          <section className="experience-report-behind">
            <h4>Behind the scenes</h4>
            <Sketch key={entry.hash} />
          </section>
        ) : compact ? (
          section(SECTIONS.find((definition) => definition.key === activeSection))
        ) : (
          <div className="experience-report-parts">{SECTIONS.map(section)}</div>
        )}
      </div>
    </div>
  );
}
