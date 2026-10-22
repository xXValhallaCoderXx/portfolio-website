# Shared brake handles and playable acro

Local, uncommitted candidate based on `6b9f7ddf481cf9d332c2becf128249fa177cbe58`, 22 October 2026.
No hosting or function deployment is included.

## Behavior

Outdoor flight and Good Lift share independent progressive brake handles, keyboard controls,
and the existing mouse drag. Mobile handles sit at the lower edges; desktop controls stay
compact beneath the pilot. Lifting one finger releases only that brake. Blur, pause, menus,
orientation changes, restart and exit clear held input; resuming requires a fresh press.
The handle HUD stays visible across mouse, keyboard and touch input. The old drag diagram
and its pause-menu illustration have been removed; canvas mouse dragging still works.

| Keyboard | Canonical normalized brake demands |
| --- | --- |
| A / left arrow, D / right arrow | Gentle side pull: 0.30 / 0 |
| Space / S / down arrow, or both directions | Working bilateral pull: 0.60 / 0.60 |
| Direction + bilateral brake | Inside 0.50 / outside 0.20 |
| W | Gentle bilateral pressure: 0.20 / 0.20 |
| Q / E | Wingover pull: 0.82 on the selected side |
| Shift + selected controls | Full pull: 1.00 on the selected hand(s) |

All sources feed the same direct physical brakes and byte precision. Neither keyboard nor
touch selects the legacy bank controller. Independent pointer owners, source handoffs and
release/capture loss are tested separately from physical maneuvers.

Shallow aerodynamics remain unchanged. Actual smoothed brake depth above 0.70 gradually
increases differential lift authority from 0.065 to 0.65 and eases passive dihedral from
2.0 to 0.4, reaching full authority at 0.95. The canopy, suspended pilot, gravity,
angular damping and passive energy budget remain authoritative; controls cannot add energy.

Good Lift gives the direct wing room to soar: opening cores have a 140 m radius and hunted
cores 110 m, with the existing 5.5 m/s source strength. Their widths account for the direct
wing's roughly 32 m turn radius and crosswind corrections. Approach forecasts, ordinary
turn instructions and keyboard demands agree; established circles retain bilateral brake.
Before a circle qualifies, guidance can follow the useful core actually entered rather than
retaining the launch target through overlapping lift.

Pitch lessons use working brake and observed backswing/forward-surge phases. Wingovers use a
marked swing depth, preparation and reversal cues. Loops require a complete geometric orbit.
Lessons begin at 500 / 750 / 1,000 m, in that order; loop entry additionally requires 400 m
of both terrain and fog reserve, and aborts below 250 m. Expected inversion can progress the
loop lesson; hazards, stalls and inadequate clearance restore recovery guidance.

Free sequences can link repeated pitches, wingovers and mixed moves. Completed motion earns
pending style; one second of stable recovery banks it. Failures lose pending points. The
existing points and multipliers are unchanged; the HUD now distinguishes move count,
chain multiplier and pending points.

Fog retains its first-five-minute rise and then stays capped at 0.55 m/s, reaching about
285 m at ten minutes. Fog contact and the 36,000-step deadline still end and judge runs.

## Compatibility

Simulation version is **4**, fingerprint **fea36d7c**; recording format remains **2**.
Browser and server use the same solver and judging rules. New-version daily seeds and board
partitions are separate. Older challenge links retain the existing version-error response.
Existing local bests, kit and learned pitch/wingover lessons are preserved; loop learning is
added without clearing progress.

## Validation

Physical tests cover normal turns and release, passive energy, false-score prevention,
three linked pitches, three linked wingovers, recovered loops and mixed
pitch → wingover → loop sets. Both directions and reaction delays through 300 ms are covered.
Direct lesson acceptance follows the visible per-hand targets through actual canonical input,
physical completion and recovered style; it does not inject angles, moves or score.

Six actual seeded runs (three skies, 300 / 600 ms reaction delays) follow visible instructions
through canonical direct frames: 450 m within 180 seconds, then 500 m within 220 seconds,
with at least 35 m terrain clearance and no assistance, stalls, tucks or strikes. These tests
do not select hidden routes, relocate bodies or modify the generated weather during flight.
Longer exploratory runs reached 750 m in two cases; none reached 1,000 m. Loop validation is
the separate physical lesson and mixed-move acceptance above, rather than a claim that an
instruction follower reliably completes the full climb through later hazards.

Frozen browser fixtures are captured separately from test execution. Their source manifests
and reproduction commands are stored with the receipts. Tests independently replay the
recorded frames in Node and compare physical bodies, envelope state, events and scores.
Only documented inverse-derived angle telemetry uses bounded cross-engine display precision.

All **61 Chromium-to-Node capture cases** pass across five receipts, including all 24 direct
lesson cases. The native controls matrix passes **six profiles**: desktop, phone portrait,
320 px small phone, short landscape, hybrid input, and injected touch with a fine primary
pointer. These cover independent finger release, real pointer capture, source handoffs,
keyboard working/swing/full travel, pause/blur/resize clearing, and stable control placement.
That flight-tuning matrix has zero page errors and binds its screenshots to the source hashes
recorded before the subsequent HUD cleanup.

Candidate logs, browser captures and screenshots are under `.artifacts/fun-acro-v4/`.
The flight-tuning candidate passed the complete `npm run verify` gate: **994 tests**, browser/server typechecks,
architecture checks, production application and function builds, and bundle separation.
`git diff --check` also passes. Final hashes, commands and outcomes are recorded in
`.artifacts/fun-acro-v4/verification.json`.

The subsequent HUD-only cleanup passes **46 focused input/presentation tests**, typechecks,
architecture checks, the production build, bundle separation and whitespace validation.
Five current-source browser cases cover both flight modes, desktop, short desktop, phone
and touch landscape. They check that mouse clicks, drags, releases, keyboard/touch handoffs
and pause/resume retain the new handles without creating either old diagram. Short views
also verify that the coach clears the handles. The current source hashes and screenshots
are recorded in `.artifacts/flight-hud-only/report.json`; all five cases pass with zero page errors.

Phone coverage uses Chromium touch emulation with native Pointer Events and capture. It does
not establish physical-phone feel, Safari behavior or hosted-deployment acceptance.
