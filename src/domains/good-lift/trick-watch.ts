import type { FlightInput, FlightState } from '../flight/models.ts';
import type { SwingWatch } from './models.ts';
// The trick watch: which move the wing is flying, from the flight alone. It reads the canopy's
// attitude (from its quaternion, never the nose-heading bank, which breaks nose-down), the load on
// the lines, the pilot's air course and the hands, and says when a move is confirmed, when it
// completes another unit (a wingover pair, a spiral's turn, a loop), how far it got (its band),
// what it linked from and whether the energy flowed into it, and when something broke the combo
// off. It writes nothing back to the flight, counts time in whole fixed steps, keeps every
// threshold as a literal (trick-tables.js) and uses no new trigonometry, so a run and its replay on
// any engine see the very same tricks. Nothing is allocated per step.
import { rotate } from '../flight/flight-physics.ts';
import { wingFolded } from '../flight/flight.ts';
import { BREAK, DETECT, LINKS, MOVE, TRICKS } from './trick-tables.ts';

// The watch's own clock (trick-tables.js DETECT): the load's window, how long a spiral's or a
// rotation's conditions may lapse, how long a wingover's energy flows, the hands that read as one
// side pulling, the swing watch's pitch move and a helicopter's catch out of a full stall.
const { loadWindow: LOAD_WINDOW, spiralGrace: SPIRAL_GRACE, rotationGrace: ROTATION_GRACE, flowWindow: FLOW_WINDOW,
  handSide: HAND_SIDE, swingPitch: SWING_PITCH, heliCatch: HELI_CATCH } = DETECT;
// Fixed steps a second, to turn a rate into the turning of one step.
const HZ = 60;
// What a rotation on one half was entered as: a SAT's entry (out of a spiral, a SAT or a helicopter) or a spin.
const ROTATION = Object.freeze({ none: 0, sat: 1, spin: 2 });

/** Band 0–4 of `measure` against a move's four thresholds; descending thresholds mean less is better. */
export function bandFor(move: number, measure: number) {
  const bands = TRICKS[move]?.bands;
  if (!bands || move === MOVE.none) return 0;
  const descending = bands[0] > bands[3];
  let band = 0;
  while (band < 4 && (descending ? measure <= bands[band] + 1e-9 : measure >= bands[band] - 1e-9)) band += 1;
  return band;
}

/** The named link from one move into another within `gap` steps, or 0; a move into itself links only to the other side. */
export function linkFor(from: number, to: number, gap: number, flipped = true) {
  for (const link of LINKS) {
    if (from === to && !flipped) continue;
    if (link.from.includes(from as never) && link.to.includes(to as never) && gap <= link.window) return link.id;
  }
  return 0;
}

/**
 * The watch, made once and reset for every run. `state`, all plain numbers:
 *
 *   steps                fixed steps watched
 *   move, side           the move being flown, or the last one until another starts (MOVE), and its
 *                        side: 1 right, -1 left, 0 for a move with none
 *   units, band, measure its units so far, its best band (0–4) and the measure that reached it
 *   active               1 while it is still going; endedAt the step it ended (its last unit's)
 *   startedAt            the step it began: a spiral's first steep turn, a wingover's first top
 *   instances, unitCount moves confirmed and units completed so far (for whoever counts them)
 *   previous             the move before it; link the named link between them (LINKS id, or 0);
 *                        flow 1 when it began before the energy of the last had settled
 *   breaks, broke        breaks so far and the last one's reason (BREAK)
 *   settled, neutral     steps in a row settled enough to bank, and level enough to end a flow
 *   load                 the line load, filtered over a second (g)
 *   tilt, bankSide       the canopy's up axis against the vertical (cos), and the side it leans
 *   stalling             1 while a deliberate full stall is under way (no break while it lasts)
 *   ready                1 while a spiral is confirmed (a SAT can be pulled out of it), 2 while a
 *                        deliberate full stall has been held (a helicopter can be eased out of it)
 *   spin, saved          1 while a spin (a bail) turns the wing, until both halves fly and it has
 *                        flown calmly; and how many spins have been saved so far
 */
export function createTrickWatch() {
  const state = {
    steps: 0, move: 0, side: 0, units: 0, band: 0, measure: 0, active: 0, endedAt: -1, startedAt: -1,
    instances: 0, unitCount: 0, previous: 0, link: 0, flow: 0, breaks: 0, broke: 0,
    settled: 0, neutral: 0, load: 1, tilt: 1, bankSide: 0, stalling: 0, ready: 0, spin: 0, saved: 0,
  };
  const up = { x: 0, y: 1, z: 0 };
  const loads = new Float64Array(LOAD_WINDOW);
  // What was seen last step.
  let tiltWas = 1, tiltFalling = false, sideWas = 0, airX = 0, airZ = 0, airReady = false;
  let swingMoves = 0, loopsSeen = 0, broken = false;
  // Wingover tops: the last one's side, cosine and step, and the hands' last reversal; and the last
  // step the wing swung steep, to tell when a wingover's energy is spent.
  let topSide = 0, topTilt = 1, topAt = -Infinity, hand = 0, swappedAt = -Infinity, swingAt = -Infinity;
  // The last step the wing leant 80° or more, and to which side: a spiral pulled out of that is asymmetric.
  let steepSide = 0, steepAt = -Infinity;
  // A spiral's run: whether it holds, its side, start, last steep step, arc (rad), lapse, best second
  // of load, mean tilt and whether it was entered steep.
  let spiraling = false, spiralSide = 0, spiralStart = 0, spiralLast = 0, spiralArc = 0, spiralLapse = 0, spiralConfirmed = false;
  let spiralBest = 0, spiralTiltSum = 0, spiralSteps = 0, spiralAsym = false;
  let loadSum = 0, loadIndex = 0, loadFilled = 0;
  // A loop's peak load since its orbit began.
  let loopPeak = 0;
  // A deliberate full stall: stalled steps, backfly steps, when the hands let go, the deepest surge
  // after (deg) and when it turned back; and the pitch rate last step, to see it turn.
  let stallSteps = 0, backflySteps = 0, releasedAt = -1, surge = 0, surgedAt = -1, pitchRateWas = 0;
  // Steps of neutral flight since the last move ended (a flow is lost once this reaches DETECT.neutral).
  let calmSinceEnd = 0;
  // A rotation on one half: what it was entered as (ROTATION), when, the steps it met the SAT's
  // conditions and turned fast enough to spin, whether its SAT is confirmed, its turning since (rad),
  // its rate summed for the mean, and its last turning step and lapse. A helicopter's steps, turning,
  // flatness summed and last step. Steps flown calmly since a spin.
  let rotation = 0, rotationStart = 0, satSteps = 0, spinSteps = 0, satOn = false, rotationArc = 0, rateSum = 0, rateSteps = 0;
  let rotationLast = 0, rotationLapse = 0;
  let heliSteps = 0, heliOn = false, heliArc = 0, flatSum = 0, heliLast = 0, heliLapse = 0, calmSinceSpin = 0;

  function clearMemory() {
    topSide = 0; topTilt = 1; topAt = -Infinity; swappedAt = -Infinity; hand = 0; swingAt = -Infinity;
    steepSide = 0; steepAt = -Infinity;
    spiraling = false; spiralConfirmed = false; spiralArc = spiralLapse = spiralSteps = spiralTiltSum = spiralBest = 0; spiralAsym = false;
    loopPeak = 0; stallSteps = backflySteps = 0; releasedAt = surgedAt = -1; surge = 0; state.stalling = 0;
    rotation = 0; satOn = false; satSteps = spinSteps = rotationLapse = 0; rotationArc = rateSum = rateSteps = 0;
    heliOn = false; heliSteps = heliLapse = 0; heliArc = flatSum = 0;
  }

  function reset() {
    Object.assign(state, { steps: 0, move: 0, side: 0, units: 0, band: 0, measure: 0, active: 0, endedAt: -1, startedAt: -1,
      instances: 0, unitCount: 0, previous: 0, link: 0, flow: 0, breaks: 0, broke: 0,
      settled: 0, neutral: 0, load: 1, tilt: 1, bankSide: 0, stalling: 0, ready: 0, spin: 0, saved: 0 });
    loads.fill(0); loadSum = loadIndex = loadFilled = 0;
    tiltWas = 1; tiltFalling = false; sideWas = 0; airReady = false; airX = airZ = 0;
    swingMoves = loopsSeen = 0; broken = false; calmSinceEnd = calmSinceSpin = 0;
    clearMemory();
  }

  /** Ends the move in hand, if it is still going, at `at`. */
  function end(at: number) {
    if (!state.active) return;
    state.active = 0; state.endedAt = at; calmSinceEnd = 0;
  }

  /** A move confirmed at `start`: linked to the one before, flowing if the energy never settled. */
  function begin(move: number, side: number, start: number, units: number, measure: number) {
    const previous = state.move, ended = state.active ? start : state.endedAt;
    end(start);
    const gap = Math.max(0, start - ended);
    const link = previous ? linkFor(previous, move, gap, side !== state.side) : 0;
    const within = link ? LINKS[link - 1].window : FLOW_WINDOW;
    state.flow = previous !== 0 && previous !== move && ended >= 0 && gap <= within && calmSinceEnd < DETECT.neutral ? 1 : 0;
    state.previous = previous; state.link = link;
    state.move = move; state.side = side; state.startedAt = start; state.units = units;
    state.measure = measure; state.band = bandFor(move, measure);
    state.active = 1; state.endedAt = -1;
    state.instances += 1; state.unitCount += units;
  }

  /** Another unit of the move in hand, reaching `measure`. */
  function unit(measure: number) {
    state.units += 1; state.unitCount += 1;
    const band = bandFor(state.move, measure);
    if (band > state.band) { state.band = band; state.measure = measure; }
  }

  /** Something took the wing: the combo in hand is lost (a bail) or dropped (ears, assistance). */
  function interrupt(reason: number) {
    if (!broken) { state.breaks += 1; state.broke = reason; }
    broken = true;
    if (state.active) end(state.steps);
    clearMemory();
  }

  /**
   * One fixed step of the flight `g` (stepped already), with the hands `controls`, `struck` while a
   * raven or a bell has the wing folded, and the run's swing watch (already stepped), whose caught
   * surges are the pitch moves.
   */
  function step(g: FlightState, controls: FlightInput, struck: boolean, swing: SwingWatch['state']) {
    state.steps += 1;
    const now = state.steps;
    // The canopy's attitude, side and the load, filtered over a second.
    rotate(up, g.canopy.q, 0, 1, 0);
    const tilt = up.y;
    const vx = g.pilot.vel.x - (g.windX ?? 0), vz = g.pilot.vel.z - (g.windZ ?? 0);
    const speed = Math.sqrt(vx * vx + vz * vz);
    const lean = speed > 0.5 ? (up.x * -vz + up.z * vx) / speed : 0;
    const side = lean > 0.05 ? 1 : lean < -0.05 ? -1 : 0;
    // The air course turned this step (rad, right positive): a cross product, small at 60 Hz.
    let turned = 0;
    if (airReady && speed > 0.5) {
      const was = Math.sqrt(airX * airX + airZ * airZ);
      if (was > 0.5) turned = (airX * vz - airZ * vx) / (was * speed);
    }
    airX = vx; airZ = vz; airReady = true;
    loadSum += g.load - loads[loadIndex]; loads[loadIndex] = g.load; loadIndex = (loadIndex + 1) % LOAD_WINDOW;
    loadFilled = Math.min(LOAD_WINDOW, loadFilled + 1);
    state.load = loadSum / loadFilled;
    state.tilt = tilt; state.bankSide = side;
    const lineHangs = -(g.physical.lineY ?? -1);
    // The hands: which side pulls the more, and when that last reversed.
    const direct = controls.controlMode === 'brakes';
    const left = direct ? controls.leftBrake ?? 0 : 0, right = direct ? controls.rightBrake ?? 0 : 0;
    const pulling = direct ? right - left > HAND_SIDE ? 1 : left - right > HAND_SIDE ? -1 : 0 : Math.sign(controls.turn ?? 0);
    if (pulling !== 0 && pulling !== hand) { if (hand !== 0) swappedAt = now; hand = pulling; }

    // Neutral and settled flight.
    const neutral = tilt >= DETECT.neutralTilt && Math.abs(g.pitch) <= DETECT.neutralPitch &&
      g.load >= DETECT.neutralLoad[0] && g.load <= DETECT.neutralLoad[1];
    state.neutral = neutral ? state.neutral + 1 : 0;
    if (!state.active) calmSinceEnd = neutral ? calmSinceEnd + 1 : Math.max(calmSinceEnd, 0);

    // What breaks a combo off: assistance and ears drop it; a tuck, a strike, lines twisted, a half
    // folded (a glider's, wing-folds.js) or a stall not asked for lose it.
    const deliberate = !!g.stall && (state.stalling === 1 ||
      Math.min(left, right) >= DETECT.hands && Math.abs(left - right) <= DETECT.even);
    const reason = controls.steered ? BREAK.assisted : g.tuck > 0 ? BREAK.tuck : struck ? BREAK.strike :
      g.twisted > 0 ? BREAK.twist : wingFolded(g) ? BREAK.fold :
        g.stall > 0 && !deliberate ? BREAK.stall : g.ears > 0.01 ? BREAK.ears : BREAK.none;
    if (reason) {
      interrupt(reason);
      state.settled = 0; state.ready = 0;
      tiltWas = tilt; sideWas = side; loopsSeen = g.loops; swingMoves = swing.moves;
      return;
    }
    broken = false;

    // Pitch: the swing watch's caught surge, a move of its own.
    if (swing.moves > swingMoves) {
      if (swing.moveKind === SWING_PITCH) {
        begin(MOVE.pitch, 0, now, 1, Math.round(swing.moveSize * 180 / Math.PI));
        state.band = swing.moveBand;
        end(now);
      }
      swingMoves = swing.moves;
    }

    // A deliberate full stall, and the tail slide it can become: held, let go, and its surge caught —
    // turned back with the wing still open, and still open a second later.
    const separated = g.wingPhase === 'stall-entry' || g.wingPhase === 'full-stall' || g.wingPhase === 'backfly';
    if (g.stall > 0 && (separated || state.stalling)) {
      if (!state.stalling || separated && releasedAt >= 0 && Math.min(left, right) >= DETECT.hands) {
        if (!state.stalling) stallSteps = backflySteps = 0;
        state.stalling = 1; releasedAt = surgedAt = -1; surge = 0;
      }
      // A helicopter's steps are its own, not the stall's.
      if (separated && !heliOn) stallSteps += 1;
      if (g.wingPhase === 'backfly' && !heliOn) backflySteps += 1;
    }
    if (state.stalling) {
      if (releasedAt < 0 && Math.max(left, right) <= DETECT.release) { releasedAt = now; surge = 0; surgedAt = -1; }
      if (releasedAt >= 0) {
        surge = Math.max(surge, -g.pitch * 180 / Math.PI);
        if (surgedAt < 0 && g.stall === 0 && g.pitch < 0 && pitchRateWas < 0 && g.pitchRate >= 0) surgedAt = now;
        if (surgedAt >= 0 && now - surgedAt >= LOAD_WINDOW) {
          if (stallSteps >= DETECT.hold) {
            const move = backflySteps >= DETECT.backfly ? MOVE.tailslide : MOVE.stall;
            begin(move, 0, now - stallSteps, 1, Math.round(surge));
            end(now);
          }
          state.stalling = 0; stallSteps = backflySteps = 0; releasedAt = surgedAt = -1; surge = 0;
        } else if (now - releasedAt > DETECT.exit) {
          state.stalling = 0; stallSteps = backflySteps = 0; releasedAt = surgedAt = -1; surge = 0;
        }
      }
    }
    pitchRateWas = g.pitchRate;

    // Loops: each orbit the wing counts, its band the peak load since the last.
    loopPeak = Math.max(loopPeak, g.load);
    if (g.loops < loopsSeen) loopsSeen = g.loops;
    if (g.loops > loopsSeen) {
      for (; loopsSeen < g.loops; loopsSeen++) {
        begin(MOVE.loop, Math.sign(g.physical.lastOrbitAngle) || 1, now, 1, Math.round(loopPeak * 100));
        end(now);
      }
      loopPeak = 0;
      topSide = 0; topAt = -Infinity;
    }

    // Rotations on one half: which half is separated (and the other not), how fast the canopy turns on
    // itself, and whether pilot and wing go opposite ways round an axis between them.
    const s = g.physical;
    const leftOff = s.sepL >= 0.5, rightOff = s.sepR >= 0.5;
    const half = leftOff === rightOff ? 0 : leftOff ? -1 : 1;
    const rate = Math.abs(g.canopy.omega.y);
    const between = vx * (g.canopy.vel.x - (g.windX ?? 0)) + vz * (g.canopy.vel.z - (g.windZ ?? 0)) < 0;

    // Helicopters: eased out of a deliberate full stall, the canopy turning flat on itself, its inner
    // tip flying backwards and its outer forwards. The full stall it came out of is a move of its own.
    if (state.stalling && separated && half !== 0 && rate >= DETECT.heliRate && tilt >= DETECT.heliTilt &&
      s.sideAlongL * s.sideAlongR < 0) {
      heliSteps += 1; heliLast = now; heliLapse = 0; flatSum += tilt;
      const flatness = Math.round(flatSum / heliSteps * 1000);
      if (!heliOn && heliSteps >= DETECT.heliHold) {
        const start = now - heliSteps + 1;
        // The stall first, the helicopter at the next step: whoever counts moves sees one a step.
        if (stallSteps >= DETECT.hold) {
          begin(backflySteps >= DETECT.backfly ? MOVE.tailslide : MOVE.stall, 0, start - stallSteps, 1, HELI_CATCH);
          end(start);
          stallSteps = backflySteps = 0;
        } else {
          begin(MOVE.heli, half, start, 1, flatness);
          heliOn = true; heliArc = 0; stallSteps = backflySteps = 0;
        }
      } else if (heliOn) {
        heliArc += rate / HZ;
        if (1 + Math.floor(heliArc / DETECT.unit) > state.units) unit(flatness);
        else if (bandFor(MOVE.heli, flatness) > state.band) { state.band = bandFor(MOVE.heli, flatness); state.measure = flatness; }
      }
    } else if (heliSteps > 0 && ((heliLapse += 1) > ROTATION_GRACE || !state.stalling || !separated)) {
      if (heliOn) end(heliLast);
      heliOn = false; heliSteps = heliLapse = 0; heliArc = flatSum = 0;
    }

    // SATs and spins, on a wing flying again: entered out of a spiral, a SAT or a helicopter, a
    // rotation is a SAT's entry, confirmed once it turns fast enough with the pilot swung out round an
    // axis between pilot and wing; any other, or one that never settles into a SAT, is a spin.
    if (!state.stalling && half !== 0) {
      if (!rotation) {
        const out = state.move === MOVE.spiral || state.move === MOVE.asym || state.move === MOVE.sat || state.move === MOVE.heli;
        const recent = state.active || state.endedAt >= 0 && now - state.endedAt <= DETECT.satAfter;
        rotation = out && recent ? ROTATION.sat : ROTATION.spin;
        rotationStart = now; satSteps = spinSteps = 0; satOn = false; rotationArc = rateSum = rateSteps = 0;
        if (spiraling) {
          if (spiralConfirmed) end(spiralLast);
          spiraling = false; spiralConfirmed = false; spiralArc = 0;
        }
      }
      rotationLast = now; rotationLapse = 0;
      rateSum += rate; rateSteps += 1;
      if (rate >= DETECT.spinRate) spinSteps += 1;
      if (rotation === ROTATION.sat) {
        const measure = Math.round(rateSum / rateSteps * 100);
        if (rate >= DETECT.satRate && lineHangs <= DETECT.satLine && between) satSteps += 1;
        if (!satOn && satSteps >= DETECT.satHold) {
          begin(MOVE.sat, half, rotationStart, 1, measure);
          satOn = true; rotationArc = 0;
        } else if (satOn) {
          rotationArc += rate / HZ;
          if (1 + Math.floor(rotationArc / DETECT.unit) > state.units) unit(measure);
          else if (bandFor(MOVE.sat, measure) > state.band) { state.band = bandFor(MOVE.sat, measure); state.measure = measure; }
        } else if (now - rotationStart >= DETECT.satSettle) rotation = ROTATION.spin;
      }
      if (rotation === ROTATION.spin && !state.spin && spinSteps >= DETECT.spinHold) {
        interrupt(BREAK.spin);
        rotation = ROTATION.spin; rotationLast = now;
        state.spin = 1; calmSinceSpin = 0;
      }
    } else if (rotation && (rotationLapse += 1) > ROTATION_GRACE) {
      if (satOn) end(rotationLast);
      rotation = ROTATION.none; satOn = false; satSteps = spinSteps = rotationLapse = 0; rotationArc = rateSum = rateSteps = 0;
    }
    // A spin is saved once both halves fly, the canopy has stopped turning and the wing has flown so a
    // while: open and flying, if still surging.
    if (state.spin) {
      const calm = half === 0 && rate < DETECT.spinRate && (g.wingPhase === 'flying' || g.wingPhase === 'exit-surge');
      calmSinceSpin = calm ? calmSinceSpin + 1 : 0;
      if (calmSinceSpin >= DETECT.saved) { state.spin = 0; state.saved += 1; }
    }
    state.ready = spiraling && spiralConfirmed && !rotation ? 1 :
      state.stalling && separated && !heliOn && stallSteps >= DETECT.hold && Math.min(left, right) >= DETECT.hands ? 2 : 0;
    if (state.stalling || rotation || state.spin) {
      spiraling = false; spiralConfirmed = false; spiralArc = 0;
      tiltWas = tilt; sideWas = side; tiltFalling = false;
      state.settled = 0;
      return;
    }
    if (tilt <= DETECT.asymTop && side !== 0) { steepSide = side; steepAt = now; }

    // Spirals: steep, loaded and turning the way the wing leans, for half a turn to confirm.
    const steep = tilt <= DETECT.spiralTilt && g.load >= DETECT.spiralLoad && side !== 0 && turned * side > 0 &&
      lineHangs > 0 && g.wingPhase === 'flying';
    if (steep && (!spiraling || side === spiralSide)) {
      if (!spiraling) {
        spiraling = true; spiralSide = side; spiralStart = now; spiralArc = 0; spiralConfirmed = false;
        spiralBest = 0; spiralTiltSum = 0; spiralSteps = 0;
        // A spiral pulled out of the wing already leaning 80° or more its way is an asymmetric spiral.
        spiralAsym = steepSide === side && now - steepAt <= DETECT.asymAfter;
      }
      if (now - spiralStart <= LOAD_WINDOW && tilt <= DETECT.asymTop) spiralAsym = true;
      spiralLapse = 0; spiralLast = now;
      spiralArc += turned * side; spiralTiltSum += tilt; spiralSteps += 1;
      if (loadFilled >= LOAD_WINDOW) spiralBest = Math.max(spiralBest, state.load);
      const best = Math.round(Math.max(spiralBest, state.load) * 100);
      if (!spiralConfirmed && spiralArc >= DETECT.confirm) {
        spiralConfirmed = true;
        const asym = spiralAsym && spiralTiltSum / spiralSteps <= DETECT.asymTilt;
        begin(asym ? MOVE.asym : MOVE.spiral, side, spiralStart, 1, best);
      } else if (spiralConfirmed) {
        const units = Math.max(1, Math.floor(spiralArc / DETECT.unit));
        if (units > state.units) unit(best);
        else if (bandFor(state.move, best) > state.band) { state.band = bandFor(state.move, best); state.measure = best; }
      }
    } else if (spiraling && (spiralLapse += 1) > SPIRAL_GRACE) {
      if (spiralConfirmed) {
        end(spiralLast);
        // The spiral's held bank is the first top of any wingover swung out of it.
        topSide = spiralSide; topTilt = spiralTiltSum / spiralSteps; topAt = spiralLast;
      }
      spiraling = false; spiralConfirmed = false; spiralArc = 0;
    }

    // Wingovers: tops of the tilt on alternating sides, each pair driven by a reversal of the hands.
    // A steep loaded swing begins a spiral that is not one until it is confirmed: its tops still count,
    // and a pair of them ends it.
    if (!spiralConfirmed && tiltFalling && tilt > tiltWas && tiltWas <= DETECT.firstTop && tiltWas > DETECT.maxTop && sideWas !== 0) {
      const at = now - 1;
      const pair = topSide === -sideWas && at - topAt <= DETECT.gap && swappedAt >= topAt - 30 &&
        tiltWas <= DETECT.top && topTilt <= DETECT.firstTop;
      if (pair) {
        // Swung back off its lean, with the hands reversed between: a wingover, not the spiral it might have become.
        if (spiraling) { spiraling = false; spiralArc = 0; }
        const lower = Math.max(tiltWas, topTilt);
        const degrees = lower <= DETECT.topBands[3] ? 80 : lower <= DETECT.topBands[2] ? 70 : lower <= DETECT.topBands[1] ? 60 : 50;
        if (state.active && state.move === MOVE.wingover) unit(degrees);
        else begin(MOVE.wingover, 0, topAt, 1, degrees);
      }
      topSide = sideWas; topTilt = tiltWas; topAt = at;
    }
    if (tilt <= DETECT.firstTop) swingAt = now;
    // A wingover lasts while the wing keeps swinging steep: its energy can still carry into the next move.
    if (state.active && state.move === MOVE.wingover && now - topAt > DETECT.gap && now - swingAt > FLOW_WINDOW) end(Math.max(topAt, swingAt));
    tiltFalling = tilt < tiltWas || (tilt === tiltWas && tiltFalling);
    tiltWas = tilt; sideWas = side;

    // Settled enough to bank: little tilt and steady, with no move under way.
    const settled = !state.active && !spiraling && tilt >= DETECT.settleTilt && Math.abs(g.pitch) <= DETECT.settlePitch &&
      state.load >= DETECT.settleLoad[0] && state.load <= DETECT.settleLoad[1] &&
      Math.abs(g.rollRate) <= DETECT.settleRate && Math.abs(g.pitchRate) <= DETECT.settleRate && g.wingPhase === 'flying';
    state.settled = settled ? state.settled + 1 : 0;
  }

  reset();
  return { step, interrupt, reset, get state() { return state; } };
}
