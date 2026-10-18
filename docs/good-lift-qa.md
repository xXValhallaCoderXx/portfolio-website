# Good Lift — initial release QA and code review

Local candidate based on `e072513`, reviewed on 18 October 2026. Preview:
<http://localhost:4176/good-lift?sky=1>. No deployment was performed.

## Review and cleanup

The application has one current progress shape, one replay format and one set of
flight fixtures. The review removed:

- Learning migration, migration tombstones and reads of development-version keys.
- The four-bit replay decoder and the history of simulation fingerprints. The initial
  release uses simulation **1**, replay format **1** with five resolved control bits,
  and the single current fingerprint **`af831e72`**.
- Stored-score reconstruction and defaults that silently accepted incomplete board
  rows. Current records carry explicit style and byname fields; bot scores explicitly
  carry zero style. Record creation supplies an empty byname when none was earned.
- The duplicate one-line trick/lift coaching pipeline and its hidden fact collection,
  timers and forecasts. It still contained obsolete frontal-pumping advice. The active
  coach is now the only source of maneuver and recovery instructions. Website travel,
  the arch, boundary and landing navigation remain separate and readable.
- Unused flight fields, ignored controller switches, empty tuning tables, the old
  spin/tip-collapse paths and scripted loop-timing bookkeeping. Actual full stalls,
  backfly, frontals, external strikes and physical inversions remain.
- Depth-only brake-meter escalation. The meter recognizes deliberate deep intent;
  holding normal brake cannot silently request deep input.
- Eight obsolete fixture files and nine superseded QA reports. Three current browser
  fixture files and this receipt replace the development archives.

The review also fixed the reference pilot's remaining frontal-pumping branch:
frontal reopening releases controls, while external strikes retain their distinct
pump recovery. A real generated frontal exercises that distinction in
`flight-recovery.test.js`.

Storage validation, finite-number checks, malformed-link rejection, input limits,
current-version checks and blocked-storage visit memory remain. These protect the
current release from damaged input. There is no data upgrade or migration path.
Reset progress clears current progress and kit; Repeat trick lessons clears only
learning flags. Good Lift's key is `good-lift`, separate from website flight progress.

## Flight and progression

Both manual modes use the same coupled canopy/pilot solver at 60 Hz with four
internal substeps. Normal brake is 0.4 travel; deliberate deep brake is 0.6, using
the existing double-tap-and-hold or X. The five touch buttons remain. Failures have
no altitude or learning gate. Stall and frontal flow are distinct; recovery changes
aerodynamic forces without setting body poses, speed or altitude. Pending style is
lost on failure, banked style survives, and recovery itself earns no style.

The opening cores remain protected until the first 450 m crossing and blend into
ordinary behavior over 45 seconds. Safe NEXT LIFT guidance retains target identity
and three-second thermalling qualification. Pitch and wingover lessons unlock at
500 and 750 m, enter from ordinary useful circling and save learning only after a
fresh matching maneuver banks style. Flight continues, T/Back to lift cancels only
instruction, and interruptions retain the existing safe-entry and retry rules.

Raven attack opportunities and gusts start at 500 m, kettlebells at 700 m. Their
seeded intervals gradually shorten with peak height. Raven warning and collision
windows remain one and three seconds, with one opportunity at a time. Storm damage
starts at 500 m. Learning progress never changes physics or encounter schedules.

## Automated evidence

Final counts, commands, environment and source/build hashes are in
`.artifacts/initial-release/verification.json`. The required commands are `npm test`,
`npm run build`, `npm run check:split`, `npm run build:functions` and
`git diff --check`.

All **792 tests pass**, as do the build, split, function bundle and diff checks.
The suite has 54 fewer cases after retiring compatibility, hidden-hint and unsupported
state tests; the current physical and scoring acceptance gates remain. The frozen
game-source SHA-256 is
`3980d54614e669756547e4b1d08997f376cb39baa6d62644e029b2b0e76dfc7c`.
The build index SHA-256 is
`8dcc35bbf86bd777daf3a18502331a2d333bdf9655c3ca6f81d96e640bf7b7a2`.

The same **33 saved input traces** were replayed against the code before and after
cleanup. Pilot/canopy bodies, energy, maneuver state, style and complete canonical
judged sheets compare exactly. New browser captures use only the release's format
and current data shape:

| Fixture | Flights | Evidence |
| --- | --- | --- |
| `good-lift-chromium.json` | 7 | Complete soaring/ears flights and clean pitch, wingover and inversion |
| `good-lift-lessons-chromium.json` | 16 | Both tricks and circle directions, 0–0.3 s reactions, actual style banks and remembered completion |
| `good-lift-recovery-chromium.json` | 10 | Eight isolated recoveries and two complete launch-to-recovery server-core sheets |

All recordings are generated in Chromium and checked against Node replay. Bodies,
energy and scores compare exactly; derived angular telemetry retains its documented
1e-11/1e-12 normalization. Source digests are checked before and after capture.
The server tests include an actual unassisted terrain landing on the initial
release's Daily Sky, plus duplicates, malformed logs and current-version refusal.

The retained physical gates cover energy, suspension, handling, ridge flight,
gateway access, scoring, deterministic reset and replay. Sixteen stationary/drifting
thermal flights cover both directions and 0–0.3 s reactions. Their current absolute
climb requirement is at least 25.7232 m in forty seconds, replacing the old-version
comparison without relaxing any case's threshold.

Across 32 seeds at each of 0.3, 0.6 and 1 s reactions, visible opening guidance must
reach 450 m within three minutes on at least 29/32 skies with 30 m terrain clearance.
Six real departures near 150, 250 and 350 m lose 20 m before visible guidance must
restore sustained positive climb in useful air within 45 seconds, retaining 30 m
terrain clearance. These requirements remain in `opening-guidance.test.js`.

Real stall/backfly and uncaught-pitch frontal tests cover 0, 0.15, 0.3 and 0.6 s
reactions. They require steady recovery within 30 seconds and 150 m of recovery
height loss, actual descending reverse motion for backfly, real inflation loss and
refill for frontals, and zero recovery style. Premature braking, early stalled
release, catch prevention, low terrain contact, copy/reset and finite energy have
separate coverage. Canonical flights reach the failures from a real guided launch.

## Browser evidence and remaining acceptance

Production-preview checks exercise native keyboard/pointer input in Good Lift and
fjord flight, including normal/deep recognition, ten-second normal holds, release,
catch, ears, simultaneous holders and pause/blur/cancel. Emulated native touch and
desktop keys complete held stall, real backfly, exit and steady recovery.

Four viewports (960×700, 390×844, 844×390 and 320×740) cover the briefing and
21 coach states, including seven recovery states: 88 layout captures. Checks measure
actual positioned HUD children, readable copy and touch targets, document overflow
and coach/control overlap. Native lesson controls preserve held inputs and bodies;
Repeat preserves scores, reload remembers completion, and native Reset clears the
current progress and kit.

Input/lesson fixtures translate both bodies to safe altitude and park hazards;
they do not alter velocities, flight algorithms, gesture clocks or failure state.
Layout fixtures use the source renderer with production markup/styles. Canonical
launch/replay evidence is separate from these input and layout checks.

Physical-device ergonomics, Safari and final player feel remain separate acceptance
steps. Native touch emulation is not physical-phone proof. Deployment and hosted
Daily Sky submission/replay acceptance require matching client and board-function
releases; neither was performed here.
