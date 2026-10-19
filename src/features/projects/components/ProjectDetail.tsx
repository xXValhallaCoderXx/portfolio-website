import ExternalLink from '../../../components/atoms/ExternalLink.tsx';
import type { Project } from '../../../domains/portfolio/portfolio.types.ts';
import { Fragment, useState } from 'react';
import { PROJECTS } from '../../../domains/portfolio/content.ts';
import { DEMOS } from './demos/index.ts';
import ProjectScreen,{ isPortraitScreen } from './ProjectScreen.tsx';
import ScreenGallery from './ScreenGallery.tsx';
import ProjectVideo from './ProjectVideo.tsx';

const number = (index: number) => String(index + 1).padStart(2, '0');

function ProjectLinks({ project }: { project: Project }) {
  return project.links.length ? (
    project.links.map((link) => (
      <ExternalLink href={link.url} key={link.label}>
        [ {link.label} ↗ ]
      </ExternalLink>
    ))
  ) : (
    <span className="dim">// the repository is private</span>
  );
}

function FeatureTour({ project, onOpen, detailId }: { project: Project; onOpen: (index: number) => void; detailId: string }) {
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
              aria-controls={detailId}
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
              onOpen={() => onOpen((project.screens ?? []).indexOf(screen))}
            />
          ) : (
            <pre className="project-diagram">{project.diagram}</pre>
          )}
        </figure>
        <div className="feature-detail" id={detailId} aria-live="polite" aria-atomic="true">
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

/** One project report, shared by its address and the flight's reading window. */
export default function ProjectDetail({ project, onBack, onOpen, embedded = false }: { project: Project; onBack: () => void; onOpen: (id: string) => void; embedded?: boolean }) {
  const [gallery, setGallery] = useState<number | null>(null);
  const next = PROJECTS[(PROJECTS.indexOf(project) + 1) % PROJECTS.length];
  const Demo = project.demo ? DEMOS[project.demo] : null;
  const screens = project.screens ?? [];
  const heroScreen = screens[0];
  const source = project.links.some((link) => link.label === 'source') ? 'public repository' : 'private repository';

  const Title = embedded ? 'h2' : 'h1';
  const SectionTitle = embedded ? 'h3' : 'h2';
  const prefix = embedded ? 'flight-project' : 'project';
  const jumpTo = (event: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    if (!embedded || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    document.getElementById(target)?.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };

  // Keep real addresses for modified clicks and for opening links in another tab.
  const within = (action: () => void) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    action();
  };

  return (
    <article className={`project-detail${embedded ? ' embedded' : ''}`}>
      <header className="project-head">
        <div className="project-intro">
          <p className="project-eyebrow">destination report</p>
          <Title className="shout">
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
          </Title>
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
            <a
              className="button primary"
              href={`#${prefix}-${Demo ? 'demo' : 'built'}`}
              onClick={(event) => jumpTo(event, `${prefix}-${Demo ? 'demo' : 'built'}`)}
            >
              [ {Demo ? '▶ try the sample' : '↓ explore the build'} ]
            </a>
            {heroScreen && (
              <button onClick={() => setGallery(0)}>
                [ ⤢ {screens.length} {screens.length === 1 ? 'screen' : 'screens'} ]
              </button>
            )}
          </div>
        </div>
        <figure className={`project-visual${project.video ? ' video' : isPortraitScreen(project, heroScreen) ? ' portrait' : ''}`}>
          {project.video ? (
            <>
              <ProjectVideo project={project} />
              <figcaption className="hero-caption">
                <span>{project.video.duration}s · product walkthrough with sample data</span>
                {heroScreen && (
                  <button type="button" className="link" onClick={() => setGallery(0)}>
                    open gallery ↗
                  </button>
                )}
              </figcaption>
            </>
          ) : heroScreen ? (
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

      <section className="project-section" aria-labelledby={`${prefix}-summary`}>
        <SectionTitle id={`${prefix}-summary`}>What it is</SectionTitle>
        <p className="project-summary">{project.summary}</p>
      </section>
      {Demo && (
        <section className="project-section" id={`${prefix}-demo`} aria-labelledby={`${prefix}-demo-heading`}>
          <SectionTitle id={`${prefix}-demo-heading`}>Try it</SectionTitle>
          <div className="scene">
            <Demo detail />
          </div>
        </section>
      )}
      {project.why && (
        <section className="project-section" aria-labelledby={`${prefix}-why`}>
          <SectionTitle id={`${prefix}-why`}>Why I built it</SectionTitle>
          <p className="project-summary">{project.why}</p>
        </section>
      )}
      <section className="project-section" id={`${prefix}-built`} aria-labelledby={`${prefix}-built-heading`}>
        <div className="project-section-heading">
          <SectionTitle id={`${prefix}-built-heading`}>What I built</SectionTitle>
          <span className="dim">pick a contribution to explore</span>
        </div>
        <FeatureTour project={project} onOpen={setGallery} detailId={`${prefix}-feature-detail`} />
      </section>
      <section className="project-section project-standing" aria-labelledby={`${prefix}-standing-heading`}>
        <SectionTitle id={`${prefix}-standing-heading`}>Where it stands</SectionTitle>
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
    </article>
  );
}
