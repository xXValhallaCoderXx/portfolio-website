# Good Lift — light flight cues

The current [shared flight controls and cleanup receipt](flight-controls-qa.md) extends these
cues to outdoor flight. It supersedes this earlier hands-up candidate's preview and verification.

Hands-up refinement based on `e8d53ba`, verified 19 October 2026. Review preview:
<http://localhost:4191/good-lift?sky=1>. No commit, push or deployment performed.

## Presentation and compatibility

TRAVEL is a hollow cyan marker twelve metres ahead along horizontal **ground velocity**.
Its curved arrow reports actual left/right turning from consecutive fixed-step velocity
snapshots, independently of canopy heading, wind-relative track and camera motion.
Visual smoothing has a 0.12-second time constant; reduced motion applies changes immediately.
Flight-view sampling reuses its velocity endpoints and leaves existing pose fields intact.

The marker hides below 2 m/s, during reverse flight, stalls, collapse, inversion, recovery,
assistance, pause, briefing and obstructing menus. Projection rejects points behind the
camera, outside the viewport and beyond the clip planes. HUD, coach, touch controls,
notifications and the active drag diagram reserve their screen space.

Dragging shows an origin, connecting line, live dot, sparse direction labels and cyan/purple
brake regions. The kite-shaped pad extends above the origin into a visible **HANDS UP**
zone labelled “release / slide up”. Its neutral region follows both existing drag equations,
including the dead zone; sliding anywhere in that region demands zero brake on both hands.
Region boundaries use the current dead zone and deep-brake threshold.
The existing brake meters continue to show actual physical travel. Mouse diagrams use the
press origin; touch/pen diagrams prefer a shared offset above the initial finger and stay
inside the safe area. Offset and display saturation never alter gesture coordinates or demands.
Long upward/diagonal pulls keep their true brake demands when the live dot reaches the pad
boundary. Lifting the pointer gives a brief HANDS UP confirmation; a fresh press, cancellation,
keyboard takeover, menu or pause clears it. Confirmation expires after 0.65 seconds.

The outlined coach target uses quantized 0.50/0.20 thermal circles, 0.20/0.20 thermal easing,
0.20/0 ordinary side pulls, 2/3 bilateral working brake, or full bilateral deep brake.
The real coach must accept the suggested pair. Any currently accepted pull fades the target;
the player does not have to hit an exact point. Release targets sit in the upper hands-up zone;
both sliding up and lifting the pointer satisfy the existing release instruction.
Transfer/approach, preparation, warnings, recovery, ambiguous instructions and Bar/Ears
actions suppress targets. Ownership changes and cancellation remove drag feedback immediately.
All added elements are noninteractive and hidden from accessibility navigation.

The solver, coach rules, camera behavior, scoring, recorder, replay, saved progress and
simulation version are unchanged. Simulation **3**, fingerprint **`b9dd2bdb`**, recording
format **2** remain current. The machine receipt compares authoritative runtime files
against the base revision as well as recording the complete candidate source/build digests.

## Verification

**882 tests pass**: 876 core/application/function tests and all six opening/recovery gates.
Fifteen cue cases cover ground versus wind-relative direction, signed turning and compass
wrap, smoothing/reduced motion, speed/reversal and recovery suppression, projection,
teleport history, reusable snapshots, quantized mouse/touch/pen inverses, mirrored and
accepted coach targets, release/ambiguity policy, safe offsets and state immutability.
The hands-up extension checks neutral-zone boundaries and long-gesture display round trips
against the actual mouse/touch/pen mapping; all release targets demand zero on both hands.
Repeated cue reads preserve physical flight, coach observations and recorder contents.

The seeded opening gates retain 32/32 successes with 0.3-second reactions, 32/32 with
0.6-second reactions and 30/32 with one-second reactions; recovery gates pass at 150,
250 and 350 m. Existing Chromium flight, proportional-brake, lesson, recovery, replay
and server-submission fixtures pass. Application build, function build, bundle-split and
diff checks pass.

Browser coverage uses Chromium 143.0.7499.4 on Linux with Node 24.21.0:

| Layout | Viewport | Input | Initial motion preference |
| --- | --- | --- | --- |
| Desktop | 1280 × 800 | Mouse | Standard |
| Phone portrait | 390 × 844 | Native emulated touch | Reduced |
| Small phone | 320 × 740 | Native emulated touch | Standard |
| Phone landscape | 844 × 390 | Native emulated touch | Reduced |
| Hybrid | 1100 × 760 | Mouse and native emulated touch | Standard |

The browser harness starts the real game and uses native pointer capture, moves, releases,
cancellation and keyboard ownership changes. Frozen presentation fixtures then exercise
resolved coach instructions without advancing simulation. Checks cover target visibility,
accepted-range fading, release labels, upward slides, native pointer release and confirmation
expiry/cancellation, warning priority, safe bounds, finger clearance,
behind-camera rejection, menus, pause, cancellation, hybrid switching and dynamic reduced
motion. Repeated full drawing passes leave flight, sky, coach, input and scoring observations
unchanged. The responsive captures use bloom-disabled rendering; the production preview
also receives a smoke check with bloom enabled, mode-exit suppression and an independently
replayed short native flight whose recorded and replayed results match exactly.

Logs, browser checks, screenshots and the candidate-bound machine receipt are retained in
`.artifacts/hands-up/verification.json` and its neighboring ignored files. The test set is
partitioned without omissions: all tests except `opening-guidance.test.js`, then that entire
file separately. Focused reruns cover final presentation refinements.

The frozen-frame hybrid fixture initially missed the coach target on its first draw. A fresh,
uninstrumented page passed the complete mouse/touch check; retain first-drag target appearance
as a device-review check. The diagnostic capture remains beside the final passing captures.

Physical-device, Safari and hosted/release acceptance remain separate from this local review.
