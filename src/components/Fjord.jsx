import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUGH_LANDINGS, SECTIONS } from '../content.js';
import { BODIES } from './Sections.jsx';

// The live backdrop is only worth its download where it will run well and is wanted.
const wantsBackdrop = () =>
  !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(pointer: coarse)').matches && innerWidth >= 760;

/** What a landing shows: the matching page section, or a short note for a landing anywhere else. */
function LandingPanel({ panel, onTakeOff, onMap, onOpenPage }) {
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
        <button onClick={onTakeOff}>[ space: take off ]</button>
        <button onClick={onMap}>[ m: map ]</button>
        {section && <button onClick={onOpenPage}>[ open on page ]</button>}
      </footer>
    </section>
  );
}

/**
 * The fjord. Idle, it is the hero's backdrop; with `flying` it fills the window and the visitor steers.
 * `armed` says the visitor has already clicked something, which browsers require before sound may play;
 * arriving straight at the flight's address shows a start button first.
 */
export default function Fjord({ flying, armed, target, onArm, onExit, onProgress }) {
  const stage = useRef(null);
  const game = useRef(null);
  const loading = useRef(null);
  const mount = useRef(0);
  const lastPlace = useRef(null);
  const [live, setLive] = useState(false);
  const [panel, setPanel] = useState(null);

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

  useEffect(() => {
    if (!flying) {
      game.current?.idle();
      setPanel(null);
      lastPlace.current = null;
      return;
    }
    load().then((ready) => armed && ready?.fly(target));
  }, [flying, armed, target, load]);

  return (
    <div className={`fjord${flying ? ' flying' : ''}${live ? ' live' : ''}`}>
      <div className="fjord-stage" ref={stage} />
      {flying && !live && <p className="fjord-note">loading the fjord…</p>}
      {flying && live && !armed && (
        <div className="fjord-start">
          <p className="dim">$ ./fly.sh</p>
          <h2 className="shout">
            <span>&gt;</span> FLY_THE_FJORD
          </h2>
          <p>// Steer a paraglider over the fjord. Land at the lit places to read about me.</p>
          <p>
            <button className="primary" onClick={onArm}>
              [ click to start ]
            </button>{' '}
            <button onClick={() => onExit(null)}>[ back to the page ]</button>
          </p>
          <p className="dim">← → steer · ↑ speed · ↓ brake · space dive · m map · r restart · l sound</p>
        </div>
      )}
      {flying && panel && (
        <LandingPanel
          panel={panel}
          onTakeOff={() => game.current.takeOff()}
          onMap={() => game.current.openMap()}
          onOpenPage={() => onExit(panel.id)}
        />
      )}
    </div>
  );
}
