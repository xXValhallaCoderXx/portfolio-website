import type { PhysicalState, PhysicsBodies } from './models.ts';
import type { Recovery, SideFlow, WingTable } from './flight-physics.ts';
import { WING } from './wing-envelope.ts';
// What goes wrong with a wing that has Recovery (flight-physics.js) and how it comes right again: each
// half's fold, a tip caught in the lines, a deep stall and the line twist, stepped with the solver,
// and the failures a lesson or a strike can start. The classic wing has none of it: it never folds a
// half, so only a front collapse or a stall can be started on it.

/** How folded a half must be to fly on less of itself: a collapse to answer, and to judge. */
export const FOLDED = 0.05;

/** The ways a wing can be made to fail, as a lesson's instructor or a strike starts them. */
export const FAILURES = Object.freeze(['asym', 'frontal', 'stall', 'spin', 'cravat', 'deep', 'twist'] as const);
export type Failure = typeof FAILURES[number];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const quantize = (number: number, C: WingTable) => Math.round(number * C.quantum) / C.quantum;

/**
 * Whether a wing with `C`'s numbers can have `kind` at all: every wing a front collapse; a stall, any
 * wing but one that cannot be stalled (a glider's Recovery says so with no deep stall); a fold, any
 * glider; a spin, one whose halves stall by themselves; a cravat, a deep stall and a twist, those
 * whose Recovery has them.
 */
export function failsBy(C: WingTable, kind: Failure): boolean {
  const R = C.feel?.recovery, flow = C.feel?.flow;
  switch (kind) {
    case 'frontal': return true;
    case 'stall': return !R || R.deep > 0;
    case 'asym': return !!R;
    case 'spin': return !!R && !!flow && flow.local > 0;
    case 'cravat': return !!R && R.cravatFold > 0;
    case 'deep': return !!R && R.deep > 0;
    case 'twist': return !!R && R.twistInertia > 0;
  }
}

/**
 * A half's latch (physical travel), its stall (rad, at its hand's `hand`) and the speed under which it
 * can stall at all (m/s), as `flow` sets them and brought nearer by the other half's fold `other`: the
 * open half carries the folded one's load. The solver's halves (stepSides) and the soft-brakes cue both
 * read them, so the cue says what the wing does.
 */
export function halfGate(flow: Readonly<SideFlow>, R: Readonly<Recovery> | null | undefined, other: number) {
  return R && other > 0 ? flow.maxSpeed * (1 + R.loadSpeed * other) : flow.maxSpeed;
}
export function halfLatch(flow: Readonly<SideFlow>, R: Readonly<Recovery> | null | undefined, other: number) {
  return R && other > 0 ? flow.latch - R.loadLatch * other : flow.latch;
}
export function halfStall(flow: Readonly<SideFlow>, R: Readonly<Recovery> | null | undefined, other: number, hand: number) {
  return (R && other > 0 ? flow.stallAngle - R.loadStall * other : flow.stallAngle) - flow.brakeIncidence * Math.max(0, hand - flow.brakeStart);
}

// A pump's worth of a hand at `hand`: nothing up to pumpFrom, then growing smoothly to its whole
// travel past pumpFull, so a stroke is the difference between where it ends and where it began. It
// only depends on those two depths, never on how fast the hand went or how many steps it took.
function pumped(hand: number, R: Readonly<Recovery>) {
  const a = R.pumpFrom, b = R.pumpFull;
  if (hand <= a) return 0;
  if (hand >= b) return (b - a) / 2 + hand - b;
  const t = (hand - a) / (b - a);
  return (b - a) * t * t * t * (1 - t / 2);
}

/**
 * Each half's pump, once a step before the substeps (the hands do not move between them): the travel
 * its hand has pulled since it was last let back up, refilling that much of its fold (a separated half
 * none). The hands are the direct pair's; on the hands' old controls, the brake both hands hold, so the
 * bank's own corrections never pump. The stroke both hands make together pumps a front collapse open
 * by frontalPump of it, once it has folded.
 */
export function pumpFolds(s: PhysicalState, R: Readonly<Recovery>, direct: boolean, yaw: number) {
  let both = Infinity;
  for (let side = -1; side <= 1; side += 2) {
    const hand = direct ? side < 0 ? s.leftBrake : s.rightBrake : s.brake;
    let memory = side < 0 ? s.pumpL : s.pumpR, stroke = 0;
    if (hand > memory) { stroke = pumped(hand, R) - pumped(memory, R); memory = hand; }
    else if (hand < memory - R.pumpSlack) memory = hand;
    both = Math.min(both, stroke);
    const fold = side < 0 ? s.foldL : s.foldR;
    if (side < 0) s.pumpL = memory; else s.pumpR = memory;
    if (stroke > 0 && fold > 0) refold(s, R, side, fold, fold - R.pump * stroke * (1 - (side < 0 ? s.sepL : s.sepR)), yaw);
  }
  if (both > 0 && R.frontalPump > 0 && s.folded && (s.wingPhase === WING.frontal || s.wingPhase === WING.opening))
    s.inflation = Math.min(1, s.inflation + R.frontalPump * both);
}

/**
 * Each half's fold over one substep `h`: as the canopy dives well ahead of the pilot at low load (as a
 * front collapse begins, wing-envelope.js), a half whose own inlet goes under −tuckAngle, its own brake
 * not holding it, folds: one side of an uncaught surge. A folded half fills again by itself as its own
 * flow comes forward, a separated half not at all, and a caught tip holds it at its floor. Reads what
 * each half flew at the last substep (forces' sideAlpha and sideAlong).
 */
export function stepFolds(s: PhysicalState, R: Readonly<Recovery>, E: WingTable['envelope'], h: number, direct: boolean, yaw: number) {
  const f = s.flow;
  const diving = R.tuck > 0 && (s.wingPhase === WING.flying || s.wingPhase === WING.surge) && f.pitch < -E.frontPitch && f.pitchRate < 0 &&
    f.under && f.load < E.frontLoad;
  const stalled = s.wingPhase === WING.entry || s.wingPhase === WING.stalled || s.wingPhase === WING.backfly;
  for (let side = -1; side <= 1; side += 2) {
    let fold = side < 0 ? s.foldL : s.foldR;
    const along = side < 0 ? s.sideAlongL : s.sideAlongR, alpha = side < 0 ? s.sideAlphaL : s.sideAlphaR;
    const hand = direct ? side < 0 ? s.leftBrake : s.rightBrake : s.brake;
    // A caught tip comes free as its hand pulls it at cravatDepth or deeper, or as the whole wing stalls.
    const tip = side < 0 ? s.tipL : s.tipR;
    if (tip > 0) {
      const free = Math.max(0, tip - h * ((hand >= R.cravatDepth ? 1 / R.cravatPull : 0) + (stalled ? 1 / R.cravatStall : 0)));
      if (side < 0) s.tipL = free; else s.tipR = free;
    }
    if (diving && along > E.flyingSpeed && alpha + E.frontBrakeIncidence * hand < -R.tuckAngle)
      fold = Math.max(fold, Math.min(R.tuckMax, fold + R.tuck * h));
    if (fold > 0) {
      const air = along > E.inletSpeed && alpha > E.frontAngle ? Math.min(1, along / R.refillSpeed) : 0;
      refold(s, R, side, fold, fold - R.refill * air * h * (1 - (side < 0 ? s.sepL : s.sepR)), yaw);
    } else if (side < 0) s.foldL = fold; else s.foldR = fold;
  }
}

// A half's fold going from `was` to `now` (refilling, or pumped): held at its caught tip's floor, and
// if a big fold opens under cravatFold while the wing yaws toward it (positive yaw is to the left) at
// cravatRate or more, its tip catches in the lines and holds it there.
function refold(s: PhysicalState, R: Readonly<Recovery>, side: number, was: number, now: number, yaw: number) {
  let tip = side < 0 ? s.tipL : s.tipR;
  if (R.cravatFold > 0 && tip === 0 && was >= R.cravatFold && now < R.cravatFold && -side * yaw >= R.cravatRate) {
    tip = 1;
    if (side < 0) s.tipL = tip; else s.tipR = tip;
  }
  const fold = Math.max(now, R.cravatFloor * tip, 0);
  if (side < 0) s.foldL = fold; else s.foldR = fold;
}

/**
 * The line twist over one substep `h` (a wing whose Recovery twists): the pilot turns under the lines
 * with the wing, sprung back to it by the risers in proportion to the load, until the wing stops
 * turning faster than the spring can bring the pilot round with it. Twisted past twistBind the risers
 * bind: the spring goes, they turn stiffly, and only the hands' difference (`kick`, right less left)
 * turns the pilot back. Only the pilot turns: the wing's own motion is untouched, so it can never add
 * energy; it acts back through the brakes it binds (stepPhysics).
 */
export function stepTwist(g: PhysicsBodies, R: Readonly<Recovery>, h: number, kick: number, load: number, attachment: number) {
  const { canopy: c, pilot: p, physical: s } = g;
  const q = c.q;
  // The lines run from the pilot to the canopy's attachment, below its middle.
  const ax = 2 * (q.x * q.y - q.w * q.z) * -attachment, ay = (1 - 2 * (q.x * q.x + q.z * q.z)) * -attachment,
    az = 2 * (q.y * q.z + q.w * q.x) * -attachment;
  const lx = c.pos.x + ax - p.pos.x, ly = c.pos.y + ay - p.pos.y, lz = c.pos.z + az - p.pos.z;
  const length = Math.sqrt(lx * lx + ly * ly + lz * lz);
  if (!(length > 1e-6)) return;
  const rate = (c.omega.x * lx + c.omega.y * ly + c.omega.z * lz) / length;
  // The pilot keeps turning as the wing's own turn changes under it.
  s.twistRate -= rate - s.twistYaw; s.twistYaw = rate;
  const bound = twistBound(R, s.twist);
  const k = R.twistStiff * Math.max(0, load) * (1 - bound), damping = R.twistDamp + R.twistFriction * bound;
  s.twistRate = (s.twistRate + h * (-k * s.twist - R.twistKick * kick * bound) / R.twistInertia) / (1 + h * damping / R.twistInertia);
  s.twist += h * s.twistRate;
  if (Math.abs(s.twist) < 1e-4 && Math.abs(s.twistRate) < 1e-3) s.twist = s.twistRate = 0;
}

/** How bound a line twist of `twist` rad is, from 0 free to 1 all the way, for a wing with `R`. */
export function twistBound(R: Readonly<Recovery> | null | undefined, twist: number) {
  if (!R || !(R.twistInertia > 0)) return 0;
  const t = clamp((Math.abs(twist) - R.twistBind) / R.twistBand, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Starts `kind` on `side` (−1 left, 1 right) at `size` (its own default if not given), between two
 * steps, as the wing itself would have: only what the envelope or a half would set, so the solver
 * carries on from there. Returns false, changing nothing, if the wing cannot have it.
 */
export function induce(g: PhysicsBodies, C: WingTable, kind: Failure, side: number, size?: number): boolean {
  if (!failsBy(C, kind)) return false;
  const s = g.physical;
  switch (kind) {
    case 'frontal':
      // Folded already, to the inflation the size leaves: hands up, it opens as a front collapse does.
      s.wingPhase = WING.frontal; s.recoverySource = 'frontal'; s.folded = true;
      s.inflation = quantize(1 - clamp(size ?? 1 - C.envelope.foldInflation, 0, 1 - C.envelope.foldInflation), C);
      s.separation = s.frontExposure = 0;
      return true;
    case 'stall':
      // As the envelope enters a stall: whatever the hands do next decides how it goes on.
      s.wingPhase = WING.entry; s.recoverySource = 'stall';
      s.stallAge = s.backflyFor = s.releaseExposure = s.stallExposure = 0;
      return true;
    case 'asym': {
      // One half folded as a strike or an instructor's riser folds it; its hand's next pull is a pump.
      const fold = quantize(clamp(size ?? 0.5, 0, 1), C), direct = s.controlMode === 'brakes';
      if (side < 0) { s.foldL = Math.max(s.foldL, fold); s.pumpL = direct ? s.leftBrake : s.brake; }
      else { s.foldR = Math.max(s.foldR, fold); s.pumpR = direct ? s.rightBrake : s.brake; }
      return true;
    }
    case 'deep': {
      // Stalled deep as it came out of a stall: parachutal, until it is flown out on the bar or stalled again.
      const R = C.feel!.recovery!;
      s.wingPhase = WING.exit; s.recoverySource = 'stall'; s.deepStall = 1; s.separation = quantize(R.deep, C); s.inflation = 1;
      s.recoveryFor = s.releaseExposure = s.creep = 0;
      return true;
    }
    case 'cravat': {
      // A tip already caught in the lines, its half held folded at its floor and a little more.
      const R = C.feel!.recovery!, fold = quantize(clamp(size ?? R.cravatFloor + 0.2, R.cravatFloor, 1), C);
      if (side < 0) { s.tipL = 1; s.foldL = Math.max(s.foldL, fold); } else { s.tipR = 1; s.foldR = Math.max(s.foldR, fold); }
      return true;
    }
    case 'twist': {
      // The lines twisted past binding, the pilot turned `side` of the wing (left positive); the wing's turn as it is.
      const R = C.feel!.recovery!;
      s.twist = quantize(-side * (size ?? R.twistBind + R.twistBand), C); s.twistRate = 0;
      const q = g.canopy.q, w = g.canopy.omega, attachment = C.attachment;
      const lx = g.canopy.pos.x + 2 * (q.x * q.y - q.w * q.z) * -attachment - g.pilot.pos.x;
      const ly = g.canopy.pos.y + (1 - 2 * (q.x * q.x + q.z * q.z)) * -attachment - g.pilot.pos.y;
      const lz = g.canopy.pos.z + 2 * (q.y * q.z + q.w * q.x) * -attachment - g.pilot.pos.z;
      const length = Math.sqrt(lx * lx + ly * ly + lz * lz);
      s.twistYaw = quantize(length > 1e-6 ? (w.x * lx + w.y * ly + w.z * lz) / length : 0, C);
      return true;
    }
    case 'spin': {
      // One half's flow gone and the canopy already turning on it, toward that side: hands up, it flies again.
      if (side < 0) s.sepL = 1; else s.sepR = 1;
      const q = g.canopy.q, rate = -side * (size ?? 2);
      // The canopy's own up, about which it turns (positive about up is a turn to the left).
      const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
      const omega = g.canopy.omega;
      omega.x = quantize(omega.x + ux * rate, C); omega.y = quantize(omega.y + uy * rate, C); omega.z = quantize(omega.z + uz * rate, C);
      return true;
    }
    default:
      return false;
  }
}
