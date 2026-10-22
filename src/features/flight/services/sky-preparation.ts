import { sameGame, type GameAddress } from '../../../domains/good-lift/good-lift-address.ts';
import type { ResolvedSky } from '../../good-lift/good-lift.models.ts';

/** Loading a sky is reversible; only consuming a ready request authorizes a run. */
export function createSkyPreparation(resolve: (address: GameAddress, isCurrent: () => boolean) => Promise<ResolvedSky | null>) {
  type Request = { address: GameAddress; sky: ResolvedSky | null; promise: Promise<ResolvedSky | null> };
  let current: Request | null = null;
  return {
    prepare(address: GameAddress) {
      if (current && sameGame(current.address, address)) return current.promise;
      const request: Request = { address, sky: null, promise: Promise.resolve(null) };
      current = request;
      request.promise = resolve(address, () => current === request).then(sky => {
        if (current !== request || !sky) return null;
        request.sky = sky;
        return sky;
      }, error => {
        if (current !== request) return null;
        current = null;
        throw error;
      });
      return request.promise;
    },
    consume(expected?: ResolvedSky) {
      if (!current?.sky || expected && current.sky !== expected) return null;
      const prepared = { address: current.address, sky: current.sky };
      current = null;
      return prepared;
    },
    cancel() { current = null; },
    get ready() { return current?.sky ?? null; },
  };
}
