import { useCallback, useEffect, useRef, useState } from 'react';
import type { FjordProps } from '../components/Fjord.tsx';
import type { SectionId } from '../../../domains/portfolio/portfolio.types.ts';
import type { createGame } from '../services/flight-session.service.ts';
import type { RunResult, BotResult, WorldResult, ResolvedSky } from '../../good-lift/good-lift.models.ts';
import type { FlightPanel } from '../flight.models.ts';
import type { LessonId } from '../../../domains/good-lift/trick-lessons.ts';
type FlightEngine = ReturnType<typeof createGame>;

// The live backdrop is only worth its download where it will run well and is wanted.
const wantsBackdrop = () =>
  !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(pointer: coarse)').matches && innerWidth >= 760;

/** React lifecycle owns subscriptions and stale-load cancellation; engine services own flight. */
export function useFjordFlight({ flying, armed, target, lost, game: address, warping, onArm, onExit, onPortal, onFjord, onProgress, sectionBodies }: FjordProps) {
  const stage = useRef<HTMLDivElement>(null);
  const game = useRef<FlightEngine | null>(null);
  const loading = useRef<Promise<FlightEngine | null> | null>(null);
  const engineLoadFailed = useRef(false);
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
  // The sole launch screen: loading, ready, failed, or absent while the run is in progress.
  const [sky, setSky] = useState('');
  const [preparedSky, setPreparedSky] = useState<ResolvedSky | null>(null);
  const skyRequest = useRef(0);
  // Visitors who ask for reduced motion get the missing page's text and links without the fall.
  const [lostStage, setLostStage] = useState(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'still' : 'gliding'));

  // The game keeps one set of callbacks for its whole life, so they read the latest props from here.
  const latest = useRef({ onArm, onExit, onProgress, onPortal, onFjord });
  latest.current = { onArm, onExit, onProgress, onPortal, onFjord };

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
        onPortal: address => latest.current.onPortal(address),
        onFjord: () => latest.current.onFjord(),
        onPanel: (next) => {
          if (next && sectionBodies[next.id]) lastPlace.current = next.id as SectionId;
          setPanel(next);
        },
      });
      engineLoadFailed.current = false;
      setLive(true);
      return game.current;
    }).catch(error => {
      if (mine === mount.current) engineLoadFailed.current = true;
      throw error;
    });
    return loading.current;
  }, []);

  useEffect(() => {
    if (wantsBackdrop()) void load().catch(() => { /* An optional backdrop can remain still. */ });
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

  // Good Lift has one ready screen on every entry. Loading/verifying a sky is separate from
  // starting a run; even a previously armed visitor explicitly chooses Fly on a newly entered sky.
  useEffect(() => {
    if (!flying || lost || !address) return undefined;
    const request = ++skyRequest.current;
    setPreparedSky(null);
    setSky('loading');
    load().then(ready => request === skyRequest.current ? ready?.prepareSky(address) : null).then(found => {
      if (request !== skyRequest.current) return;
      setPreparedSky(found ?? null);
      setSky(found ? 'ready' : '');
    }, () => { if (request === skyRequest.current) setSky('failed'); });
    return () => {
      skyRequest.current += 1;
      game.current?.cancelPreparedSky();
    };
  }, [flying, lost, address, load]);

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
      if (lostStage !== 'still') void load().then((ready) => current && !skipped.current && ready?.lost(), () => current && setLostStage('still'));
      return () => {
        current = false;
      };
    }
    // Good Lift's handled preparation effect owns its load and failure state.
    if (address) return undefined;
    load().then((ready) => {
      if (!current || !armed || !ready) return;
      setSky('');
      ready.fly(target);
    }, () => { /* The fjord remains behind its start screen if its engine could not load. */ });
    return () => {
      current = false;
    };
    // `lostStage` is left out on purpose: it changes as the emergency plays and must not restart it.
  }, [flying, armed, target, lost, address, load]);

  const startSky = (key?: string, lesson?: LessonId) => {
    if (!preparedSky || !game.current?.startPreparedSky(key, preparedSky, lesson)) return;
    setSky('');
    setPreparedSky(null);
    latest.current.onArm();
  };
  const retrySky = () => {
    if (!address) return;
    if (engineLoadFailed.current || game.current?.skyNeedsReload) {
      // A failed module fetch is cached by the browser. Keep the URL and request fresh resources;
      // this screen has not started a run or earned anything that needs to survive the reload.
      window.location.reload();
      return;
    }
    const request = ++skyRequest.current;
    setPreparedSky(null); setSky('loading');
    void load().then(ready => request === skyRequest.current ? ready?.prepareSky(address) : null).then(found => {
      if (request !== skyRequest.current) return;
      setPreparedSky(found ?? null); setSky(found ? 'ready' : '');
    }, () => { if (request === skyRequest.current) setSky('failed'); });
  };
  const skipMissingPage = () => { skipped.current = true; if (game.current) game.current.skipLost(); else setLostStage('skipped'); };
  const retryMissingPage = () => { skipped.current = false; void load().then(ready => ready?.lost()); };
  return { stage, game, live, panel, result, music, bots, world, sky, preparedSky, startSky, lostStage, retrySky, skipMissingPage, retryMissingPage };
}
