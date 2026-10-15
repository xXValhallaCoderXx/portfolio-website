import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUGH_LANDINGS, SECTIONS } from '../content.js';
import { dailyNumber, dayOf } from '../game/good-lift-address.js';
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

/** What a landing shows: the matching page section, or a short note for a landing anywhere else. */
function LandingPanel({ panel, onTakeOff, onNext, onMap, onOpenPage }) {
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
 * missing page; it plays the emergency instead of a flight. `game` is a Good Lift address (see
 * good-lift-address.js): the game beyond the arch is played on the sky it asks for. Flying through
 * the arch asks the page for it with `onPortal`, and `onFjord` asks to leave it for the fjord.
 */
export default function Fjord({ flying, armed, target, lost, game: address, warping, onArm, onExit, onFly, onPortal, onFjord, onProgress }) {
  const stage = useRef(null);
  const game = useRef(null);
  const loading = useRef(null);
  const mount = useRef(0);
  const lastPlace = useRef(null);
  const skipped = useRef(false); // the visitor skipped the missing page's cutscene before it could start
  const [live, setLive] = useState(false);
  const [panel, setPanel] = useState(null);
  const [result, setResult] = useState(null);
  // Good Lift's music switch as last thrown, anywhere (null until it is), for the meet sheet's own.
  const [music, setMusic] = useState(null);
  // What the bots came to on the sky the meet sheet shows, once they land (null until they do). It
  // comes apart from the result, so the sheet takes it in without taking the focus back.
  const [bots, setBots] = useState(null);
  // The world board's word on the Daily Sky the meet sheet shows, once it answers (null until it
  // does, and for good when the build names no world board); apart from the result, as the bots are.
  const [world, setWorld] = useState(null);
  // Whether the game beyond the arch is still on its way ('loading') or would not come ('failed').
  const [sky, setSky] = useState('');
  // A challenge link's run to beat, once read and replayed: { who, total, peak } or { error }.
  const [rival, setRival] = useState(null);
  // Visitors who ask for reduced motion get the missing page's text and links without the fall.
  const [lostStage, setLostStage] = useState(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'gliding'));

  // The game keeps one set of callbacks for its whole life, so they read the latest props from here.
  const latest = useRef({});
  latest.current = { onExit, onProgress, onPortal, onFjord };

  const load = useCallback(() => {
    const mine = mount.current;
    loading.current ??= import('../game/game.js').then(({ createGame }) => {
      if (mine !== mount.current || !stage.current) return null;
      game.current = createGame(stage.current, {
        onExit: () => latest.current.onExit(lastPlace.current),
        onProgress: (progress) => latest.current.onProgress(progress),
        onLost: setLostStage,
        onResult: setResult,
        onMusic: setMusic,
        onBots: setBots,
        onWorld: setWorld,
        onPortal: () => latest.current.onPortal(),
        onFjord: () => latest.current.onFjord(),
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

  // A challenge link is replayed before its start screen asks for the click, so the run to beat it
  // shows is what its controls truly come to, never what the link claims.
  useEffect(() => {
    setRival(null);
    if (!flying || !live || address?.kind !== 'vs') return undefined;
    let current = true;
    game.current?.challenge(address).then(
      (found) => current && setRival(found),
      () => current && setRival({ error: 'load' }),
    );
    return () => {
      current = false;
    };
  }, [flying, live, address]);

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
      setResult(null);
      setBots(null);
      setWorld(null);
      setSky('');
      lastPlace.current = null;
      return;
    }
    // The engine can arrive after the visitor has moved on (Back, on a slow phone): only the
    // latest wish is acted on.
    let current = true;
    if (lost) {
      if (lostStage !== 'still') load().then((ready) => current && !skipped.current && ready?.lost());
      return () => {
        current = false;
      };
    }
    load().then((ready) => {
      if (!current || !armed || !ready) return;
      if (!address) {
        setSky('');
        ready.fly(target);
        return;
      }
      setSky('loading');
      ready.play(address).then(
        () => current && setSky(''),
        () => current && setSky('failed'),
      );
    });
    return () => {
      current = false;
    };
    // `lostStage` is left out on purpose: it changes as the emergency plays and must not restart it.
  }, [flying, armed, target, lost, address, load]);

  // The meet sheet comes with the game beyond the arch, never with the page: a run's result is
  // only ever shown once the game has loaded it.
  const MeetSheet = result ? game.current?.meetSheet : null;
  return (
    <div className={`fjord${flying ? ' flying' : ''}${live ? ' live' : ''}${flying && panel ? ' reading' : ''}`}>
      <div className="fjord-stage" ref={stage} />
      {flying && !live && !lost && <p className="fjord-note">loading the fjord…</p>}
      {flying && live && address && sky === 'loading' && <p className="fjord-note">loading the sky…</p>}
      {flying && live && address && sky === 'failed' && (
        <div className="fjord-start">
          <p className="dim">$ ./good-lift.sh</p>
          <p>// the sky beyond the arch did not load.</p>
          <p>
            <button className="primary" onClick={() => game.current?.play(address).then(() => setSky(''), () => setSky('failed'))}>
              [ try again ]
            </button>{' '}
            <button onClick={() => onFjord()}>[ back to the fjord ]</button>
          </p>
        </div>
      )}
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
      {flying && live && !armed && !lost && address && (
        <div className="fjord-start">
          <p className="dim">
            $ ./good-lift.sh{' '}
            {address.kind === 'practice'
              ? '--practice'
              : address.kind === 'vs'
                ? '--race'
                : address.kind === 'sky'
                  ? `--sky ${(address.sky >>> 0).toString(16).padStart(8, '0')}`
                  : '--daily'}
          </p>
          <h2 className="shout">
            <span>&gt;</span> GOOD_LIFT
          </h2>
          <p>
            // A powerlifting meet in the sky{address.kind === 'daily' ? ` · Daily #${dailyNumber(dayOf())}` : ''}. Climb through a line
            every 250 m, where three judges light the lift. Dodge Hrungnir's kettlebells and outclimb the fog.
          </p>
          {address.bad && <p className="dim">// that sky could not be read, so here is today's.</p>}
          {address.kind === 'vs' &&
            (!rival ? (
              <p className="dim">// reading the challenge…</p>
            ) : rival.error ? (
              <p className="dim">
                // {rival.error === 'version' ? 'that challenge was flown under older rules' : 'that challenge could not be read'}, so here is today's sky.
              </p>
            ) : (
              <p>
                // to beat: {rival.who || 'a pilot'} · {rival.total.toLocaleString('en-GB', { maximumFractionDigits: 1 })} kg ·{' '}
                {rival.peak.toLocaleString('en-GB')} m · verified
              </p>
            ))}
          <p>
            <button className="primary" onClick={onArm}>
              [ <span className="for-keys">click</span>
              <span className="for-touch">tap</span> to start ]
            </button>{' '}
            <button onClick={() => onExit(null)}>[ back to the page ]</button>
          </p>
          <p className="dim for-keys">← → steer · space brake · ↑ (or ← and → together) speed bar · e big ears · esc end run · r again · b music</p>
          <p className="dim for-touch">◀ ▶ steer · ▼ brake · ◀ and ▶ together for the speed bar · ▼ ▼ together for big ears</p>
        </div>
      )}
      {flying && live && !armed && !lost && !address && (
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
          <p className="dim for-keys">← → steer · space brake · shift speed up · click a pillar to fly there · m map · h controls</p>
          <p className="dim for-touch">◀ ▶ steer · ▼ brake · » speed up · tap a lit pillar to fly there</p>
        </div>
      )}
      {flying && panel && (
        <LandingPanel
          panel={panel}
          onTakeOff={() => game.current.takeOff()}
          onNext={() => game.current.flyToNext()}
          onMap={() => game.current.openMap()}
          onOpenPage={() => onExit(panel.id)}
        />
      )}
      {flying && !panel && result && MeetSheet && (
        <MeetSheet
          result={result}
          onRetry={() => game.current?.retryCloudbase()}
          onSky={(kind) => onPortal({ kind, sky: null, vs: null, bad: null })}
          onFjord={() => onFjord()}
          onPage={() => onExit(null)}
          onInitials={(text) => game.current?.setInitials(text)}
          music={music}
          onMusic={() => game.current?.toggleMusic()}
          bots={bots}
          world={world}
          onWithdraw={() => game.current?.removeWorldRun()}
          onKit={(choice) => game.current?.setKit(choice)}
        />
      )}
    </div>
  );
}
