import { detailAt } from '../../domains/portfolio/portfolio.service.ts';
import type { ExperienceView, SectionId } from '../../domains/portfolio/portfolio.types.ts';
import { gameHref, readGameAddress } from '../../domains/good-lift/good-lift-address.ts';

export const FLY = '/fly';
export type GameAddress = NonNullable<ReturnType<typeof readGameAddress>>;
export const DAILY: GameAddress = { kind: 'daily', sky: null, vs: null, bad: null };
export interface HomeReturn { scroll: number; focus: string; href: string; experience?: string; experienceView?: ExperienceView }
export interface NavigationState { home?: number; flight?: boolean; game?: boolean; overFly?: boolean; scroll?: number; focus?: string; href?: string; experience?: string; experienceView?: ExperienceView; returnTo?: HomeReturn; detail?: string; id?: string }
export interface NavigationDependencies {
  location: Pick<Location, 'pathname' | 'search' | 'hash'>;
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go' | 'back'>;
  scroll: () => number;
}

/** Address and history operations; React owns rendering and transition timing. */
export function createNavigationService({ location, history, scroll }: NavigationDependencies) {
  let homeReturn: HomeReturn | null = null;
  let leaving: string | null = null;
  const state = (): NavigationState => history.state ?? {};
  const isFlyAddress = () => location.pathname.replace(/\/$/, '') === FLY;
  const gameAddress = () => readGameAddress(location);
  const isFlightAddress = () => isFlyAddress() || !!gameAddress();
  const detailAddress = () => detailAt(location.pathname);
  const missingAddress = () => {
    const path = location.pathname.replace(/\/$/, '');
    return path === '' || path === FLY || path === '/index.html' || detailAddress() || gameAddress() ? null : location.pathname;
  };
  const backToPage = () => state().home ?? 0;
  return {
    state, isFlyAddress, gameAddress, isFlightAddress, detailAddress, missingAddress,
    takeFlight() {
      if (!isFlightAddress()) {
        history.replaceState({ ...state(), scroll: scroll() }, '');
        history.pushState({ flight: true, home: missingAddress() ? 0 : backToPage() + 1 }, '', FLY);
      }
    },
    leaveFlight(sectionId?: SectionId | null) {
      const steps = backToPage();
      if (sectionId) history.pushState(null, '', `/#${sectionId}`);
      else if (steps) history.go(-steps);
      else history.replaceState(null, '', '/');
    },
    enterGame(address: GameAddress) {
      const href = gameHref(address);
      if (gameAddress()) history.replaceState(history.state, '', href);
      else history.pushState({ flight: true, game: true, overFly: isFlyAddress(), home: backToPage() && backToPage() + 1 }, '', href);
    },
    leaveGame() {
      if (state().overFly) { leaving = FLY; history.back(); }
      else history.replaceState({ flight: true, home: backToPage() }, '', FLY);
    },
    syncLeaving() {
      if (!leaving) return;
      const wanted = leaving;
      leaving = null;
      if (location.pathname.replace(/\/$/, '') !== wanted) history.pushState({ flight: true, home: 0 }, '', wanted);
    },
    openDetail(section: 'projects' | 'experience', id: string, view?: ExperienceView) {
      const href = `/${section}/${id}`;
      let returnTo = state().returnTo ?? homeReturn;
      if (!detailAddress()) {
        returnTo = { scroll: scroll(), focus: href, href: location.pathname + location.hash,
          experience: section === 'experience' ? id : state().experience,
          experienceView: section === 'experience' ? view : state().experienceView };
        history.replaceState({ ...state(), ...returnTo }, '');
      }
      homeReturn = returnTo;
      history.pushState({ detail: section, id, returnTo }, '', href);
    },
    closeDetail(sectionId?: SectionId | null) {
      const section = detailAddress()?.section ?? 'projects';
      const returnTo = state().returnTo ?? homeReturn;
      const wanted = sectionId ?? (returnTo ? null : section);
      const href = sectionId ? `/#${sectionId}` : returnTo?.href ?? `/#${section}`;
      history.pushState(returnTo ? { ...returnTo } : null, '', href);
      return wanted;
    },
  };
}
