import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Fjord from './components/Fjord.jsx';
import ProjectPage from './components/ProjectPage.jsx';
import Route from './components/Route.jsx';
import { OpenProject } from './components/Sections.jsx';
import Warp from './components/Warp.jsx';
import { PROFILE, PROJECTS, ROUTE } from './content.js';
import { ACHIEVEMENTS, beltFor, readProgress } from './game/achievements.js';
import { pauseProjectVideos } from './projectMedia.js';

const FLY = '/fly';
const isFlightAddress = () => location.pathname.replace(/\/$/, '') === FLY;
// The project whose own page the address names, if it names one.
const projectAddress = () => {
  const id = location.pathname.match(/^\/projects\/([^/]+)\/?$/)?.[1];
  return PROJECTS.find((project) => project.id === id) ?? null;
};
// Any other address that is neither the page nor the flight is a missing page. It gets its own flight.
const missingAddress = () => {
  const path = location.pathname.replace(/\/$/, '');
  return path === '' || path === FLY || path === '/index.html' || projectAddress() ? null : location.pathname;
};

function readCrt() {
  try {
    return localStorage.getItem('crt') === 'on';
  } catch {
    return false;
  }
}

export default function App() {
  // `armed` records that the visitor has clicked something, which browsers require before sound can play.
  // `lost` holds the address of a missing page while its emergency plays.
  const [flight, setFlight] = useState(() => ({
    on: isFlightAddress() || !!missingAddress(),
    target: null,
    armed: false,
    lost: missingAddress(),
  }));
  // The project whose page is open in place of the main page, if any.
  const [project, setProject] = useState(projectAddress);
  const [progress, setProgress] = useState(readProgress);
  const [crt, setCrt] = useState(readCrt);
  // The warp that covers the swap between the page and the flight: `swap` runs at its midpoint.
  const [warp, setWarp] = useState(null);
  const warping = useRef(false);
  const flying = useRef(flight.on);
  flying.current = flight.on;
  const hud = useRef(null);
  // Where the main page was scrolled to when a project was opened, and the section to show on return.
  const homeScroll = useRef(null);
  const wanted = useRef(null);

  // Swaps the page and the flight behind a warp. If one is already playing, or the visitor has
  // asked for reduced motion, the swap happens at once instead.
  const transition = useCallback((swap) => {
    if (warping.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
    warping.current = true;
    setWarp({ swap, crossed: false });
  }, []);

  const takeFlight = useCallback(
    (target = null) =>
      transition(() => {
        if (!isFlightAddress()) history.pushState({ flight: true }, '', FLY);
        setProject(null);
        setFlight({ on: true, target, armed: true, lost: null });
      }),
    [transition],
  );

  // Leaving puts the visitor back on the page: at the section for the place they last landed at,
  // or otherwise wherever they were when they took off.
  const leaveFlight = useCallback(
    (sectionId) =>
      transition(() => {
        if (history.state?.flight) history.back();
        else history.replaceState(null, '', '/');
        setFlight({ on: false, target: null, armed: false, lost: null });
        // Going back makes the browser restore its own scroll position first; let it finish.
        if (sectionId) setTimeout(() => document.getElementById(sectionId)?.scrollIntoView(), 80);
      }),
    [transition],
  );

  const openProject = useCallback((id) => {
    if (!projectAddress()) {
      homeScroll.current = scrollY;
      history.replaceState({ ...history.state, scroll: scrollY }, '');
    }
    history.pushState({ project: id }, '', `/projects/${id}`);
    setProject(projectAddress());
  }, []);

  // Back to the main page: at `sectionId` if one is asked for, or else where the visitor left it.
  const closeProject = useCallback((sectionId = null) => {
    wanted.current = sectionId;
    history.pushState({ scroll: homeScroll.current }, '', sectionId ? `/#${sectionId}` : '/');
    setProject(null);
  }, []);

  // Swapping pages moves the window with them: a project opens at its top, and the main page
  // comes back where it was left.
  const shown = useRef(project);
  useLayoutEffect(() => {
    if (shown.current === project) return;
    shown.current = project;
    const section = wanted.current ?? (history.state?.scroll == null ? 'projects' : null);
    wanted.current = null;
    if (project) scrollTo({ top: 0, behavior: 'instant' });
    else if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'instant' });
    else scrollTo({ top: history.state.scroll, behavior: 'instant' });
  }, [project]);

  useEffect(() => {
    // The browser's back and forward buttons move between the page, a project and the flight too.
    const sync = () => {
      const apply = () => {
        setProject(projectAddress());
        setFlight((current) =>
          isFlightAddress()
            ? { ...current, on: true, lost: null }
            : { on: !!missingAddress(), target: null, armed: false, lost: missingAddress() },
        );
      };
      // The warp is for crossing between the page and the flight; between pages there is none.
      if (isFlightAddress() !== flying.current) transition(apply);
      else apply();
    };
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, [transition]);

  // While the warp builds, the page's own content pulls away toward the viewer.
  const building = !!warp && !warp.crossed;
  useEffect(() => {
    // The home route stays mounted behind project pages and the flight.
    pauseProjectVideos();
  }, [project, flight.on, building]);

  useEffect(() => {
    document.documentElement.classList.toggle('warping', building);
  }, [building]);

  useEffect(() => {
    document.documentElement.classList.toggle('in-flight', flight.on);
  }, [flight.on]);

  useEffect(() => {
    document.documentElement.classList.toggle('crt', crt);
    try {
      localStorage.setItem('crt', crt ? 'on' : 'off');
    } catch {
      // Storage can be blocked; the choice then lasts for this visit only.
    }
  }, [crt]);

  return (
    <>
      {!flight.on && (
        <nav className="topbar">
          <div className="chrome">
            <i />
            <i />
            <i />
            <span className="dim">
              {PROFILE.user}@{PROFILE.host}: ~/portfolio — zsh
            </span>
            <span className="spacer" />
            {project ? <span className="hud">{project.path}</span> : <span className="hud" ref={hud} />}
            {progress.unlocked.length > 0 && (
              <span className="belt" title="Earned in flight">
                belt: {beltFor(progress)} · {progress.unlocked.length}/{ACHIEVEMENTS.length}
              </span>
            )}
            <button className="link" role="switch" aria-checked={crt} onClick={() => setCrt(!crt)}>
              crt_effects {crt ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="tabs">
            {ROUTE.map((waypoint, i) => (
              <a
                href={`${project ? '/' : ''}#${waypoint.id}`}
                aria-current={project && waypoint.id === 'projects' ? 'page' : undefined}
                onClick={(event) => {
                  // On the main page the link's own address does the work.
                  if (!project) return;
                  event.preventDefault();
                  closeProject(waypoint.id);
                }}
                key={waypoint.id}
              >
                <span className="tab-number">{String(i + 1).padStart(2, '0')}_</span>
                {waypoint.id}
              </a>
            ))}
            <button className="tab-fly" onClick={() => takeFlight()}>
              fly.sh
            </button>
          </div>
        </nav>
      )}

      <div hidden={!!project && !flight.on}>
        <header className="hero">
          <Fjord
            flying={flight.on}
            armed={flight.armed}
            target={flight.target}
            lost={flight.lost}
            warping={building}
            onFly={takeFlight}
            onArm={() => setFlight((current) => ({ ...current, armed: true }))}
            onExit={leaveFlight}
            onProgress={setProgress}
          />
          {!flight.on && (
            <div className="hero-copy">
              <p className="dim">$ whoami</p>
              <p className="who">
                <b>{PROFILE.name}</b> · {PROFILE.role.toLowerCase()}
              </p>
              {/* `--chars` is the longest line with its prompt, so the type can shrink to keep it on one line. */}
              <h1 className="shout" style={{ '--chars': Math.max(...PROFILE.headline.map((line) => line.length)) + 2 }}>
                {PROFILE.headline.map((line) => (
                  <span className="line" key={line}>
                    <span>&gt;</span> {line}
                  </span>
                ))}
              </h1>
              <p className="intro">
                // <span className="long">{PROFILE.intro}</span>
                <span className="short">{PROFILE.introShort}</span>
              </p>
              <p className="actions">
                <button className="primary" onClick={() => takeFlight()}>
                  [ ./fly.sh ]
                </button>
                <a className="button" href="#projects">
                  [ ./view_work.sh ]
                </a>
                <a className="button roomy" href="#contact">
                  [ ./contact.sh ]
                </a>
              </p>
              <p className="dim hero-hint">fly.sh: steer a paraglider over the fjord and land where you want to read</p>
            </div>
          )}
        </header>

        <OpenProject.Provider value={openProject}>
          <Route onFly={takeFlight} hud={hud} />
        </OpenProject.Provider>
      </div>

      {project && !flight.on && <ProjectPage key={project.id} project={project} onBack={() => closeProject()} onOpen={openProject} onFly={takeFlight} />}

      <footer className="footer">
        <span>
          © {new Date().getFullYear()} {PROFILE.name} — all rights reserved
        </span>
        <span className="exit-code">process exited with code 0</span>
      </footer>

      {warp && (
        <Warp
          onMidpoint={() => {
            warp.swap();
            setWarp((current) => current && { ...current, crossed: true });
          }}
          onDone={() => {
            warping.current = false;
            setWarp(null);
          }}
        />
      )}
    </>
  );
}
