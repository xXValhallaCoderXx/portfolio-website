import { useCallback, useEffect, useState } from 'react';
import Fjord from './components/Fjord.jsx';
import { Section } from './components/Sections.jsx';
import { PROFILE, SECTIONS, STATS } from './content.js';
import { ACHIEVEMENTS, beltFor, readProgress } from './game/achievements.js';

const FLY = '/fly';
const isFlightAddress = () => location.pathname.replace(/\/$/, '') === FLY;

function readCrt() {
  try {
    return localStorage.getItem('crt') === 'on';
  } catch {
    return false;
  }
}

export default function App() {
  // `armed` records that the visitor has clicked something, which browsers require before sound can play.
  const [flight, setFlight] = useState(() => ({ on: isFlightAddress(), target: null, armed: false }));
  const [progress, setProgress] = useState(readProgress);
  const [crt, setCrt] = useState(readCrt);

  const takeFlight = useCallback((target = null) => {
    if (!isFlightAddress()) history.pushState({ flight: true }, '', FLY);
    setFlight({ on: true, target, armed: true });
  }, []);

  // Leaving puts the visitor back on the page: at the section for the place they last landed at,
  // or otherwise wherever they were when they took off.
  const leaveFlight = useCallback((sectionId) => {
    if (history.state?.flight) history.back();
    else history.replaceState(null, '', '/');
    setFlight({ on: false, target: null, armed: false });
    // Going back makes the browser restore its own scroll position first; let it finish.
    if (sectionId) setTimeout(() => document.getElementById(sectionId)?.scrollIntoView(), 80);
  }, []);

  useEffect(() => {
    // The browser's back and forward buttons enter and leave the flight too.
    const sync = () => setFlight((current) => (isFlightAddress() ? { ...current, on: true } : { on: false, target: null, armed: false }));
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);

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
            <span className="dim">user@{PROFILE.host}: ~/portfolio — zsh</span>
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
          onArm={() => setFlight((current) => ({ ...current, armed: true }))}
          onExit={leaveFlight}
          onProgress={setProgress}
        />
        {!flight.on && (
          <div className="hero-copy">
            <p className="dim">$ whoami</p>
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

      <main>
        <section className="row stats">
          <div className="prompt">
            <p>$ neofetch</p>
          </div>
          <dl>
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {SECTIONS.map((section) => (
          <Section section={section} onFly={takeFlight} key={section.id} />
        ))}
      </main>

      <footer className="footer">
        <span>© {new Date().getFullYear()} {PROFILE.host} — all rights reserved</span>
        <span className="exit-code">process exited with code 0</span>
      </footer>
    </>
  );
}
