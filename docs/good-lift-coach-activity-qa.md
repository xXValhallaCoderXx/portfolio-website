# Coach activity and quiet travel — local acceptance

Historical version 7 receipt. [Flight feel v8 QA](good-lift-flight-feel-v8-qa.md) supersedes
its physics, simulation version, storage key and replay acceptance. Its quiet-flight policy
continues, but the counts, timing measurements and screenshots below describe the earlier candidate.

Working candidate on `feature/finalize-game`, based on
`0c816d548fa152cd10dd477ee264b465a6ba09aa`. Not deployed.

## Behavior

Navigation targets and observed activity are separate. Normal travel and straight
thermal fly-throughs stay quiet. Ridge soaring needs 1.5 seconds of useful,
ridge-dominant air, level/climbing motion and a ground course within 30 degrees
of the terrain's tangent. Thermalling needs three qualifying seconds in the same
live source/generation, useful actual source lift, positive smoothed climb and
at least 30 degrees of coherent orbit around its drifting centre.

Vertical speed uses a 0.75-second EMA. Acquisition pauses through dips up to
0.5 seconds, then resets. Confirmed ridge/thermal activities tolerate 1.5/2
seconds of weaker conditions with lower exit thresholds. Turn easing and mixed
lift retain the current activity. Dead/reborn sources, clear departure, unsafe
routes, assistance and flight lifecycle resets invalidate it. An already ridden
useful source does not need the lifetime reserve required of a distant destination.

The stable RIDGE SOARING / THERMALLING header does not change with action,
phase or warning. Legacy lift prompts cannot fill quiet travel. Wind and plate
notices accompany active lift only; warnings can appear independently. Website
navigation and landing hints, actual held controls and earned rewards remain.

Tricks remain reactive. Completion, cancellation and recovery consume old
input/motion evidence; abandoned pitch intent expires. Dangerous unintentional
surges get generic recovery rather than starting a pitch trick.

## Verification

The full suite passes 682/682 tests, zero failed (29.5 seconds). It covers exact
activation boundaries, identity/drift/death, straight passes, acquisition dips,
exit grace, mixed lift, paused/frozen observation, quiet hint/notice routing and
warning-only cards. Twelve actual delayed maneuvers remain quiet for ten seconds
after banking; fresh attempts and physical surge recovery also pass.

Manual thermal entries hand off to visible coaching for 18-second physical
scenarios in both seeded winds and free flight. Thirty-second manual ridge
departures in both winds retain over 47.9 m clearance, finish above 100 m and
include real ridge-only climb. Quiet means no instruction: these checks retain
the pilot's held controls when the coach disappears, rather than following hidden
navigation targets or treating silence as a command to release.

Two existing Chromium v7 inputs replay for 60 seconds with every fixed-step
world, scoring and trace value identical with/without observation. The seven
existing golden recordings and fingerprint `ce25122b` remain valid. Canonical
flight, physics, sky, run-step and simulation-version sources are byte-identical
to the pre-change candidate; version 7 and saved data remain unchanged.

Production build, lazy-loading split, function bundle and whitespace checks pass.
Logs and candidate receipts are under ignored `.artifacts/coach-activity/`.

The fresh production browser pass succeeds with 44 screenshots across 960×700,
390×844, 844×390 and 320×740, with zero page errors. It checks quiet startup,
hidden legacy hints, a brief ridge encounter remaining quiet, sustained physical
ridge activation, native keyboard/pointer/chord/cancel/blur/focused-button input,
and held-state invariance. Renderer fixtures verify stable activity headings,
secondary amber warnings, warning-only cards, visible control symbols and quiet
recommendation clearing while actual held input remains. All layouts clear HUD
and touch targets. The receipt binds this pass to the production build; fixtures
do not substitute for canonical maneuver or scoring proof. Safari and physical
phone frame pacing remain device checks.
