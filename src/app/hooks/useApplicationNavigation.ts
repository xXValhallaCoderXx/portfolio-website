import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readProgress } from '../../adapters/browser/flight-progress.service.ts';
import { pauseProjectVideos } from '../../adapters/browser/media-attention.service.ts';
import type { ExperienceView, SectionId } from '../../domains/portfolio/portfolio.types.ts';
import { createNavigationService, DAILY, type GameAddress } from '../services/navigation.service.ts';

interface FlightViewState { on: boolean; target: string | null; armed: boolean; lost: string | null; game: GameAddress | null }

export function useApplicationNavigation() {
  const [navigation] = useState(() => createNavigationService({ location, history, scroll: () => scrollY }));
  const { isFlightAddress, missingAddress, gameAddress, detailAddress } = navigation;
  // `armed` records that the visitor has clicked something, which browsers require before sound can play.
  // `lost` holds the address of a missing page while its emergency plays, and `game` the Good Lift
  // address being played.
  const [flight, setFlight] = useState<FlightViewState>(() => ({
    on: isFlightAddress() || !!missingAddress(),
    target: null,
    armed: isFlightAddress() && !gameAddress(),
    lost: missingAddress(),
    game: gameAddress(),
  }));
  const [detail, setDetail] = useState(detailAddress);
  const project = detail?.section === 'projects' ? detail.item : null;
  const experience = detail?.section === 'experience' ? detail.item : null;
  const [progress, setProgress] = useState(readProgress);
  // The warp that covers the swap between the page and the flight: `swap` runs at its midpoint.
  const [warp, setWarp] = useState<{ crossed: boolean; id: number } | null>(null);
  const warping = useRef(false);
  // Each warp is a new one, even when it starts in the very frame the last one ends and React lets
  // the two state changes land together: without its own key the old, finished warp would stay
  // mounted in its place and the new one's swap would never come.
  const warps = useRef(0);
  // The swap the building warp will make at its midpoint. Asked again before then (Back pressed as
  // the warp starts, a second click), the later request replaces it: the last thing asked for wins.
  const pending = useRef<(() => void) | null>(null);
  const flying = useRef(flight.on);
  flying.current = flight.on;
  const gaming = useRef(!!flight.game);
  gaming.current = !!flight.game;
  const hud = useRef<HTMLSpanElement>(null);
  // The original reading position is carried across successive detail pages and reloads.
  const wanted = useRef<SectionId | null>(null);

  // Swaps the page and the flight behind a warp. If one is already playing, or the visitor has
  // asked for reduced motion, the swap happens at once instead.
  const transition = useCallback((swap: () => void) => {
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
    (target: string | null = null) =>
      transition(() => {
        navigation.takeFlight();
        setDetail(null);
        setFlight({ on: true, target, armed: true, lost: null, game: gameAddress() });
      }),
    [transition],
  );

  // A landing opens its section on the main page, including when take-off was from a detail
  // page. Leaving in the air returns to the page the visitor took off from.
  const leaveFlight = useCallback(
    (sectionId?: SectionId | null) =>
      transition(() => {
        if (sectionId) { wanted.current = sectionId; setDetail(null); }
        navigation.leaveFlight(sectionId);
        setFlight({ on: false, target: null, armed: false, lost: null, game: null });
      }),
    [transition],
  );

  // Into Good Lift through the warp: the arch opens today's sky. Already in the game, the sky
  // changes in place, so Back still leads out of the game.
  const enterGame = useCallback(
    (address: GameAddress = DAILY) =>
      transition(() => {
        navigation.enterGame(address);
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
        navigation.leaveGame();
        setFlight((current) => ({ ...current, on: true, lost: null, target: null, game: null }));
      }),
    [transition],
  );

  const openProject = useCallback((id: string) => {
    navigation.openDetail('projects', id);
    setDetail(detailAddress());
  }, [navigation, detailAddress]);
  const openExperience = useCallback((id: string, view?: ExperienceView) => {
    navigation.openDetail('experience', id, view);
    setDetail(detailAddress());
  }, [navigation, detailAddress]);
  const closeDetail = useCallback((sectionId: SectionId | null = null) => {
    wanted.current = navigation.closeDetail(sectionId);
    setDetail(null);
  }, [navigation]);

  const shown = useRef({ detail, flight: flight.on });
  useLayoutEffect(() => {
    const previous = shown.current;
    if (previous.detail?.path === detail?.path && previous.flight === flight.on) return;
    shown.current = { detail, flight: flight.on };
    if (flight.on) return;
    if (detail) {
      scrollTo({ top: previous.flight ? history.state?.scroll ?? 0 : 0, behavior: 'instant' });
      const heading = document.querySelector<HTMLElement>('main [data-detail-heading], main.project-page h1');
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
          const trigger = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find((link) =>
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
      navigation.syncLeaving();
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
    const reload = (event: Event) => {
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

  return { flight, setFlight, detail, project, experience, progress, setProgress, warp, setWarp,
    warping, pending, hud, takeFlight, leaveFlight, enterGame, leaveGame, openProject, openExperience, closeDetail, building };
}
