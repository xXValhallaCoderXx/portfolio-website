import { arraysMadeBy } from '../../../test/helpers/test-alloc.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHALK, createChalk } from './meet-chalk.ts';
import { ORDER } from './cloudbase.ts';
import { createCloudbaseRun } from '../../../domains/good-lift/cloudbase-state.ts';
import { createMeet } from '../../../domains/good-lift/meet-state.ts';
import { createRunWorld, startRun, stepRun } from '../../../domains/good-lift/run-step.ts';
import { createReferencePilot } from '../../../domains/good-lift/pilots.ts';

// The chalk's grains as drawn: where each is, how faded and how big, and which are showing.
const grainsOf = (chalk: ReturnType<typeof createChalk>) => {
  const grains = chalk.root?.getObjectByName('chalk-grains') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  assert.ok(grains);
  const { position, fade, size } = grains.geometry.attributes as Record<'position' | 'fade' | 'size', THREE.BufferAttribute>;
  return { position, fade, size, shown: Array.from(fade.array).filter((value) => value > 0).length };
};
const pilot = new THREE.Vector3(10, 400, -20);
const loads = (plates = 0, reps = 0) => ({ plates, reps });

test('nothing is built before a run; begin builds once, reset hides it, and dispose releases its geometry and material exactly once', () => {
  const scene = new THREE.Scene();
  const chalk = createChalk({ scene });
  assert.equal(chalk.root, null);
  chalk.update(1, pilot, loads(3));
  chalk.begin();
  const root = chalk.root as THREE.Group | null;
  assert.ok(root);
  chalk.begin();
  assert.equal(chalk.root, root, 'a second run reuses the same parts');
  assert.equal(scene.children.filter((child) => child.name === 'Chalk').length, 1);
  chalk.reset();
  assert.equal(root.visible, false);
  const grains = root.getObjectByName('chalk-grains') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  let released = 0;
  grains.geometry.addEventListener('dispose', () => (released += 1));
  grains.material.addEventListener('dispose', () => (released += 1));
  chalk.dispose();
  chalk.dispose();
  assert.equal(released, 2);
  assert.equal(scene.children.length, 0);
  chalk.begin();
  assert.equal(chalk.root, null, 'nothing comes back after dispose');
});

test('the grains are one pool that never grows, named, drawn after the fog and never culled, since they move every frame', () => {
  const chalk = createChalk({ scene: new THREE.Scene() });
  assert.ok(chalk);
  chalk.begin();
  const grains = chalk.root!.getObjectByName('chalk-grains') as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  assert.ok(grains);
  assert.ok(grains.isPoints);
  assert.equal(grains.renderOrder, ORDER.aboveFog);
  assert.equal(grains.frustumCulled, false);
  assert.equal(grains.geometry.attributes.position.count, CHALK.puffs * CHALK.grains);
  assert.equal(grains.material.transparent, true);
  assert.equal(grains.material.depthWrite, false);
});

test('worn, a plate or a rep loading puffs chalk from the pilot\'s hands, which spreads out, sinks and thins, and is gone in CHALK.life', () => {
  const chalk = createChalk({ scene: new THREE.Scene() });
  chalk.wear(true);
  chalk.begin();
  chalk.update(5, pilot, loads());
  assert.equal(grainsOf(chalk).shown, 0, 'nothing loaded, no chalk');
  chalk.update(5.1, pilot, loads(1));
  assert.equal(chalk.live, 1);
  // A moment in: every grain of the puff is out, round the hands, white and thick.
  chalk.update(5.2, pilot, loads(1));
  let { position, fade, size, shown } = grainsOf(chalk);
  assert.equal(shown, CHALK.grains);
  const hands = new THREE.Vector3(pilot.x, pilot.y + CHALK.lift, pilot.z);
  const spread = (array: ArrayLike<number>) => {
    let far = 0;
    let low = 0;
    for (let i = 0; i < array.length / 3; i++) {
      if (!(fade.array[i] > 0)) continue;
      far = Math.max(far, Math.hypot(array[i * 3] - hands.x, array[i * 3 + 2] - hands.z));
      low = Math.min(low, array[i * 3 + 1] - hands.y);
    }
    return { far, low };
  };
  const early = { ...spread(position.array), fade: Math.max(...fade.array), size: Math.max(...size.array) };
  assert.ok(early.far > 0 && early.far < CHALK.burst / CHALK.drag + 0.01, `out ${early.far} m`);
  // Later it is wider, lower, bigger and fainter.
  chalk.update(5.7, pilot, loads(1));
  ({ position, fade, size, shown } = grainsOf(chalk));
  const late = { ...spread(position.array), fade: Math.max(...fade.array), size: Math.max(...size.array) };
  assert.ok(late.far > early.far, 'it spreads');
  assert.ok(late.low < early.low, 'it sinks');
  assert.ok(late.size > early.size && late.size <= CHALK.spread, 'its grains grow');
  assert.ok(late.fade < early.fade && early.fade <= CHALK.opacity, 'and thin out');
  chalk.update(5.1 + CHALK.life + 0.01, pilot, loads(1));
  assert.equal(grainsOf(chalk).shown, 0, 'gone');
  assert.equal(chalk.live, 0);
  // A rep puffs as a plate does; the puff stays where it was thrown as the pilot flies on.
  chalk.update(7, pilot, loads(1, 1));
  const away = pilot.clone().add(new THREE.Vector3(8, 0, 0));
  chalk.update(7.2, away, loads(1, 1));
  assert.ok(spread(grainsOf(chalk).position.array).far < 2, 'left in the air behind the pilot');
});

test('not worn, or for a visitor who asks for less motion, no pickup puffs; by hand one can, but never for that visitor', () => {
  for (const [calm, worn] of [[false, false], [true, true], [true, false]]) {
    const chalk = createChalk({ scene: new THREE.Scene(), calm });
    chalk.wear(worn);
    chalk.begin();
    chalk.update(1, pilot, loads());
    chalk.update(1.1, pilot, loads(2, 3));
    assert.equal(grainsOf(chalk).shown, 0, `calm ${calm}, worn ${worn}`);
    assert.equal(chalk.wearing, false);
    // From the console, for a look (fjord.chalk.puff): at the last update's time.
    chalk.puff(pilot.x, pilot.y, pilot.z);
    chalk.update(1.2, pilot, loads(2, 3));
    assert.equal(grainsOf(chalk).shown, calm ? 0 : CHALK.grains, `by hand, calm ${calm}`);
  }
  // Taken off mid-run, the next pickup does not puff; put back on, it does.
  const chalk = createChalk({ scene: new THREE.Scene() });
  chalk.wear(true);
  chalk.begin();
  chalk.wear(false);
  chalk.update(1, pilot, loads(1));
  assert.equal(chalk.live, 0);
  chalk.wear(true);
  chalk.update(2, pilot, loads(2));
  assert.equal(chalk.live, 1);
});

test('no more than CHALK.puffs hang in the air at once: one more takes the oldest one\'s place', () => {
  const chalk = createChalk({ scene: new THREE.Scene() });
  chalk.wear(true);
  chalk.begin();
  for (let n = 1; n <= CHALK.puffs + 1; n++) chalk.update(n * 0.1, pilot.clone().add(new THREE.Vector3(n * 10, 0, 0)), loads(n));
  assert.equal(chalk.live, CHALK.puffs);
  // The first puff (at 10 m out) has gone, and the newest is in its place.
  const { position, fade } = grainsOf(chalk);
  let nearest = Infinity;
  for (let i = 0; i < fade.count; i++) if (fade.array[i] > 0) nearest = Math.min(nearest, Math.abs(position.array[i * 3] - pilot.x - 10));
  assert.ok(nearest > 5, 'nothing is left of the oldest');
});

test('a new run opens with no chalk in the air, and the last run\'s loads do not puff', () => {
  const chalk = createChalk({ scene: new THREE.Scene() });
  chalk.wear(true);
  chalk.begin();
  chalk.update(30, pilot, loads(4, 6));
  chalk.update(30.1, pilot, loads(4, 6));
  assert.ok(grainsOf(chalk).shown > 0);
  chalk.begin();
  assert.equal(grainsOf(chalk).shown, 0);
  // The new run's clock starts again, and its meet with it.
  chalk.update(0, pilot, loads());
  chalk.update(0.1, pilot, loads());
  assert.equal(chalk.live, 0);
  assert.equal(grainsOf(chalk).shown, 0);
});

test('drawing makes no arrays and writes into the same buffers, and with no chalk in the air it does no work at all', () => {
  assert.ok(arraysMadeBy(() => new Float32Array(1)) > 0, 'the counter sees what it should');
  const chalk = createChalk({ scene: new THREE.Scene() });
  chalk.wear(true);
  chalk.begin();
  const { position, fade, size } = grainsOf(chalk);
  const buffers = [position.array, fade.array, size.array];
  let made = 0;
  for (let n = 0; n < 600; n++) {
    const time = n / 60;
    made += arraysMadeBy(() => chalk.update(time, pilot, loads(Math.floor(n / 50))));
  }
  assert.equal(made, 0, `${made} arrays were made while drawing`);
  const now = grainsOf(chalk);
  assert.deepEqual([now.position.array, now.fade.array, now.size.array].map((array, i) => array === buffers[i]), [true, true, true]);
  // Once the last puff has gone, frames send the card nothing.
  chalk.update(20, pilot, loads(11));
  const versions = [now.position.version, now.fade.version, now.size.version];
  for (let n = 1; n < 30; n++) chalk.update(20 + n / 60, pilot, loads(11));
  assert.deepEqual([now.position.version, now.fade.version, now.size.version], versions);
});

test('a whole run with the meet, drawn frame by frame, puffs as plates and reps load and never puts a number astray', () => {
  const chalk = createChalk({ scene: new THREE.Scene() });
  const meet = createMeet();
  const world = startRun(createRunWorld({ sky: createCloudbaseRun(), meet }), 7);
  chalk.wear(true);
  chalk.begin();
  const flyer = createReferencePilot({ brake: 'eased', collect: true });
  const intent = { turn: 0, brake: false, bar: false };
  let ended = null;
  let puffed = 0;
  while (!ended && world.sky.state.elapsed < 240) {
    flyer.decide(world, intent);
    ended = stepRun(world, intent);
    const before = chalk.live;
    chalk.update(world.sky.state.elapsed, world.g.pos, meet);
    if (chalk.live > before) puffed += 1;
    const { position, fade, size } = grainsOf(chalk);
    for (const array of [position.array, fade.array, size.array]) assert.ok(array.every(Number.isFinite));
  }
  const loaded = meet.state.plates + meet.state.reps;
  // However the run went, a load puffed (a few come too close together to puff each).
  assert.ok(loaded === 0 || (puffed > 0 && puffed <= loaded), `${puffed} puffs for ${loaded} loads`);
  chalk.dispose();
});
