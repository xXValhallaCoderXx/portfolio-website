// Test the swept pilot path, so time boost cannot skip the opening and a near miss cannot start a run.
export function crossesGateway(from, to, gateway) {
  if (!((from.x < gateway.x && to.x >= gateway.x) || (from.x > gateway.x && to.x <= gateway.x))) return false;
  const t = (gateway.x - from.x) / (to.x - from.x);
  const y = from.y + (to.y - from.y) * t;
  const z = from.z + (to.z - from.z) * t;
  const { minY, maxY, minZ, maxZ } = gateway.corridor;
  return y >= minY && y <= maxY && z >= minZ && z <= maxZ;
}
