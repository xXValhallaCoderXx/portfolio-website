# Earlier islands and raven-led thermalling — local QA

Local candidate based on `297607c52ccccf2ccced1db8043442640ee9ef85`, 18 October 2026.
Preview: <http://localhost:4177/good-lift?sky=1>. No deployment was performed.

Commands, source/build/asset hashes and fixture receipts are recorded in
`.artifacts/raven-flow/verification.json`. Detailed browser measurements are in
`browser.json` and `native-flow.json` in that directory.

## Delivered behavior

The alpine shelf fades in at 100–200 m, ruins at 200–300 m and split crags at 300–400 m.
Their loads begin on run entry, at 150 m and at 250 m. The first shelf sits ahead of the
gate, with its base at 180 m; the other early bases are 260 and 340 m. All three designs
are fully revealed by 400 m in normal detail. The existing performance fallback keeps
at most two hero islands visible.

Twelve fixed, visually seeded world placements reuse the same three model views. Existing
higher placements, cloud sea, mountains, moon and aurora remain. A reused view fades completely
before moving to its next placement. Model load failures remain isolated; no new assets,
textures, shadows or model instances were added.

Each flock sets its thermal's preferred circle direction. Normal centering asks for that
turn with normal brake, or easing the direction while keeping brake. Its bounded forecast
compares seven turn/ease/resume sequences on a private wing. Opposite traffic first receives
LEVEL THE TURN before establishing the flock's direction. Approach, transfer and recovery
instructions retain their separate steering choices.

The opening flock starts in the launch's safe wind-dependent direction. The same random draw
is still consumed, preserving subsequent seeded layout. The coach keeps useful opening lift
through overlap until the existing first 450 m crossing. This prevents an early handoff from
pulling the player out of an established circle. Later flocks retain their seeded directions.
Thermalling still requires the existing three seconds of observed flight.

The shared fixed-step sky observes actual orbit and course changes around drifting cores.
It retains one useful source through overlap; a source contributing 20% more lift must persist
for one second to replace it. Source generation, relocation, death and departure reset pressure.
The flock-free launch source has no traffic penalty.

Three seconds of coherent opposite circling activates pressure. Neutral gaps up to 0.5 seconds
freeze accumulation; longer gaps reset it. Matching flow for 0.5 seconds clears pressure.
Only above the existing 500 m hazard floor does opposing traffic advance the seeded raven
encounter clock at 1.5 times its normal rate. Matching traffic keeps the baseline schedule.
Physical recovery, shield, cloud cover and assisted boundary steering disable extra pressure.
The full one-second warning, three-second contact window, collision geometry and strike
effects are retained. Pressure itself causes no damage.

## Replay and saved progress

Simulation version is **2**, with fingerprint **`a4e8e954`**. Recording format remains **1**,
with the same five resolved control bits. Existing version checks reject older-rule replays;
Daily Sky and board keys distinguish the new rules. Saved progress, lessons, unlocks and worn
kit retain their existing keys and shape.

Fresh Chromium receipts cover seven soaring/maneuver traces, sixteen lesson traces and ten
recovery traces. Browser and Node/server results are compared before promoting their fixtures.
The deliberate canonical failure setup waits for an inward heading through ordinary flight
before inducing its stall or frontal, retaining its clearance and unassisted-recovery gates.

## Verification

- `npm test`: **822 passed**, zero failures, cancellations or skips. This includes
  flight handling, energy, scoring, progression, recovery, recording and server replay gates.
- The opening sweep reaches 450 m within three minutes on **32/32** skies at 0.3 s reactions,
  **32/32** at 0.6 s and **30/32** at 1 s. All exceed the existing 29/32 requirement and retain
  at least 30 m terrain clearance. Deliberate 20 m departures at 150, 250 and 350 m recover
  through visible instructions without boundary assistance.
- **33 fresh Chromium recordings** match Node/server replay, including recovered tricks,
  remembered lessons, full soaring sheets and physical stall/frontal recovery.
- Eight additional input-following traces cover both circle directions, fixed/moving cores
  and still air/2 m/s relative crosswind. All retain positive net climb with zero reversed
  CIRCLE requests and zero stalls. Crosswind can require an explicit transfer and rejoin.
- `npm run build`, `npm run build:functions`, `npm run check:split` and `git diff --check` pass.
  No game-only module leaks into the page bundle.
- **79 production-browser captures** include 64 cardinal views on desktop and phone at
  150, 200, 300, 400, 500, 1,000, 1,500 and 2,000 m. Nine layout/warning checks cover
  960×700, 390×844, 320×740 and 844×390, including emulated native touch.
- Sustained air changes register in **0.36–0.82 s** during ordinary native-input circling
  in either direction. Feedback appears before thermalling qualification; pause/map freeze
  its history, and urgent warnings/lessons hide it. Reset, reduced motion, bloom-disabled
  rendering and an intentionally failed ruins load pass.
- Four additional native-keyboard traffic trials cover both flock directions, matching and
  opposing circles. Six captures show the LEVEL THE TURN cue and the later raven warnings.
  Pressure begins after coherent flight earns its three-second grace; warnings retain their
  lead time, hide the air meter and fit above the controls.
- Repeated climbs retain **101 geometries, 37 textures and 60 programs**. Pools stay bounded
  at three visible heroes/eight cloud banks, or two/two under the performance fallback.
- There are **zero page errors**. The single expected failed model request leaves flight
  and remaining scenery usable.
- Twenty handling, air, scoring, activity, recovery, recording, storage and lesson source
  files are byte-identical to the base revision. Their hashes are retained in the receipt.

Runtime source digest: `873d566370fe683cfcddde1e493f250403654fea819238da1d8ba2ad6a460998`.
Build index SHA-256: `c19c6ccce9bb1b1e213a717ca81017c4fbbe73c2733194c354e487c3ae46f917`.
Environment: Node v24.21.0, Chromium 143.0.7499.4.

Physical-device acceptance and deployment remain separate. Phone evidence uses browser
emulation. Scenery captures translate both bodies during paused setup; native traffic checks
arrange a controlled thermal before circling and leave the bodies and held controls alone
during measurement. Those setup trials are separate from the canonical replay fixtures.
