import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Fjord from './components/Fjord.jsx';
import { OpenExperience } from './components/Experience.jsx';
import ExperiencePage from './components/ExperiencePage.jsx';
import Topbar from './components/Topbar.jsx';
import ProjectPage from './components/ProjectPage.jsx';
import Route from './components/Route.jsx';
import { OpenProject } from './components/Sections.jsx';
import Warp from './components/Warp.jsx';
import { EXPERIENCE, PROFILE, PROJECTS } from './content.js';
import { readProgress } from './game/achievements.js';
import { gameHref, readGameAddress } from './game/good-lift-address.js';
import { pauseProjectVideos } from './projectMedia.js';

const FLY = '/fly';
const isFlyAddress = () => location.pathname.replace(/\/$/, '') === FLY;
// Good Lift's own addresses, beyond the arch (good-lift-address.js): what they ask for, or null.
const gameAddress = () => readGameAddress(location);
// The flight's addresses: the fjord's and the game's.
const isFlightAddress = () => isFlyAddress() || !!gameAddress();
// Both reading routes share history and the same way back to the main page.
const detailAddress = () => {
  const [, section, id] = location.pathname.match(/^\/(projects|experience)\/([^/]+)\/?$/) ?? [];
  const item = section === 'projects'
    ? PROJECTS.find((candidate) => candidate.id === id)
    : EXPERIENCE.find((candidate) => candidate.hash === id);
  return item ? { section, item, path: section === 'projects' ? item.path : `experience.log/${id}` } : null;
};
// Any other address that is neither the page nor the flight is a missing page. It gets its own flight.
const missingAddress = () => {
  const path = location.pathname.replace(/\/$/, '');
  return path === '' || path === FLY || path === '/index.html' || detailAddress() || gameAddress() ? null : location.pathname;
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
  const [detail, setDetail] = useState(detailAddress);
  const project = detail?.section === 'projects' ? detail.item : null;
  const experience = detail?.section === 'experience' ? detail.item : null;
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
  // The original reading position is carried across successive detail pages and reloads.
  const homeReturn = useRef(null);
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
        if (!isFlightAddress()) {
          history.replaceState({ ...history.state, scroll: scrollY }, '');
          history.pushState({ flight: true, home: missingAddress() ? 0 : backToPage() + 1 }, '', FLY);
        }
        setDetail(null);
        setFlight({ on: true, target, armed: true, lost: null, game: gameAddress() });
      }),
    [transition],
  );

  // A landing opens its section on the main page, including when take-off was from a detail
  // page. Leaving in the air returns to the page the visitor took off from.
  const leaveFlight = useCallback(
    (sectionId) =>
      transition(() => {
        const steps = backToPage();
        if (sectionId) {
          wanted.current = sectionId;
          history.pushState(null, '', `/#${sectionId}`);
          setDetail(null);
        } else if (steps) history.go(-steps);
        else history.replaceState(null, '', '/');
        setFlight({ on: false, target: null, armed: false, lost: null, game: null });
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
        setDetail(null);
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

  const openDetail = useCallback((section, id, view) => {
    const href = `/${section}/${id}`;
    let returnTo = history.state?.returnTo ?? homeReturn.current;
    if (!detailAddress()) {
      returnTo = { scroll: scrollY, focus: href, href: location.pathname + location.hash,
        experience: section === 'experience' ? id : history.state?.experience,
        experienceView: section === 'experience' ? view : history.state?.experienceView };
      history.replaceState({ ...history.state, ...returnTo }, '');
    }
    homeReturn.current = returnTo;
    history.pushState({ detail: section, id, returnTo }, '', href);
    setDetail(detailAddress());
  }, []);
  const openProject = useCallback((id) => openDetail('projects', id), [openDetail]);
  const openExperience = useCallback((id, view) => openDetail('experience', id, view), [openDetail]);

  const closeDetail = useCallback((sectionId = null) => {
    const section = detailAddress()?.section ?? 'projects';
    const returnTo = history.state?.returnTo ?? homeReturn.current;
    wanted.current = sectionId ?? (returnTo ? null : section);
    const href = sectionId ? `/#${sectionId}` : returnTo?.href ?? `/#${section}`;
    history.pushState(returnTo ? { ...returnTo } : null, '', href);
    setDetail(null);
  }, []);

  const shown = useRef({ detail, flight: flight.on });
  useLayoutEffect(() => {
    const previous = shown.current;
    if (previous.detail?.path === detail?.path && previous.flight === flight.on) return;
    shown.current = { detail, flight: flight.on };
    if (flight.on) return;
    if (detail) {
      scrollTo({ top: previous.flight ? history.state?.scroll ?? 0 : 0, behavior: 'instant' });
      const heading = document.querySelector('main [data-detail-heading], main.project-page h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      return;
    }
    const requested = wanted.current;
    const section = requested ?? (history.state?.scroll == null ? previous.detail?.section : null);
    wanted.current = null;
    const restore = () => {
      if (section) {
        document.getElementById(section)?.scrollIntoView({ behavior: 'instant' });
        const heading = document.getElementById(`${section}-title`);
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
      } else if (history.state?.scroll != null) {
        scrollTo({ top: history.state.scroll, behavior: 'instant' });
        if (previous.detail) {
          const trigger = [...document.querySelectorAll('a[href]')].find((link) =>
            link.getAttribute('href') === history.state.focus && link.getClientRects().length > 0);
          trigger?.focus({ preventScroll: true });
        }
      }
    };
    restore();
    // On a reloaded detail page the hidden overview has not measured its width yet. Let its
    // ResizeObserver switch layouts before restoring the final card position and focus.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(restore); });
    return () => cancelAnimationFrame(frame);
  }, [detail, flight.on]);

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
        setDetail(detailAddress());
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
  }, [detail, flight.on, building]);

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
        <Topbar detail={detail} hud={hud} progress={progress} crt={crt} onCrt={() => setCrt(!crt)}
          onSection={closeDetail} onFly={takeFlight} />
      )}

      <div hidden={!!detail && !flight.on}>
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
            </div>
          )}
        </header>

        <OpenProject.Provider value={openProject}>
          <OpenExperience.Provider value={openExperience}>
            <Route onFly={takeFlight} hud={hud} />
          </OpenExperience.Provider>
        </OpenProject.Provider>
      </div>

      {project && !flight.on && <ProjectPage key={project.id} project={project} onBack={() => closeDetail()} onOpen={openProject} />}
      {experience && !flight.on && <ExperiencePage key={experience.hash} entry={experience} onBack={() => closeDetail()} />}

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
