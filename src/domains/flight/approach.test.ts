import type { AirSample } from './models.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROACH_WINDS, fjordBreeze, sampleApproach } from './approach.ts';
import { sampleFjordAir } from './atmosphere.ts';
import { ZONES } from '../../adapters/rendering/terrain.ts';
import { buildWindsock } from '../../adapters/rendering/scenery.ts';

test('drawn and approach air agree with the local field while approach defaults describe ambient wind', () => {
  for (const zone of ZONES) {
    const pos = { x: zone.x, y: zone.h + 30, z: zone.z };
    const a = sampleFjordAir(pos), drawn = fjordBreeze(pos.x, pos.y, pos.z, {}), approach = sampleApproach(pos.x, pos.y, pos.z);
    assert.equal(drawn.x, a.windX); assert.equal(drawn.y, a.windY); assert.equal(drawn.z, a.windZ);
    for (const key of ['windX', 'windY', 'windZ', 'ambientX', 'ambientZ', 'ridge', 'lee'] as const) assert.equal(approach[key], a[key]);
    const sock = APPROACH_WINDS.find((w) => w.id === zone.id);
    assert.ok(sock); assert.ok(Math.abs(Math.hypot(sock.x, sock.z) - 1) < 1e-10);
    assert.ok(Math.abs(sock.x * sock.speed - a.ambientX) < 1e-10);
    assert.ok(Math.abs(sock.z * sock.speed - a.ambientZ) < 1e-10);
  }
});
test('each windsock follows sampled air at its own pole, including terrain-bent direction', async () => {
  let bent = 0;
  for (const zone of ZONES) {
    const defaults = APPROACH_WINDS.find((wind) => wind.id === zone.id);
    const sock = buildWindsock({ wind: defaults, loadModel: async () => null as unknown as import('three').Object3D });
    await sock.ready;
    sock.group.position.set(zone.x, zone.h, zone.z);
    sock.update(0, fjordBreeze, true);
    const air = sampleFjordAir({ x: zone.x, y: zone.h + 7.1, z: zone.z });
    const speed = Math.hypot(air.windX, air.windZ);
    assert.ok(speed > 0.05, 'the real pole has enough wind to indicate its direction');
    assert.ok(Math.abs(Math.cos(sock.group.rotation.y) - air.windX / speed) < 1e-10);
    assert.ok(Math.abs(-Math.sin(sock.group.rotation.y) - air.windZ / speed) < 1e-10);
    if (Math.abs(defaults!.x * air.windZ - defaults!.z * air.windX) > 0.01) bent++;
    sock.group.traverse((part) => { const mesh = part as import('three').Mesh; mesh.geometry?.dispose(); (mesh.material as import('three').Material)?.dispose(); });
  }
  assert.ok(bent > 0, 'this exercises a real local direction change rather than only ambient collinearity');
});
test('approach sampling is pure, writes caller objects and no longer invents a visual-only breeze', () => {
  const out: AirSample = {}, before = sampleApproach(100, 100, 200);
  assert.equal(fjordBreeze(100, 100, 200, out), out);
  for (let i = 0; i < 20; i++) fjordBreeze(20, 30, 40, {});
  assert.deepEqual(sampleApproach(100, 100, 200), before);
});
