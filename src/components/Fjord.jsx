import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUGH_LANDINGS, SECTIONS } from '../content.js';
import { BODIES } from './Sections.jsx';

// The live backdrop is only worth its download where it will run well and is wanted.
const wantsBackdrop = () =>
  !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(pointer: coarse)').matches && innerWidth >= 760;

function LandingScore({ landing }) {
  const [visible, setVisible] = useState(() => landing.expiresAt > Date.now());
  useEffect(() => {
    const remaining = landing.expiresAt - Date.now();
    setVisible(remaining > 0);
    if (remaining <= 0) return undefined;
    const timeout = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timeout);
  }, [landing.expiresAt]);
  if (!visible) return null;
  return (
    <p className="fjord-landing-score" role="status">
      {landing.distance.toFixed(1)} m from centre · {landing.grade} · {landing.points} pts · best {landing.bestDistance.toFixed(1)} m
    </p>
  );
}

const CLOUDBASE_ENDINGS = {
  fog: 'The fog caught up.',
  landing: 'Back on the ground.',
  landed: 'Back on the ground.',
  water: 'Back at sea level.',
  slope: 'Back on the hillside.',
  quit: 'Run ended.',
};

function CloudbaseResult({ result, onRetry, onBack, standalone = false }) {
  const heading = useRef(null);
  useEffect(() => {
    if (standalone) heading.current?.focus();
  }, [result, standalone]);
  const guardKeys = (event) => {
    if (!['KeyR', 'KeyM', 'KeyL'].includes(event.code)) event.stopPropagation();
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      onBack();
    }
  };
  const Tag = standalone ? 'section' : 'div';
  return (
    <Tag
      className={standalone ? 'window fjord-cloudbase-result' : 'fjord-cloudbase-inline'}
      aria-labelledby={standalone ? 'cloudbase-result-heading' : undefined}
      onKeyDown={guardKeys}
      onKeyUp={guardKeys}
    >
      {standalone && (
        <header><i /><i /><i /><span>~/fjord/cloudbase — run complete</span></header>
      )}
      <div className={standalone ? 'fjord-panel-body' : undefined}>
        <h2 className="shout" id={standalone ? 'cloudbase-result-heading' : undefined} ref={heading} tabIndex={standalone ? -1 : undefined}>
          <span>&gt;</span> CLOUDBASE
        </h2>
        <p className="dim">{CLOUDBASE_ENDINGS[result.reason] ?? 'Run complete.'}</p>
        <div role="status">
          <p className="fjord-cloudbase-stats">
            peak <strong>{Math.floor(result.peak).toLocaleString()} m</strong> · personal best {Math.floor(result.best).toLocaleString()} m
          </p>
          <p className="fjord-cloudbase-run">
            {result.strikes ? `${result.strikes} raven strike${result.strikes === 1 ? '' : 's'}` : 'no raven strikes'}
            {result.cloud > 0 && ` · ${result.cloud} s in cloud`}
          </p>
        </div>
        {!standalone && (
          <div className="fjord-cloudbase-actions">
            <button className="primary" onClick={onRetry}>[ fly again ]</button>
            <button onClick={onBack}>[ back to the fjord ]</button>
          </div>
        )}
      </div>
      {standalone && (
        <footer>
          <button className="primary" onClick={onRetry}>[ fly again ]</button>
          <button onClick={onBack}>[ back to the fjord ]</button>
        </footer>
      )}
    </Tag>
  );
}

/** What a landing shows: the matching page section, or a short note for a landing anywhere else. */
function LandingPanel({ panel, cloudbase, onRetryCloudbase, onBackToFjord, onTakeOff, onNext, onMap, onOpenPage }) {
  const section = SECTIONS.find((candidate) => candidate.id === panel.id);
  const Body = BODIES[panel.id];
  return (
    <section className="window fjord-panel">
      <header>
        <i />
        <i />
        <i />
        <span>{panel.path} — zsh</span>
      </header>
      <div className="fjord-panel-body">
        {panel.landing && <LandingScore landing={panel.landing} />}
        {cloudbase && <CloudbaseResult result={cloudbase} onRetry={onRetryCloudbase} onBack={onBackToFjord} />}
        <p className="dim">$ {section ? section.command : 'echo $?'}</p>
        {Body ? (
          <Body />
        ) : (
          <>
            <p>{ROUGH_LANDINGS[panel.id]}</p>
            <p className="dim">// the lit pillars mark the places worth landing at</p>
          </>
        )}
      </div>
      <footer>
        <button onClick={onTakeOff}>
          [ <kbd>space: </kbd>take off ]
        </button>
        {panel.next && (
          <button onClick={onNext}>
            [ <kbd>n: </kbd>fly me to {panel.next.label} ]
          </button>
        )}
        <button onClick={onMap}>
          [ <kbd>m: </kbd>map ]
        </button>
        {section && <button onClick={onOpenPage}>[ open on page ]</button>}
      </footer>
    </section>
  );
}

// What each ending of a missing page says once the visitor is safely down.
const ENDINGS = {
  tree: 'You threw the reserve in time and came down in a tree. Every pilot gets one of those.',
  aboard: 'The reserve stayed in its bag. The fjord is four degrees; the longship crew fished you out.',
  skipped: 'There is nothing at this address.',
  still: 'There is nothing at this address.',
};

/**
 * The missing page. Its text and its way home are plain page content, there from the first moment;
 * the emergency plays behind them, and `stage` is the beat it has reached.
 */
function MissingPage({ path, stage, onThrow, onSkip, onHome, onFly, onRetry }) {
  const ending = ENDINGS[stage];
  return (
    <div className="fjord-lost">
      <p className="dim">$ cd {path}</p>
      <p>zsh: no such file or directory: {path}</p>
      <h2 className="shout">
        <span>&gt;</span> 404_{ending ? 'PAGE_NOT_FOUND' : 'WING_COLLAPSED'}
      </h2>
      {(stage === 'gliding' || stage === 'falling') && (
        <p>
          <button className="primary" onClick={onThrow} disabled={stage !== 'falling'}>
            [ <kbd>r: </kbd>throw reserve ]
          </button>{' '}
          <span className="dim">before 40 m</span>
        </p>
      )}
      {stage === 'late' && <p className="warn">// too low. the reserve would not open in time.</p>}
      {(stage === 'thrown' || stage === 'splash') && <p className="dim">// {stage === 'thrown' ? 'reserve out' : 'splash'}</p>}
      {ending && (
        <>
          <p>// {ending}</p>
          <p className="actions">
            <button className="primary" onClick={() => onHome(null)}>
              [ ~/ home ]
            </button>
            {SECTIONS.map((section) => (
              <button key={section.id} onClick={() => onHome(section.id)}>
                [ {section.file} ]
              </button>
            ))}
            <button onClick={() => onFly()}>[ fly.sh ]</button>
            {stage !== 'still' && <button onClick={onRetry}>[ fall again ]</button>}
          </p>
        </>
      )}
      {!ending && (
        <p className="fjord-lost-skip">
          <button onClick={onSkip}>
            [ <kbd>esc: </kbd>skip ]
          </button>
          <button className="link" onClick={() => onHome(null)}>
            take me home →
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * The fjord. Idle, it is the hero's backdrop; with `flying` it fills the window and the visitor steers.
 * `armed` says the visitor has already clicked something, which browsers require before sound may play;
 * arriving straight at the flight's address shows a start button first. `lost` is the address of a
 * missing page; it plays the emergency instead of a flight.
 */
export default function Fjord({ flying, armed, target, lost, warping, onArm, onExit, onFly, onProgress }) {
  const stage = useRef(null);
  const game = useRef(null);
  const loading = useRef(null);
  const mount = useRef(0);
  const lastPlace = useRef(null);
  const skipped = useRef(false); // the visitor skipped the missing page's cutscene before it could start
  const [live, setLive] = useState(false);
  const [panel, setPanel] = useState(null);
  const [cloudbase, setCloudbase] = useState(null);
  // Visitors who ask for reduced motion get the missing page's text and links without the fall.
  const [lostStage, setLostStage] = useState(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'gliding'));

  // The game keeps one set of callbacks for its whole life, so they read the latest props from here.
  const latest = useRef({});
  latest.current = { onExit, onProgress };

  const load = useCallback(() => {
    const mine = mount.current;
    loading.current ??= import('../game/game.js').then(({ createGame }) => {
      if (mine !== mount.current || !stage.current) return null;
      game.current = createGame(stage.current, {
        onExit: () => latest.current.onExit(lastPlace.current),
        onProgress: (progress) => latest.current.onProgress(progress),
        onLost: setLostStage,
        onCloudbase: setCloudbase,
        onPanel: (next) => {
          if (next && BODIES[next.id]) lastPlace.current = next.id;
          setPanel(next);
        },
      });
      setLive(true);
      return game.current;
    });
    return loading.current;
  }, []);

  useEffect(() => {
    if (wantsBackdrop()) load();
    const seen = new IntersectionObserver(([entry]) => game.current?.setVisible(entry.isIntersecting));
    seen.observe(stage.current);
    return () => {
      mount.current += 1;
      seen.disconnect();
      game.current?.dispose();
      game.current = null;
      loading.current = null;
      setLive(false);
    };
  }, [load]);

  // As the hero scrolls away the backdrop's camera climbs, and the scene itself scrolls at half
  // speed, so the glider stays in view while the fjord below it turns into a map.
  useEffect(() => {
    if (flying || !live) return undefined;
    const follow = () => {
      const gone = Math.min(1, scrollY / Math.max(1, stage.current.offsetHeight));
      game.current?.rise(gone);
      stage.current.style.setProperty('--gone', gone.toFixed(3));
    };
    follow();
    addEventListener('scroll', follow, { passive: true });
    return () => {
      removeEventListener('scroll', follow);
      game.current?.rise(0);
      stage.current?.style.removeProperty('--gone');
    };
  }, [flying, live]);

  // The scene's lens widens as a warp builds and settles once the swap is made.
  const wasWarping = useRef(false);
  useEffect(() => {
    if (warping !== wasWarping.current) game.current?.warp(warping);
    wasWarping.current = warping;
  }, [warping]);

  useEffect(() => {
    if (!flying) {
      game.current?.idle();
      setPanel(null);
      setCloudbase(null);
      lastPlace.current = null;
      return;
    }
    if (lost) {
      if (lostStage !== 'still') load().then((ready) => !skipped.current && ready?.lost());
      return;
    }
    load().then((ready) => armed && ready?.fly(target));
    // `lostStage` is left out on purpose: it changes as the emergency plays and must not restart it.
  }, [flying, armed, target, lost, load]);

  return (
    <div className={`fjord${flying ? ' flying' : ''}${live ? ' live' : ''}${flying && panel ? ' reading' : ''}`}>
      <div className="fjord-stage" ref={stage} />
      {flying && !live && !lost && <p className="fjord-note">loading the fjord…</p>}
      {flying && lost && (
        <MissingPage
          path={lost}
          stage={lostStage}
          onThrow={() => game.current?.throwReserve()}
          onSkip={() => {
            skipped.current = true;
            if (game.current) game.current.skipLost();
            else setLostStage('skipped');
          }}
          onHome={onExit}
          onFly={onFly}
          onRetry={() => {
            skipped.current = false;
            load().then((ready) => ready?.lost());
          }}
        />
      )}
      {flying && live && !armed && !lost && (
        <div className="fjord-start">
          <p className="dim">$ ./fly.sh</p>
          <h2 className="shout">
            <span>&gt;</span> FLY_THE_FJORD
          </h2>
          <p>// Steer a paraglider over the fjord. Land at the lit places to read about me.</p>
          <p>
            <button className="primary" onClick={onArm}>
              [ <span className="for-keys">click</span>
              <span className="for-touch">tap</span> to start ]
            </button>{' '}
            <button onClick={() => onExit(null)}>[ back to the page ]</button>
          </p>
          <p className="dim for-keys">← → steer · space dive · shift speed up · click a pillar to fly there · m map · h controls</p>
          <p className="dim for-touch">◀ ▶ steer · ▼ dive · » speed up · tap a lit pillar to fly there</p>
        </div>
      )}
      {flying && panel && (
        <LandingPanel
          panel={panel}
          cloudbase={cloudbase}
          onRetryCloudbase={() => game.current?.retryCloudbase()}
          onBackToFjord={() => game.current?.backToFjord()}
          onTakeOff={() => game.current.takeOff()}
          onNext={() => game.current.flyToNext()}
          onMap={() => game.current.openMap()}
          onOpenPage={() => onExit(panel.id)}
        />
      )}
      {flying && !panel && cloudbase && (
        <CloudbaseResult
          result={cloudbase}
          standalone
          onRetry={() => game.current?.retryCloudbase()}
          onBack={() => game.current?.backToFjord()}
        />
      )}
    </div>
  );
}
