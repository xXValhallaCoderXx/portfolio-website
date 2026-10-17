# Working and deep brake controls — v10 local acceptance

Historical v10 receipt. Current turn, thermal guidance and replay acceptance is recorded in
[the v11 QA receipt](good-lift-turns-v11-qa.md). Working/deep input gestures remain unchanged.

Candidate: local changes on `feature/finalize-game`, based on
`0c816d548fa152cd10dd477ee264b465a6ba09aa`. Fetching `origin/main` on
2026-10-17 confirmed that base matches main. This receipt describes local source and browser
verification; hosting and the online board have not been deployed.

## Controls

- Hold Space, Down/S, or the existing touch brake for working brake immediately. A long hold
  remains working brake; it does not deepen on a timer.
- Tap, release, then press and hold again within 300 ms to request deep brake. Hold X as a
  keyboard alternative. Release deep brake, then press normally for a working catch.
- Deep releases do not arm another double tap. Aggregate input holders prevent releasing one
  key or pointer from clearing another. Key repeat does not create taps. Pause, blur, pointer
  cancellation and restart clear gesture history.
- Ears take precedence in both game hosts and recordings. A still-held deep gesture may resume
  after ears are released; its deep indication is suppressed while ears own the wing.
- The same five touch buttons remain. The brake button and coach distinguish normal brake,
  deep brake, and the release needed to change depth. Arms follow the physical brake depth.

The working target is 0.40 and the deliberate deep target is 0.60. Those values move the same
physical brake with its existing take/release response. Pitch and lateral maneuvers still use
canopy/pilot forces, suspension, momentum and altitude. Ordinary steering keeps its bank
controller through stronger swings rather than silently changing authority with swing energy.
Explicit deep input opens energetic handling until a real steady recovery or assistance clears it.

## Recording and progression

Simulation version 10 has numeric fingerprint `633ab50d` and fresh `good-lift-v10`
competitive progress. Format 2 records five input bits, including resolved deep intent, so
replays do not reconstruct keyboard/touch gesture timing. Deep aliases normalize to one run
identity while remaining distinct from working brake. Historical format 1 links are decoded at
four-bit width and rejected by replay when their simulation version differs.

All 36,000 fixed steps fit the existing 49,152-character link limit even if input changes every
step. Existing bounds, canonical varint/base64 validation, damaged-link refusal and aggregate
local storage limits remain enforced.

## Physical acceptance

The focused flight checks cover eight mirrored wingover cue-following cases and four pitch
cases with reaction delays of 0, 0.1, 0.2 and 0.3 seconds, real move completion, a steady bank,
and ten further quiet seconds. Full-orbit tests require a world-space rotation and controlled
recovery; changing a displayed bank angle cannot score a loop. Mixed normal/deep input tests
also retain still-air energy and finite-suspension checks.

Ordinary departure, gateway, soaring turns and ridge-to-thermal routes continue using working
brake. The wind field, terrain, weather and maneuver scoring thresholds are unchanged by this
controls revision. The ridge guide now compensates world-course bearings for local wind in both its visible
instructions and cached path forecast. This fixes a route that could drift toward terrain and
lose guidance after its first pass. Thermal circle behavior and activity qualification times
are retained. Deep maneuvers suppress the ordinary lift/soaring-turn card until recovery.

## Local verification

`npm test` passes **755 tests**. `npm run build`, `npm run check:split`,
`npm run build:functions`, and `git diff --check` pass.

Seven freshly computed Chromium records in
`src/game/fixtures/good-lift-v10-chromium.json` replay identically in Node: four complete
weather flights, a physical loop, a wingover cycle and a pitch/catch. Authoritative bodies,
velocities, orientation, energy, scoring and complete run barograms compare exactly; derived
bank/pitch angles use the existing 1e-12-radian cross-platform precision. Maneuvers spend
altitude and bank only after stable recovery.

The paired v9/current field receipt in
`.artifacts/brake-control/soaring-regression.json` retains safe departures, repeated ridge
passes and four actual thermal captures. Six manual guide routes with 0.15–0.30-second response
delays stay airborne with at least 47.93 m terrain clearance, without assistance, deep input or
acro authority.

Ignored local artifacts under `.artifacts/brake-controls-v10/` include the capture runner,
full test/build logs, native browser input/layout receipt, screenshots and a candidate source
hash in `verification.json`. The final production-preview receipt passes in both flight modes with **20 screenshots**
at 960×700, 390×844, 844×390 and 320×740, zero page errors, and checks for working holds, deep gestures, X, catches, ears priority, cancellation/reset behavior and
responsive coach/briefing layouts. A source-server attempt was interrupted by an in-progress
Vite reload; the final preview uses unmodified built modules without HMR.
The final candidate source digest is
`dcca67997e376f2c95c28be003a0c6b336ead81b878ca50e65c5c651b4791f26`.

## Release limits

Phone-sized Chromium checks exercise browser touch/pointer handlers and responsive layout.
They do not establish physical-phone ergonomics, frame rate, Safari behavior, or final player
feel. The user should try ordinary turns, deep pitch setup and working catches on the device
used to play. Publishing requires a matching version 10 client and board function, followed by
an actual hosted Daily Sky submission and replay.
