# Stalls, backfly and frontal recovery — v13 local acceptance

Local candidate on `feature/finalize-game`, based on
`76994200811704f9f46d8cbc2ddfcdcc749edf2a`, checked on 18 October 2026.
Preview: <http://localhost:4176/good-lift?sky=1>. Nothing has been deployed.
The v12 opening, encounters and altitude lessons remain in place.

## Flight behavior

Both manual flight modes use the same coupled canopy/pilot solver. The new
`wing-envelope.js` stores flow separation and inflation; it changes aerodynamic
coefficients at each of the four substeps, without setting a body's pose, velocity,
height or trajectory. Existing energy, suspension and ordinary turn rules remain.
Failures have no minimum altitude or learning requirement.

Normal brake remains 0.4 travel; deliberate deep brake remains 0.6, requested with
the existing double-tap-and-hold or X. A long normal hold never becomes deep.
Stall entry depends on actual brake travel, sustained positive incidence and
air-relative flow. A single released pitch need not stall. Continuing deep input
can separate the flow and hold a full stall. Normal brake can establish a descending
backfly; both canopy and pilot must actually move backward relative to the air
before the stable backfly phase qualifies.

The coach distinguishes approaching separation, a stalled wing still behind the
pilot, held full stall, stable backfly, reattachment and the forward exit surge.
It asks for normal brake to stabilise backfly, release to exit, then a normal catch
after forward flow returns. Braking too early during separated reattachment can
stall again. Releasing while the stalled wing is behind preserves the larger
pendulum swing. High-incidence flow loss after ears or collapse instead asks for
released controls and acceleration; it does not incorrectly request a held stall.

Repeated, uncaught pitching can unload the forward wing at negative inlet incidence
and fold its leading edge. This is distinct from positive-incidence stall. A timely
normal catch can prevent that same flight from folding. The frontal loses real
inflation and lift; released brake and bar permit refill only with inlet airflow,
followed by a surge catch. The hazard-strike pump instruction is retained for external
collapses and is not used to reopen a frontal.

Recovery instructions take priority over trick teaching. A real failure interrupts
an altitude lesson; new lessons wait for attached flight and their usual safe entry.
The existing maneuver observer and scoring formulas are unchanged. Pending style
is lost on failure, banked style survives, and the recovery itself earns no style.
The five touch controls remain. Cloth deformation, the swing cue and sound follow
the physical failure; stable backfly has quieter cloth and no stall shake.

## Simulation and progress boundary

Simulation version **13**, fingerprint **`255b3661`**, starts fresh competitive
progress under `good-lift-v13`. Recording format **2** and all five digital bits
remain unchanged. Older links and records retain their simulation boundary.

Only normalized `pitch` and `wingover` learning flags import from v12, once. Scores,
records, totals, initials and other competitive data do not import. Reset progress
writes a migration tombstone, and Repeat trick lessons writes cleared current flags,
so either action prevents old learning from returning. Blocked-storage visit memory
retains its existing fallback behavior. No saved learning affects seeded physics.

## Physical and replay acceptance

`npm test`: **846 tests passed, zero failed**. `npm run build`,
`npm run check:split`, `npm run build:functions` (27 modules) and
`git diff --check` pass. Command output, environment, current source/build digests
and artifact hashes are recorded in `.artifacts/recovery-v13/verification.json`.
The frozen game-source SHA-256 is
`361249e26bb93b2ea999b1505c4a4acf6003e7f7f48c60da4b843a27535d0d55`;
the built index SHA-256 is
`1a19315792bcd6266a82c8f1916514add944615d660790bcd7b75687dec62850`.

`flight-recovery.test.js` creates each failure through real controls, then follows
only visible recovery instructions. No stall, fold, velocity or wing state is
injected. These isolated tests start at 1,000 m in still air and cover reaction
delays of 0, 0.15, 0.3 and 0.6 seconds:

| Failure | Time to steady recovery | Recovery height loss | Physical evidence |
| --- | --- | --- | --- |
| Full stall and backfly | 12.65–18.98 s | 42.15–71.71 m | At least five seconds of descending reverse flight; no frontal during controlled exit |
| Uncaught pitch frontal | 10.22–12.42 s | 30.60–33.87 m | One actual fold; minimum inflation 0.2083; refill and steady catch |

The stall measurements begin when exiting backfly and exclude the deliberate
five-second stall and five-second backfly setup holds. Frontal measurements begin
when the fold is observed. All finish with inflation 1, no stall/fold, at least one
second of steady recovery, and zero banked or pending style. Separate checks cover
premature braking, an early stalled release, ordinary normal-brake turns, a safe
single pitch, deep-to-normal gesture transitions, copy/reset/prediction isolation,
energy loss and finite suspension at 100, 300 and 1,000 m. A low held stall ends
through actual terrain contact.

Two canonical seed-1 flights climb from the real launch using visible guidance,
level through released controls, manually create a failure and follow recovery.
The stall/backfly run recovers at 152.53 s and 472.81 m; the repeated-pitch frontal
run at 145.95 s and 454.68 m. Minimum terrain clearance is 47.95 m, with no assistance.
Both intentionally quit after recovery and cannot rank.

Fresh Chromium 143.0.7499.4 recordings compare against Node v24.21.0/server-core
replay on Linux:

| Fixture | Flights | Comparison |
| --- | --- | --- |
| `good-lift-v13-chromium.json` | 7 | Complete canonical sheets/barograms plus clean physical maneuvers |
| `good-lift-v13-lessons-chromium.json` | 16 | Ordinary circle through matching maneuver, style bank and remembered lesson; both directions and 0–0.3 s reactions |
| `good-lift-v13-recovery-chromium.json` | 10 | Eight isolated physical recoveries and two complete launch-to-recovery server sheets |

All **33 recordings match**. Canonical sheets, scoring and quantized body state
compare exactly; derived angular telemetry retains the documented 1e-11/1e-12
normalization. Fixture provenance includes source digests checked before and after
capture. The current full replay suite passes after fixture promotion.

## Retained acceptance

The opening pilot follows visible instructions on 32 seeds separately at each
reaction delay. The unchanged gate requires at least 29/32 to reach 450 m within
three minutes, without assistance and with at least 30 m terrain clearance.

| Reaction delay | Reach 450 m | Time range | Minimum terrain clearance |
| --- | --- | --- | --- |
| 0.3 s | 32/32 | 104.35–127.28 s | 47.92 m |
| 0.6 s | 32/32 | 100.75–126.67 s | 47.92 m |
| 1 s | 32/32 | 98.53–119.70 s | 47.92 m |

All six actual-flight departures near 150, 250 and 350 m, in both wind directions,
lose at least 20 m before visible guidance restores one second of positive climb
in useful air. They recover in **11.87–23.10 s**, within the 45 s gate, retaining at
least **37.62 m** terrain clearance and no assistance. Receipts are in
`returns-all.log` and the full suite log.

The sixteen ordinary-circle trick lessons still complete real maneuvers, bank style
and recover without failure. Cancellation, interruption, retries, queueing, safe
entry and remembered completion retain their tests. The pitch reference pilot now
releases its deliberate setup after 1.8 s instead of holding the obsolete 3 s input
through a new stall; its physical completion and quiet-recovery gates are unchanged.

Thirteen opening/weather, ordinary-turn, wind, navigation, physical maneuver,
scoring, recording and brake-gesture files match the starting revision byte for byte
(`unchanged-boundaries.json`). Hazard boundary, seeded interval, warning-window,
reset/replay, handling, energy, ridge, gateway and scoring gates remain in the full suite.

## Browser input, layout and persistence

Production-preview checks exercise keyboard and native pointer brake gestures in
Good Lift and fjord flight: normal holds, deliberate deep input, release/re-press,
X, ears suppression, catch, pause/blur/cancel and simultaneous holders. Ten seconds
of normal hold never requests deep brake. The existing five touch buttons remain.

Four viewports (960×700, 390×844, 844×390 and 320×740) cover the briefing and
21 coach states, including seven recovery states: **88 layout captures**, with
no document overflow, HUD/control overlap or page exceptions. Source-renderer
fixtures use cloned production markup/styles; native interaction checks use built
modules. Native T/button cancellation preserves held controls and bodies; Repeat
preserves scores; reload remembers learning. A production browser migration/reset
check verifies that historical v12 learning cannot reappear after Reset progress.

Native recovery checks translate both bodies to safe altitude and park hazards;
they do not alter velocities, algorithms, control timing or failure state. Those
fixtures complete held stall, real backward flight, exit and steady recovery through
native desktop keys and emulated touchscreen events. Recovery after release takes
12.45 s on desktop and 24.87 s with the touch harness; both finish without assistance
or style. Native touch edges are queued through CDP in order and their actual fixed
simulation clocks confirm the second press falls within 300 ms. Waiting for each
compositor acknowledgement between taps exceeded that window on the test host, so
the harness queues the three events without those waits; the game's gesture clock
and input implementation are unchanged. These are input/rendering checks, with
canonical launch-to-recovery evidence supplied by the separate flights and replays.

## Remaining acceptance

Physical-device ergonomics, Safari and final player feel remain separate playtesting
steps. Native touch emulation is not physical-phone proof. Deployment and hosted
Daily Sky submission/replay acceptance require matching v13 client and board
function releases; neither was performed here.
