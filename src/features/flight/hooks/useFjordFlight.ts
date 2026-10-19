import { useCallback, useEffect, useRef, useState } from 'react';
import type { FjordProps } from '../components/Fjord.tsx';
import type { SectionId } from '../../../domains/portfolio/portfolio.types.ts';
import type { createGame } from '../services/flight-session.service.ts';
import type { RunResult, BotResult, WorldResult, ChallengeOutcome } from '../../good-lift/good-lift.models.ts';
import type { FlightPanel } from '../flight.models.ts';
type FlightEngine = ReturnType<typeof createGame>;

// The live backdrop is only worth its download where it will run well and is wanted.
const wantsBackdrop = () =>
  !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(pointer: coarse)').matches && innerWidth >= 760;

/** React lifecycle owns subscriptions and stale-load cancellation; engine services own flight. */
export function useFjordFlight({ flying, armed, target, lost, game: address, warping, onExit, onPortal, onFjord, onProgress, sectionBodies }: FjordProps) {
  const stage = useRef<HTMLDivElement>(null);
  const game = useRef<FlightEngine | null>(null);
  const loading = useRef<Promise<FlightEngine | null> | null>(null);
  const mount = useRef(0);
  const lastPlace = useRef<SectionId | null>(null);
  const skipped = useRef(false); // the visitor skipped the missing page's cutscene before it could start
  const [live, setLive] = useState(false);
  const [panel, setPanel] = useState<FlightPanel | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  // Good Lift's music switch as last thrown, anywhere (null until it is), for the meet sheet's own.
  const [music, setMusic] = useState<boolean | null>(null);
  // What the bots came to on the sky the meet sheet shows, once they land (null until they do). It
  // comes apart from the result, so the sheet takes it in without taking the focus back.
  const [bots, setBots] = useState<BotResult | null>(null);
  // The world board's word on the Daily Sky the meet sheet shows, once it answers (null until it
  // does, and for good when the build names no world board); apart from the result, as the bots are.
  const [world, setWorld] = useState<WorldResult | null>(null);
  // Whether the game beyond the arch is still on its way ('loading') or would not come ('failed').
  const [sky, setSky] = useState('');
  // A challenge link's run to beat, once read and replayed: { who, total, score, peak } or { error }.
  const [rival, setRival] = useState<ChallengeOutcome | null>(null);
  // Visitors who ask for reduced motion get the missing page's text and links without the fall.
  const [lostStage, setLostStage] = useState(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'gliding'));

  // The game keeps one set of callbacks for its whole life, so they read the latest props from here.
  const latest = useRef({ onExit, onProgress, onPortal, onFjord });
  latest.current = { onExit, onProgress, onPortal, onFjord };

  const load = useCallback(() => {
    const mine = mount.current;
    loading.current ??= import('../services/flight-session.service.ts').then(({ createGame }) => {
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
          if (next && sectionBodies[next.id]) lastPlace.current = next.id as SectionId;
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
    if (stage.current) seen.observe(stage.current);
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
      const gone = Math.min(1, scrollY / Math.max(1, stage.current!.offsetHeight));
      game.current?.rise(gone);
      stage.current!.style.setProperty('--gone', gone.toFixed(3));
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

  const retrySky = () => { if (address) void game.current?.play(address).then(() => setSky(''), () => setSky('failed')); };
  const skipMissingPage = () => { skipped.current = true; if (game.current) game.current.skipLost(); else setLostStage('skipped'); };
  const retryMissingPage = () => { skipped.current = false; void load().then(ready => ready?.lost()); };
  return { stage, game, live, panel, result, music, bots, world, sky, rival, lostStage, retrySky, skipMissingPage, retryMissingPage };
}
