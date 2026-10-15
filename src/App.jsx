import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Fjord from './components/Fjord.jsx';
import ProjectPage from './components/ProjectPage.jsx';
import Route from './components/Route.jsx';
import { OpenProject } from './components/Sections.jsx';
import Warp from './components/Warp.jsx';
import { PROFILE, PROJECTS, ROUTE } from './content.js';
import { ACHIEVEMENTS, beltFor, readProgress } from './game/achievements.js';
import { gameHref, readGameAddress } from './game/good-lift-address.js';
import { pauseProjectVideos } from './projectMedia.js';

const FLY = '/fly';
const isFlyAddress = () => location.pathname.replace(/\/$/, '') === FLY;
// Good Lift's own addresses, beyond the arch (good-lift-address.js): what they ask for, or null.
const gameAddress = () => readGameAddress(location);
// The flight's addresses: the fjord's and the game's.
const isFlightAddress = () => isFlyAddress() || !!gameAddress();
// The project whose own page the address names, if it names one.
const projectAddress = () => {
  const id = location.pathname.match(/^\/projects\/([^/]+)\/?$/)?.[1];
  return PROJECTS.find((project) => project.id === id) ?? null;
};
// Any other address that is neither the page nor the flight is a missing page. It gets its own flight.
const missingAddress = () => {
  const path = location.pathname.replace(/\/$/, '');
  return path === '' || path === FLY || path === '/index.html' || projectAddress() || gameAddress() ? null : location.pathname;
};
// How many entries back the page itself lies from this one, or 0 when it is not behind it at all
// (an address opened directly, or reloaded), so leaving must replace the address instead.
const backToPage = () => history.state?.home ?? 0;
// What the arch opens.
const DAILY = { kind: 'daily', sky: null, vs: null, bad: null };

function readCrt() {
  try {
    return localStorage.getItem('crt') === 'on';
  } catch {
    return false;
  }
}

export default function App() {
  // `armed` records that the visitor has clicked something, which browsers require before sound can play.
  // `lost` holds the address of a missing page while its emergency plays, and `game` the Good Lift
  // address being played.
  const [flight, setFlight] = useState(() => ({
    on: isFlightAddress() || !!missingAddress(),
    target: null,
    armed: false,
    lost: missingAddress(),
    game: gameAddress(),
  }));
  // The project whose page is open in place of the main page, if any.
  const [project, setProject] = useState(projectAddress);
  const [progress, setProgress] = useState(readProgress);
  const [crt, setCrt] = useState(readCrt);
  // The warp that covers the swap between the page and the flight: `swap` runs at its midpoint.
  const [warp, setWarp] = useState(null);
  const warping = useRef(false);
  // Each warp is a new one, even when it starts in the very frame the last one ends and React lets
  // the two state changes land together: without its own key the old, finished warp would stay
  // mounted in its place and the new one's swap would never come.
  const warps = useRef(0);
  // The swap the building warp will make at its midpoint. Asked again before then (Back pressed as
  // the warp starts, a second click), the later request replaces it: the last thing asked for wins.
  const pending = useRef(null);
  // Where leaving Good Lift for the fjord should land, while history goes back there.
  const leaving = useRef(null);
  const flying = useRef(flight.on);
  flying.current = flight.on;
  const gaming = useRef(!!flight.game);
  gaming.current = !!flight.game;
  const hud = useRef(null);
  // Where the main page was scrolled to when a project was opened, and the section to show on return.
  const homeScroll = useRef(null);
  const wanted = useRef(null);

  // Swaps the page and the flight behind a warp. If one is already playing, or the visitor has
  // asked for reduced motion, the swap happens at once instead.
  const transition = useCallback((swap) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return swap();
    if (warping.current) {
      if (pending.current) {
        pending.current = swap;
        return undefined;
      }
      // Past the midpoint the swap has been made; this one happens at once, under the falling warp.
      return swap();
    }
    warping.current = true;
    pending.current = swap;
    warps.current += 1;
    setWarp({ crossed: false, id: warps.current });
    return undefined;
  }, []);

  const takeFlight = useCallback(
    (target = null) =>
      transition(() => {
        // A missing page is no page to come back to: leaving puts '/' in place instead.
        if (!isFlightAddress()) history.pushState({ flight: true, home: missingAddress() ? 0 : backToPage() + 1 }, '', FLY);
        setProject(null);
        setFlight({ on: true, target, armed: true, lost: null, game: gameAddress() });
      }),
    [transition],
  );

  // Leaving puts the visitor back on the page: at the section for the place they last landed at,
  // or otherwise wherever they were when they took off.
  const leaveFlight = useCallback(
    (sectionId) =>
      transition(() => {
        const steps = backToPage();
        if (steps) history.go(-steps);
        else history.replaceState(null, '', '/');
        setFlight({ on: false, target: null, armed: false, lost: null, game: null });
        // Going back makes the browser restore its own scroll position first; let it finish.
        if (sectionId) setTimeout(() => document.getElementById(sectionId)?.scrollIntoView(), 80);
      }),
    [transition],
  );

  // Into Good Lift through the warp: the arch opens today's sky. Already in the game, the sky
  // changes in place, so Back still leads out of the game.
  const enterGame = useCallback(
    (address = DAILY) =>
      transition(() => {
        const href = gameHref(address);
        if (gameAddress()) history.replaceState(history.state, '', href);
        else history.pushState({ flight: true, game: true, overFly: isFlyAddress(), home: backToPage() && backToPage() + 1 }, '', href);
        setProject(null);
        // A place the flight was asked to fly to is no part of the game, nor of the fjord after it.
        setFlight((current) => ({ ...current, on: true, armed: true, lost: null, target: null, game: gameAddress() }));
      }),
    [transition],
  );

  // Out of Good Lift, through the warp, to the fjord it was entered from.
  const leaveGame = useCallback(
    () =>
      transition(() => {
        if (history.state?.overFly) {
          // Back to the fjord's own entry, unless it has since been rewritten (see the popstate).
          leaving.current = FLY;
          history.back();
        } else history.replaceState({ flight: true, home: backToPage() }, '', FLY);
        setFlight((current) => ({ ...current, on: true, lost: null, target: null, game: null }));
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
      // Going back from the game to the fjord's entry, if that entry has since become another page
      // (left from a flight opened directly), the fjord is put back in its place.
      if (leaving.current) {
        const wanted = leaving.current;
        leaving.current = null;
        if (location.pathname.replace(/\/$/, '') !== wanted) history.pushState({ flight: true, home: 0 }, '', wanted);
      }
      const apply = () => {
        setProject(projectAddress());
        setFlight((current) =>
          isFlightAddress()
            ? { ...current, on: true, lost: null, game: gameAddress(), target: !!gameAddress() !== !!current.game ? null : current.target }
            : { on: !!missingAddress(), target: null, armed: false, lost: missingAddress(), game: null },
        );
      };
      // The warp is for crossing between the page, the fjord and the game beyond the arch; between
      // pages there is none.
      if (isFlightAddress() !== flying.current || !!gameAddress() !== gaming.current) transition(apply);
      else apply();
    };
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, [transition]);

  // After a deploy, an open page can ask for a chunk that is no longer there: load the same address
  // afresh, once, rather than leave the game half-loaded.
  useEffect(() => {
    const reload = (event) => {
      // Only where the game is being entered: a chunk fetched ahead of the arch can fail quietly,
      // and the crossing asks for it again on the game's own address.
      if (!gameAddress()) return;
      try {
        if (sessionStorage.getItem('reloaded-for') === location.href) return;
        sessionStorage.setItem('reloaded-for', location.href);
      } catch {
        return;
      }
      event.preventDefault();
      location.reload();
    };
    addEventListener('vite:preloadError', reload);
    return () => removeEventListener('vite:preloadError', reload);
  }, []);

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
            game={flight.game}
            warping={building}
            onFly={takeFlight}
            onPortal={enterGame}
            onFjord={leaveGame}
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
          key={warp.id}
          onMidpoint={() => {
            const swap = pending.current;
            pending.current = null;
            swap?.();
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
