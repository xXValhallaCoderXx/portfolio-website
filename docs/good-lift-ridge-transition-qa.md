# Ridge climb and thermal transition — v9 local acceptance

Candidate on `feature/finalize-game`, based on `0c816d548fa152cd10dd477ee264b465a6ba09aa`.
Local changes only; not deployed. This supersedes the v8 air-field, storage and replay receipts.
The v8 pitch controls, coordinated turns and maneuver scoring are retained.

## Behavior

Ridge updraft gain increases from 0.95 to 1.10, keeping the 3.5 m/s ridge maximum and
crest-relative height limit. Lift still requires wind entering a broad terrain face; wind
reversal removes that lift. Flat terrain and parallel wind do not become lift sources.
Terrain-air sampling uses 16 m neighborhoods on cache bounds aligned about the world origin.
This smooths small terrain variations without changing collision terrain, the physical wing,
thermal shape, wind direction or the thermal lifetimes. Mirrored profiles retain symmetry.

A new read-only forecast accompanies confirmed ridge advice. It reports approximately how
much more height is needed, or that a thermal is within reach and its relative direction.
It accounts for initial alignment, ambient headwind, drifting sources, terrain under the wing,
rising fog, clouds, arena limits, source lifetime and 25 m for entry, with an 8 m margin to
prevent the ready message flickering. Positive en-route lift is not required or credited.
The forecast includes a continuous join into a sampled capture circle. It refreshes every
half second; source invalidation and material wind changes interrupt its cache.

Readiness is advisory. It never steers or creates lift. The header and ridge steering action
remain stable; a three-second actual thermal lock is still needed for THERMALLING. Quiet
travel and the 1.5-second ridge qualification remain. Optional plate news yields to transfer
readiness; wind changes and urgent warnings keep their priority.

There is no altitude lock separating a ridge stage from a thermal stage. The 150 m GOOD LIFT
lines bank the bar; plates are optional bonus weight. Thermals can be entered below 200 m.

## Physical verification

Five ridge/transition regressions cover six straight 60-second passes, repeated coarse digital
passes with two outward brake turns, wind reversal and four actual launch-to-thermal routes.
In the repeated weak western route, the final field gains 12.54 m in a minute; the previous
field lost about 4.83 m under the same controls. The eastern route gains 64.05 m. These cases
use no thermals, stalls or boundary intervention to support the ridge climb.

Actual seeded starts in both wind directions, departing after 15 or 25 seconds, capture the
intended moving hunted thermal within 32.1–40.8 seconds. They retain at least 47.93 m of terrain
clearance, spend at most 5.45 m during the crossing, and finish at 230–275 m after one minute.
They use digital manual controls and no assistance or pose changes. Three brief initial air-entry
stall frames occur in eastern launches; there is no sustained stall, fold or later stall on entry.

Eight pure readiness tests cover drift, wind, alignment and capture budgets, terrain under a
wingtip or on the circle join, fog, clouds, arena limits, lifetime, source identity, hysteresis,
cache cadence and read-only operation. Guide and routing tests verify qualification, low/ready
copy, target loss, stable activity and optional plate priority. Dense mirrored-profile checks
and the existing full terrain continuity sweep pass without increasing the allowed field change.

The full suite passes **732/732**, zero failed (19.99 seconds). Production build, source/build
split, server verifier bundle and whitespace checks pass.

Seven freshly captured Chromium v9 records replay in Node: four complete weather flights
(about 380–403 seconds), including opposite wind and ears/reopening, and three recovered
physical maneuvers. Judged sheets, barograms, authoritative bodies, energy and observers match
exactly. Derived bank/pitch readouts retain the existing 1e-12-radian snapshot precision.
The v7/v8 fixtures remain historical.

Simulation version 9 uses fingerprint `d1c1b692` and fresh `good-lift-v9` competitive progress.
The shared reset key agrees with the store; fjord progress retains its own key. Old competitive
results are not migrated, and old-version logs cannot be judged under the new air field.
Hosting and its world-board verifier must be released together; neither has been deployed.

Fresh production browser checks pass with 24 screenshots at 960×700, 390×844,
844×390 and 320×740, with zero page errors. Both seeded ridge setups show real
readiness budgets under RIDGE SOARING. Height-needed, ready-left/right and weakening-lift
copy fits and clears the HUD and all five touch targets. Native held-key/chord state and
paused simulation/body/readiness invariance also pass.

Candidate-bound receipts, source/build hashes, field comparisons and browser captures are
under ignored `.artifacts/ridge-transition/verification.json`, `field-audit.json`,
`browser-ui.json` and `browser-goldens.json`. Staged browser positions and renderer fixtures prove presentation,
not launch or capture; the actual-start simulation tests above provide that physical evidence.
Physical-phone frame pacing, Safari and live hosted submissions remain separate checks.
