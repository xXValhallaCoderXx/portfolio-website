import * as THREE from 'three';
import { buildPlaces, buildScatter, buildSky } from './scenery.ts';
import { STONES, buildTerrain, surfaceAt } from './terrain.ts';

const NIGHT = 0x060a13;
const CYAN = 0x2dd4ee;
// The carved face of every stone looks this way: down the fjord, toward pilots flying up it.
const FACING = [-0.6, 0.8];

/**
 * A small live window onto rune ridge, the shore in the flight where every role has its stone.
 * The camera stands in front of one stone at a time and glides along the shore to the next.
 *
 * Returns { focus(index), setVisible(seen), dispose() }. Stones are numbered oldest first, as
 * they stand along the shore.
 */
export function createRidgeView(stage: Element) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(NIGHT, 0.003);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000);

  scene.add(new THREE.HemisphereLight(0x5f8fd8, 0x04060b, 1.1));
  const moon = new THREE.DirectionalLight(0xa9ccff, 1.6);
  moon.position.set(-0.6, 0.8, 0.3);
  scene.add(moon);

  const terrain = buildTerrain();
  const sky = buildSky();
  const places = buildPlaces();
  const scatter = buildScatter(() => (terrain.cones.visible = false));
  scene.add(terrain.group, sky.group, places.group, scatter.group);

  // The stone being looked at stands in a beam of light, like the places in the flight.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 90, 6, 1, true),
    new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  const glow = new THREE.PointLight(CYAN, 90, 45, 2);
  scene.add(beam, glow);

  let chosen = STONES.length - 1;
  let placed = false;
  let visible = true;
  let time = 0;
  let last = performance.now();
  const eye = new THREE.Vector3();
  const sight = new THREE.Vector3();
  const wantEye = new THREE.Vector3();
  const wantSight = new THREE.Vector3();

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const sizeWatch = new ResizeObserver(resize);
  sizeWatch.observe(stage);
  resize();

  let request = requestAnimationFrame(function frame(now) {
    request = requestAnimationFrame(frame);
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible) return;
    time += elapsed;

    // The camera stands off the stone's carved face, drifting a little from side to side.
    const stone = STONES[chosen];
    const away = 15 + stone.height * 1.25;
    const drift = Math.sin(time * 0.22) * 7;
    wantEye.set(stone.x + FACING[0] * away + FACING[1] * drift, 0, stone.z + FACING[1] * away - FACING[0] * drift);
    wantEye.y = Math.max(stone.y + stone.height * 0.8 + 2.5, surfaceAt(wantEye.x, wantEye.z) + 2.5);
    wantSight.set(stone.x, stone.y + stone.height * 0.55, stone.z);
    const ease = placed ? 1 - Math.exp(-elapsed * 1.8) : 1;
    placed = true;
    eye.lerp(wantEye, ease);
    sight.lerp(wantSight, ease);
    // Gliding between stones, the camera must not dip under the hillside in between.
    eye.y = Math.max(eye.y, surfaceAt(eye.x, eye.z) + 2);
    camera.position.copy(eye);
    camera.lookAt(sight);

    beam.position.set(stone.x, stone.y + 45, stone.z);
    glow.position.set(stone.x + FACING[0] * 4, stone.y + stone.height * 0.6, stone.z + FACING[1] * 4);

    terrain.update(time);
    sky.update(time);
    places.update(time);
    renderer.render(scene, camera);
  });

  return {
    focus(index: number) {
      chosen = Math.max(0, Math.min(STONES.length - 1, index));
    },
    setVisible: (seen: boolean) => (visible = seen),
    dispose() {
      cancelAnimationFrame(request);
      sizeWatch.disconnect();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
