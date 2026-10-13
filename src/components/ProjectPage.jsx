import { Fragment, useEffect, useState } from 'react';
import { PROFILE, PROJECTS, SECTIONS } from '../content.js';
import { DEMOS } from './demos/index.js';
import ProjectScreen from './ProjectScreen.jsx';
import ScreenGallery from './ScreenGallery.jsx';

const forge = SECTIONS.find((section) => section.id === 'projects');
const number = (index) => String(index + 1).padStart(2, '0');

function ProjectLinks({ project }) {
  return project.links.length ? (
    project.links.map((link) => (
      <a href={link.url} key={link.label} target="_blank" rel="noreferrer">
        [ {link.label} ↗ ]
      </a>
    ))
  ) : (
    <span className="dim">// the repository is private</span>
  );
}

function FeatureTour({ project, onOpen }) {
  const [selected, setSelected] = useState(0);
  const feature = project.built[selected];
  const screen = project.screens?.find((entry) => entry.id === feature.screenId) ?? project.screens?.[0];

  return (
    <div className="feature-tour">
      <ol className="feature-choices" aria-label="Contributions">
        {project.built.map((entry, index) => (
          <li key={entry.text}>
            <button
              className={`feature-choice${selected === index ? ' selected' : ''}`}
              aria-pressed={selected === index}
              aria-controls="project-feature-detail"
              aria-label={`Contribution ${index + 1}: ${entry.text}`}
              onClick={() => setSelected(index)}
            >
              <span className="feature-number">{number(index)}</span>
              <span className="feature-copy">
                <span>{entry.text}</span>
                {entry.caption && <span className="feature-location">↳ {entry.caption}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="feature-presentation">
        <figure className="feature-preview">
          {screen ? (
            <ProjectScreen
              project={project}
              screen={screen}
              highlight={screen.placeholder ? null : feature.highlight}
              onOpen={() => onOpen(project.screens.indexOf(screen))}
            />
          ) : (
            <pre className="project-diagram">{project.diagram}</pre>
          )}
        </figure>
        <div className="feature-detail" id="project-feature-detail" aria-live="polite" aria-atomic="true">
          <p className="feature-description">{feature.text}</p>
          {feature.caption && (
            <p className="feature-caption">
              <span>{number(selected)}</span> · {feature.caption}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The standalone report uses the same project content as the flight's reading panels. */
export default function ProjectPage({ project, onBack, onOpen, onFly }) {
  const [gallery, setGallery] = useState(null);
  const next = PROJECTS[(PROJECTS.indexOf(project) + 1) % PROJECTS.length];
  const Demo = DEMOS[project.demo];
  const screens = project.screens ?? [];
  const heroScreen = screens[0];
  const source = project.links.some((link) => link.label === 'source') ? 'public repository' : 'private repository';

  useEffect(() => {
    const before = document.title;
    document.title = `${project.title} — ${PROFILE.name}`;
    return () => {
      document.title = before;
    };
  }, [project]);

  // Keep real addresses for modified clicks and for opening links in another tab.
  const within = (action) => (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    action();
  };

  return (
    <main className="project-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/#projects" onClick={within(onBack)}>
          [ ← back to projects ]
        </a>
        <span className="dim project-path">{project.path}</span>
        <button className="link project-fly" onClick={() => onFly('projects')}>
          ↗ fly to {forge.place}
        </button>
      </nav>

      <header className="project-head">
        <div className="project-intro">
          <p className="project-eyebrow">destination report</p>
          <h1 className="shout">
            <span>&gt;</span>{' '}
            {project.title
              .toUpperCase()
              .split(' ')
              .map((word, index) => (
                <Fragment key={index}>
                  {index > 0 && (
                    <>
                      _<wbr />
                    </>
                  )}
                  {word}
                </Fragment>
              ))}
          </h1>
          <p className="project-tagline">{project.tagline}</p>
          <dl className="project-facts">
            <div>
              <dt>Status</dt>
              <dd>
                <span className="status">{project.status}</span>
              </dd>
            </div>
            <div>
              <dt>Year</dt>
              <dd>{project.year}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{project.platform}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{source}</dd>
            </div>
          </dl>
          <p className="project-mobile-tags">{project.tags.join(' · ')}</p>
          <div className="project-actions">
            <a className="button primary" href={Demo ? '#project-demo' : '#project-built'}>
              [ {Demo ? '▶ try the sample' : '↓ explore the build'} ]
            </a>
            {heroScreen && (
              <button onClick={() => setGallery(0)}>
                [ ⤢ {screens.length} {screens.length === 1 ? 'screen' : 'screens'} ]
              </button>
            )}
          </div>
        </div>
        <figure className={`project-visual${project.image?.tall ? ' portrait' : ''}`}>
          {heroScreen ? (
            <>
              <div className={`screen-deck${screens.length > 1 ? ' stacked' : ''}`}>
                {screens.length > 1 &&
                  screens
                    .slice(1, 3)
                    .reverse()
                    .map((screen, index) => (
                      <div className={`deck-back deck-back-${index + 1}`} aria-hidden="true" key={screen.id}>
                        <span>
                          {project.title} — {screen.title}
                        </span>
                      </div>
                    ))}
                <ProjectScreen project={project} screen={heroScreen} onOpen={() => setGallery(0)} />
              </div>
              <figcaption className="hero-caption">
                <span>
                  <b>01 / {String(screens.length).padStart(2, '0')}</b> · {heroScreen.title}
                </span>
                <button className="link" onClick={() => setGallery(0)}>
                  open gallery ↗
                </button>
              </figcaption>
            </>
          ) : (
            <pre className="project-diagram">{project.diagram}</pre>
          )}
        </figure>
      </header>

      <section className="project-section" aria-labelledby="project-summary">
        <h2 id="project-summary">What it is</h2>
        <p className="project-summary">{project.summary}</p>
      </section>
      {Demo && (
        <section className="project-section" id="project-demo" aria-labelledby="project-demo-heading">
          <h2 id="project-demo-heading">Try it</h2>
          <div className="scene">
            <Demo detail />
          </div>
        </section>
      )}
      {project.why && (
        <section className="project-section" aria-labelledby="project-why">
          <h2 id="project-why">Why I built it</h2>
          <p className="project-summary">{project.why}</p>
        </section>
      )}
      <section className="project-section" id="project-built" aria-labelledby="project-built-heading">
        <div className="project-section-heading">
          <h2 id="project-built-heading">What I built</h2>
          <span className="dim">pick a contribution to explore</span>
        </div>
        <FeatureTour project={project} onOpen={setGallery} />
      </section>
      <section className="project-section project-standing" aria-labelledby="project-standing-heading">
        <h2 id="project-standing-heading">Where it stands</h2>
        <p>
          <span className="status">{project.status}</span> <span className="dim">{project.year}</span>
        </p>
        <p className="tags">
          {project.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </p>
        <p className="links">
          <ProjectLinks project={project} />
        </p>
      </section>
      <p className="project-mobile-links links">
        <ProjectLinks project={project} />
      </p>

      <nav className="onward" aria-label="More projects">
        <a className="project-next" href={`/projects/${next.id}`} onClick={within(() => onOpen(next.id))}>
          <span className="dim">next destination</span>
          <span>{next.title} →</span>
        </a>
        <a href="/#projects" onClick={within(onBack)}>
          [ ← back to projects ]
        </a>
      </nav>
      {gallery !== null && <ScreenGallery project={project} initialIndex={gallery} onClose={() => setGallery(null)} />}
    </main>
  );
}
