import ExternalLink from '../../../components/atoms/ExternalLink.tsx';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { PROJECTS } from '../../../domains/portfolio/content.ts';
import { projectById } from '../../../domains/portfolio/portfolio.service.ts';
import type { Project } from '../../../domains/portfolio/portfolio.types.ts';
import { DEMOS } from './demos/index.ts';
import Sheet from '../../../components/molecules/Sheet.tsx';
import ProjectDetail from './ProjectDetail.tsx';
import ProjectVideo from './ProjectVideo.tsx';

export const OpenProject = createContext<((id: string) => void) | null>(null);

/**
 * A project's card picture, or the short glyph that stands in for it in a list.
 */
function ProjectPicture({ project }: { project: Project }) {
  if (!project.image) return <pre className="diagram">{project.glyph}</pre>;
  return <img src={project.image.src} alt={project.image.alt} loading="lazy" />;
}

function ProjectLinks({ project }: { project: Project }) {
  return project.links.map((link) => (
    <ExternalLink href={link.url} key={link.label}>
      [ {link.label} ↗ ]
    </ExternalLink>
  ));
}

/**
 * A project's playable preview. Where there is room it is simply there; on a phone it waits behind
 * a button, so the page stays short and nothing starts until it is asked for.
 */
function Preview({ project }: { project: Project }) {
  const [shown, setShown] = useState(() => innerWidth >= 760);
  const Demo = project.demo ? DEMOS[project.demo] : null;
  if (!Demo) return null;
  if (!shown) {
    return (
      <button className="try" onClick={() => setShown(true)}>
        [ ▶ try a preview ]
      </button>
    );
  }
  return (
    <div className="scene">
      <Demo compact />
    </div>
  );
}

/** The link that opens a project's report: a real address on the page, a sheet in the flight. */
function Explore({ project, onRead, children }: { project: Project; onRead: (project: Project) => void; children: ReactNode }) {
  const openOnPage = useContext(OpenProject);
  return (
    <a
      className="explore"
      href={`/projects/${project.id}`}
      onClick={(event) => {
        // A click meant for a new tab or window is left to the browser.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        if (openOnPage) openOnPage(project.id);
        else onRead(project);
      }}
    >
      {children}
    </a>
  );
}

export default function ProjectsBody() {
  const [reading, setReading] = useState<Project | null>(null);
  const close = useCallback(() => setReading(null), []);
  const playable = PROJECTS.filter((project) => project.demo);
  const others = PROJECTS.filter((project) => !project.demo);
  return (
    <div className="destinations">
      <div className="playable">
        {playable.map((project, i) => (
          <article className={`destination${i === 0 ? ' featured' : ''}`} key={project.id}>
            <div className="destination-text">
              <p className="dim">
                {project.path} <span className="status">{project.status}</span>
              </p>
              <h3>{project.title}</h3>
              <p>{project.tagline}</p>
            </div>
            {project.video ? <ProjectVideo project={project} /> : <Preview project={project} />}
            {i === 0 && !project.video && (
              <figure className="destination-shot">
                <ProjectPicture project={project} />
              </figure>
            )}
            <p className="links">
              <Explore project={project} onRead={setReading}>
                [ explore project → ]
              </Explore>
              <ProjectLinks project={project} />
            </p>
          </article>
        ))}
      </div>
      <p className="list-label">also on the map</p>
      <ul className="side-quests">
        {others.map((project) => (
          <li key={project.id}>
            <figure>
              <ProjectPicture project={project} />
            </figure>
            <div>
              <p className="dim">
                {project.path} <span className="status">{project.status}</span>
              </p>
              <h3>{project.title}</h3>
              <p>{project.tagline}</p>
              <p className="links">
                <Explore project={project} onRead={setReading}>
                  [ explore project → ]
                </Explore>
                <ProjectLinks project={project} />
              </p>
            </div>
          </li>
        ))}
      </ul>
      {reading && (
        <Sheet
          key={reading.id}
          title={`${reading.path} — destination report`}
          label={reading.title}
          className="project-report-window"
          onClose={close}
        >
          <div className="readme-body project-report-body">
            <ProjectDetail
              project={reading}
              onBack={close}
              onOpen={(id) => setReading(projectById(id))}
              embedded
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}

