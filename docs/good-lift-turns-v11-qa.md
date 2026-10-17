# Smoother turns and thermal circling — v11 local acceptance

Local candidate on `feature/finalize-game`, based on
`0c816d548fa152cd10dd477ee264b465a6ba09aa`. This builds on the existing uncommitted v10 work.
Preview: <http://localhost:4175/good-lift?sky=1>. Deployment is separate.

## Handling and controls

Hold one direction + normal brake to maintain a tight circle. Briefly easing the direction
requests level flight and widens the circle; reapplying it resumes the same turn. Brake slows
the wing. Rising air provides the climb; deep brake is unnecessary for ordinary thermalling.
The working/deep depths, gestures, recording format 2 and five touch buttons are retained.

The ordinary controller now damps the suspension's measured angular motion, computed from the
pilot's velocity relative to the canopy attachment. Its coefficient starts at **0.3**, increasing
smoothly to **0.4725** as steering eases out (`relativeRelease: 1.575`). The initial constant-0.3
package left excessive rollout rebound, so this small release adjustment was measured against
the rollout and existing ridge-transfer gates. Deep/acro motion excludes this additional damping.
Steering release time doubles; press, reversal and re-press keep their original actuator response.
The coordinated bank target is **0.52 radians**.

`g.trackRate` measures the wrapped rate of the same air-relative heading as `g.track`.
Canonical copies preserve it and settling resets it. Lift-route anticipation, full-arc soaring
forecasts and reference navigation now use matching course/rate telemetry. No wind field,
thermal strength, aerodynamic lift coefficient or maneuver scoring threshold was increased.

## Thermal guidance

The nominal guided radius is 21 m. Source identity, generation, drift and the physical
three-second qualification remain intact. Centre drift and wind compensation use the same
two-second lookahead, avoiding a persistent bias when a core moves with the air.

The default instruction maintains the established circle. A heading lead over 12° must persist
for 0.5 seconds before easing. Ease cues last at least 0.75 seconds, resume the turn when the lead
returns within 3°, and end after at most one second. Each correction is followed by at least
1.25 seconds of maintaining the turn. Source loss, unsafe air and recovery retain precedence.
The cached route forecast uses a copy of the same hysteresis state.

Titles remain `CIRCLE LEFT/RIGHT + NORMAL BRAKE` and `EASE LEFT/RIGHT · KEEP BRAKE` when accepted.
The existing held-control indicators show acceptance. Both instructions retain normal brake
and the established direction; correction never requests the opposite turn. The briefing and
controls explain the distinction between brake, lift and deep input.

## Measured acceptance

From computed settled trim at 2,000 m, both directions produce the same results:

| Measure | Required | Measured |
| --- | --- | --- |
| Working-brake radius, final 10 s of a 40 s hold | 18–23 m | 20.642 m |
| Steady still-air sink | ≤2.3 m/s | 2.294 m/s |
| First 180° of actual air-relative heading | ≤8.6 s | 8.55 s |
| Held-brake rollout heading rebound, observed for 10 s | ≤5° | 4.570° |
| Rollout peak-to-peak pitch excursion | ≤15° | 13.213° |
| Bank below 10°, remaining below it afterward | within 1.5 s | 1.483 s |

Fourteen mirrored release/reapply cases cover 0.25, 0.5, 0.75, 1, 1.25, 1.5 and 2 seconds.
They retain normal brake, prompt steering take, bounded bank/pitch and no stall, loop or acro
activation. Still-air energy remains passive.

Sixteen physical thermal flights cover stationary and drifting 60 m cores, both directions,
and 0, 0.1, 0.2 and 0.3 second reactions. They use the actual unchanged `sampleAtmosphere`
profile and flight solver: eight seconds of manual entry, followed by 40 seconds of following
the confirmed coach. Every case completes at least **2.440 circles**, gains **59.817–62.157 m**,
keeps the same source with no stalls, and makes at most **eight correction-phase changes**.
The lowest height-gain ratio is **216.1% of its v10 baseline**, above the required 90%.
The frozen pre-edit v10 sources independently reproduce the pinned baseline fixture.

Original ridge departure, repeated ridge return and four ridge-to-thermal capture gates pass
without relaxed clearance, stall or climb limits. Eight mirrored wingover and four pitch cases
retain 0–0.3 second reactions, physical completion and steady recovery. Full world-space loops,
gateway entry, finite suspension, energy budgets and render-independent flight also pass.
The 32-sky survey has a 399.2 s median, 31/32 flights within five to eight minutes, 32/32 reaching
the opening banking line, and zero maneuver style from ordinary soaring.

## Replay and local verification

Simulation version **11**, fingerprint **`0d037d63`**, starts fresh `good-lift-v11` competitive
progress. Older progress remains separate. Format 2, five input bits, historical decoding,
storage bounds and explicit refusal of incompatible simulation versions are retained.

Seven new Chromium records in `src/game/fixtures/good-lift-v11-chromium.json` replay identically
in Node: four complete weather flights, one full loop, one wingover and one pitch/catch.
Complete judged sheets and barograms compare exactly. Maneuver bodies, velocities,
orientation, energy and scoring compare exactly; derived bank/pitch retain the established
1e-12-radian cross-platform precision. Fixture provenance includes the Chromium version,
source digest and source-file list. Real-coach replay tests retain exact authoritative state
through varied render/paused reads.

`npm test` passes **781 tests**. `npm run build`, `npm run check:split`,
`npm run build:functions`, and `git diff --check` pass.

The built preview passes native keyboard/pointer checks in both Good Lift and fjord flight:
working holds, deep gestures, X, catches, ears priority, cancellation/reset, and mirrored
turn/ease/re-press/rollout. Normal-turn cases precede deep maneuvers so lingering acro motion
does not contaminate ordinary handling checks. The native gesture harness records event times
and verifies delivery within the unchanged 300 ms double-tap window.

There are **36 screenshots** at 960×700, 390×844, 844×390 and 320×740, with zero page errors.
The briefing and eight cue states fit without overflow or HUD/control overlap. Cue-layout
fixtures use the unmodified source renderer with cloned production markup/styles; native
input fixtures translate the bodies to safe altitude. These establish input and layout behavior;
the canonical flight, climb and replay evidence comes from the physical traces above.

Ignored artifacts under `.artifacts/turns-v11/` contain the frozen v10 baseline, handling and
thermal comparisons, complete logs, browser capture runners, screenshots and candidate hashes.
`verification.json` binds the final checks and browser receipts to the candidate source digest.
The final candidate source SHA-256 is
`7c81af9ecded7f7e119e103354ed884de057dd17dfe18974dfcd2350fe3de997`.

## Release limits

Local simulation and phone-sized Chromium checks do not establish physical-device ergonomics,
Safari behavior or final player feel. Publishing still needs a matching v11 client and board
function, followed by a hosted Daily Sky submission and replay. Nothing has been deployed.
