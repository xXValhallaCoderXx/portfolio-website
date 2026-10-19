import * as THREE from 'three';
import type { FlightState, FlightInput } from '../../../domains/flight/models.ts';
import type { RenderedFlight } from '../presentation/flight-view.ts';

const { clamp } = THREE.MathUtils;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const GAZE = { back: 4, drop: 8, lift: 13, rise: 1.2, fall: 0.5 };
export interface LaunchReveal { age: number; duration: number; from: THREE.Vector3; at: THREE.Vector3 }
export interface FlightCameraPort {
  g: FlightState; camera: THREE.PerspectiveCamera; gateway: THREE.Object3D; input: FlightInput;
  view: { centred: boolean };
  effects: { gaze: number; want: { gaze: number }; floor: number; tilt: number; shake: number };
  surfaceAt(x: number, z: number): number;
  readonly mode: string; readonly time: number; readonly calm: boolean;
  rendered(): RenderedFlight | null; isAirborne(): boolean; aimLost(dt: number): void;
}
/** Chase-camera state is presentation only and never changes flight bodies. */
export function createFlightCamera(port: FlightCameraPort) {
  const { g, camera, effects, input, view, surfaceAt } = port;
  const gateway = { group: port.gateway };
  const state: { spy: { from: [number, number, number]; at: [number, number, number] } | null; climb: { now: number; want: number }; reveal: LaunchReveal | null } = { spy: null, climb: { now: 0, want: 0 }, reveal: null };
  const forward = new THREE.Vector3();
  const chase = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const cameraRay = new THREE.Raycaster();
  const cameraDirection = new THREE.Vector3();
  const cameraCandidate = new THREE.Vector3();
  const cameraHits: THREE.Intersection[] = [];
  function cameraBlocked(at: THREE.Vector3Like) {
    cameraDirection.copy(at).sub(lookAt);
    const length = cameraDirection.length();
    for (let n = 1; n <= 8; n++) {
      const fraction = n / 8;
      const x = lookAt.x + cameraDirection.x * fraction;
      const z = lookAt.z + cameraDirection.z * fraction;
      if (lookAt.y + cameraDirection.y * fraction < surfaceAt(x, z) + 2) return true;
    }
    cameraRay.set(lookAt, cameraDirection.normalize());
    cameraRay.far = length;
    cameraHits.length = 0;
    gateway.group.updateWorldMatrix(true, true);
    cameraRay.intersectObject(gateway.group, true, cameraHits);
    return cameraHits.some(hit => (hit.object as THREE.Mesh).isMesh && hit.distance < length - 0.5);
  }
  function clearChase() {
    if (!port.isAirborne() || !cameraBlocked(chase)) return;
    const pilot = port.rendered()?.pilot.pos ?? g.pos;
    const back = Math.hypot(chase.x - pilot.x, chase.z - pilot.z);
    const y = chase.y;
    for (const offset of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI]) {
      cameraCandidate.set(pilot.x - Math.sin(heading + offset) * back, y, pilot.z + Math.cos(heading + offset) * back);
      if (!cameraBlocked(cameraCandidate)) { chase.copy(cameraCandidate); return; }
    }
    // A narrow rock corridor has no full-distance view: move closer rather than into the rock.
    cameraCandidate.copy(chase).lerp(lookAt, 0.65);
    if (!cameraBlocked(cameraCandidate)) chase.copy(cameraCandidate);
  }

  // The heading the chase looks along: the glider's own, but carried round more slowly through a
  // wingover, so the glider is seen carving across the picture instead of the world swinging round
  // with it; and how far the camera stands back for it. Outside a wingover the heading is the
  // glider's own, exactly, and the camera where it always was.
  let heading = g.yaw;
  let swung = 0;
  function followHeading(dt: number) {
    swung = smoothstep(0.4, 1.0, Math.abs(g.bank));
    const course = port.rendered()?.yaw ?? g.track ?? g.yaw;
    const off = wrapAngle(course - heading);
    if (swung === 0 && Math.abs(off) < 1e-3) heading = course;
    else heading += off * (1 - Math.exp(-dt * (4 + 6 * (1 - swung))));
  }

  function chaseTarget() {
    // With no gaze this is the ordinary chase: behind, a little above, looking just ahead.
    forward.set(Math.sin(heading), 0, -Math.cos(heading));
    chase.copy(port.rendered()?.pilot.pos ?? g.pos).addScaledVector(forward, (camera.aspect < 1 ? -34 : -26) - GAZE.back * effects.gaze - 4 * swung);
    chase.y += 9.5 - GAZE.drop * effects.gaze;
    lookAt.copy(port.rendered()?.pilot.pos ?? g.pos).addScaledVector(forward, 14);
    lookAt.y += 3 + GAZE.lift * effects.gaze;
    clearChase();
  }

  function snapCamera() {
    heading = g.track ?? g.yaw;
    swung = 0;
    chaseTarget();
    camera.position.copy(chase);
  }

  // While set, the camera is parked at `from` looking at `at` (see the debug handle at the bottom).

  // How far the backdrop's camera has climbed above the glider, 0 to 1, and how far it is asked to.
  // The page raises it as the hero scrolls away, until the fjord is seen from above like a map.


  function updateCamera(dt: number) {
    if (state.spy) {
      camera.position.set(...state.spy.from);
      camera.lookAt(...state.spy.at);
      return;
    }
    if (port.mode === 'lost') return port.aimLost(dt);
    if (port.mode === 'intro') {
      // As a backdrop the camera circles the glider, and climbs above it as the page scrolls away.
      // On a wide screen it aims a little to the glider's left, which puts the glider right of
      // centre and clear of the headline; the aim widens with distance to hold it there.
      state.climb.now += (state.climb.want - state.climb.now) * (1 - Math.exp(-dt * 5));
      const up = state.climb.now * state.climb.now * (3 - 2 * state.climb.now);
      const a = port.time * 0.12 + 2.6;
      const back = 38 + 22 * up;
      const above = 9 + 135 * up;
      const aside = camera.aspect > 1.2 && !view.centred ? 0.33 * Math.hypot(back, above - 4) : 0;
      // On an upright phone the headline fills the lower half, so the camera aims below the
      // glider, which lifts the glider into the upper half.
      const below = camera.aspect < 1 && !view.centred ? 13 : 0;
      camera.position.set(g.pos.x + Math.sin(a) * back, g.pos.y + above, g.pos.z + Math.cos(a) * back);
      camera.lookAt(g.pos.x - Math.cos(a) * aside, g.pos.y + (4 - below) * (1 - up), g.pos.z + Math.sin(a) * aside);
      return;
    }
    // Outside a run there is nothing to look up at, so the gaze eases back to the ordinary chase.
    const gaze = effects.want.gaze;
    effects.gaze += (gaze - effects.gaze) * (1 - Math.exp(-dt * (gaze > effects.gaze ? GAZE.rise : GAZE.fall)));
    if (effects.gaze < 1e-4 && gaze === 0) effects.gaze = 0;
    followHeading(dt);
    chaseTarget();
    if (state.reveal && port.mode === 'flying') {
      state.reveal.age += dt;
      if (input.leftBrake !== input.rightBrake && state.reveal.age < 0.8) {
        state.reveal.age = 0.8;
        state.reveal.duration = 0.35;
      }
      const mix = smoothstep(0.8, 0.8 + state.reveal.duration, state.reveal.age);
      camera.position.copy(state.reveal.from).lerp(chase, mix);
      const at = state.reveal.at.clone().lerp(lookAt, mix);
      camera.lookAt(at);
      if (mix >= 1) state.reveal = null;
      return;
    }
    camera.position.lerp(chase, 1 - Math.exp(-dt * 8));
    camera.position.y = Math.max(camera.position.y, surfaceAt(camera.position.x, camera.position.z) + 4);
    if (port.mode === 'cloudbase') camera.position.y = Math.max(camera.position.y, effects.floor + 4);
    camera.lookAt(lookAt);
    // The picture tilts with a quarter of a turn's bank, and with a tenth of a wingover's swing
    // on top of it: none of the swing for whoever asks for less motion, and none of a loop, round
    // which the horizon holds. Eased, so going into a loop and out of it never snaps.
    const tilt = port.calm || g.loop !== 0 ? 0 : clamp(-g.bank * 0.15, -Math.PI / 30, Math.PI / 30);
    effects.tilt += (tilt - effects.tilt) * (1 - Math.exp(-dt * 8));
    camera.rotateZ(effects.tilt);
    if (effects.shake > 0) {
      // A turn of the head only, after the aim is set, so it can never drift.
      camera.rotateX(effects.shake * Math.sin(port.time * 53.1));
      camera.rotateY(effects.shake * Math.sin(port.time * 41.7 + 1.3));
    }
  }


 return { update: updateCamera, snap: snapCamera, get reveal() { return state.reveal; }, set reveal(value: LaunchReveal | null) { state.reveal = value; }, rise(amount: number) { return state.climb.want = Math.max(0, Math.min(1, amount)); }, spy(from?: [number, number, number], at?: [number, number, number]) { return state.spy = from && at ? {from, at} : null; } };
}
