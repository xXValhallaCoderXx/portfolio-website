import { useCallback, useEffect, useRef, useState } from 'react';
import Fjord from './components/Fjord.jsx';
import Warp from './components/Warp.jsx';
import Panes from './components/Panes.jsx';
import { PROFILE, SECTIONS } from './content.js';
import { ACHIEVEMENTS, beltFor, readProgress } from './game/achievements.js';

const FLY = '/fly';
const isFlightAddress = () => location.pathname.replace(/\/$/, '') === FLY;
// Any address that is neither the page nor the flight is a missing page. It gets its own flight.
const missingAddress = () => {
  const path = location.pathname.replace(/\/$/, '');
  return path === '' || path === FLY || path === '/index.html' ? null : location.pathname;
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
  const [progress, setProgress] = useState(readProgress);
  const [crt, setCrt] = useState(readCrt);
  // The warp that covers the swap between the page and the flight: `swap` runs at its midpoint.
  const [warp, setWarp] = useState(null);
  const warping = useRef(false);

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

  useEffect(() => {
    // The browser's back and forward buttons enter and leave the flight too.
    const sync = () =>
      transition(() =>
        setFlight((current) =>
          isFlightAddress()
            ? { ...current, on: true, lost: null }
            : { on: !!missingAddress(), target: null, armed: false, lost: missingAddress() },
        ),
      );
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, [transition]);

  // While the warp builds, the page's own content pulls away toward the viewer.
  const building = !!warp && !warp.crossed;
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
            {SECTIONS.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.file}
              </a>
            ))}
            <button className="tab-fly" onClick={() => takeFlight()}>
              fly.sh
            </button>
          </div>
        </nav>
      )}

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
            <h1 className="shout">
              {PROFILE.headline.map((line) => (
                <span className="line" key={line}>
                  <span>&gt;</span> {line}
                </span>
              ))}
            </h1>
            <p className="intro">// {PROFILE.intro}</p>
            <p className="actions">
              <button className="primary" onClick={() => takeFlight()}>
                [ ./fly.sh ]
              </button>
              <a className="button" href="#projects">
                [ ./view_work.sh ]
              </a>
              <a className="button" href="#contact">
                [ ./contact.sh ]
              </a>
            </p>
            <p className="dim hero-hint">fly.sh: steer a paraglider over the fjord and land where you want to read. Or just scroll.</p>
          </div>
        )}
      </header>

      <Panes onFly={takeFlight} />

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
