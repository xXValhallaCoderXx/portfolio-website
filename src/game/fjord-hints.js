// Website navigation remains separate from the flight coach. A poor landing still opens a place.
export const RING_HIGH = 28;

export function fjordHint(facts) {
  if (facts.auto) return `flying itself to ${facts.auto} · steer to take over`;
  if (facts.nearArch) return 'through the arch: soar, lift, link tricks';
  if (facts.arch) return 'Good Lift → hard right through the arch';
  if (facts.outside) return 'the fog turns you back toward the fjord';
  if (facts.nearRing) return facts.unvisited && facts.agl > RING_HIGH ? `hold ${facts.touch ? 'ears' : 'E'} to descend into the ring` : '';
  if (facts.airtime < 9) return 'lit pillars are places to land · amber sparks are rising air';
  if (facts.airtime < 20) return `${facts.touch ? 'tap' : 'click'} a pillar for automatic travel`;
  return '';
}
