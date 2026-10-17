# Flight feel v8 — historical local acceptance

Version 9 ridge balance, transfer guidance and current replay acceptance are recorded in
[the ridge transition report](good-lift-ridge-transition-qa.md). The v8 numbers below remain
historical; its still-air control mechanics are retained.

Working candidate on `feature/finalize-game`, based on
`0c816d548fa152cd10dd477ee264b465a6ba09aa`. Local changes only; not deployed.
This receipt supersedes the version 7 physics, timing, storage and replay claims in the
earlier [flight/ridge](good-lift-flight-qa.md), [coach](good-lift-coach-qa.md) and
[activity](good-lift-coach-activity-qa.md) reports. Their screenshots and counts remain historical.

## Flight and controls

Left/right still steer, brake holds a working depth, bar accelerates and ears descend.
Holding brake with one direction requests a coordinated turn; there is no automatic brake,
extra lift or automatic steering. The configured turn enters more promptly, banks less and
uses less height than ordinary steering. It retains physical momentum on release and eases
back to ordinary trim. Energetic motion fades the coordinated configuration so acro keeps
the physical wing and suspension. Canonical reset and prediction copies include this state.

The four-bit recording format is unchanged. Dedicated ears retain their explicit encoding;
the legacy two-arrow chord remains the bar. Under brake that chord is the same effective
flight as brake alone. Run stepping and the physical API ignore ineffective bar flags,
including through a coordinated rollout; duplicate submission detection retains that identity.

Brake response takes/releases over 0.14/0.10-second actuator constants. The pilot and canopy
remain separate physical bodies. Fore-aft response is quicker while retaining a natural
oscillation. Pitch coaching ends shaping at the observed backswing reversal without requiring
a scoring-sized back peak. Deliberate input and observed motion still qualify tricks, and
recovery still needs one actual calm second before style banks.

The upper torso adds the physical signed coordinated lean to its existing steer lean:
each waist/chest joint reaches at most 0.12 rad instead of 0.06 rad. This is an already eased
physical signal, with no additional render timer. It changes posture, not the simulated body
origins, suspension orientation or canopy quaternion. Rest, hero posing and invalid telemetry
clear it. Reduced decorative motion retains this functional posture; the fallback model also
shows mirrored lean at unchanged physical origins.

### Turn measurement

Measured from settled trim at 2,000 m using the unchanged `flight-turn.test.js` procedure:
hold one digital direction until the actual air-relative track accumulates 180 degrees.
Both directions produce the same results, with no stalls. These are complete first-turn
measurements including entry, not steady-state sink figures.

| Input | First 180 degrees | Height change in still air | Peak bank |
| --- | ---: | ---: | ---: |
| Direction only | 9.017 s | −23.821 m | 39.21° |
| Direction + brake | 7.983 s | −16.082 m | 34.75° |

The same procedure against the saved pre-change solver took 9.50 s / 28.813 m of height
for ordinary steering and 8.483 s / 21.001 m with brake. Current still-air height costs are
about 17% and 23% lower respectively; these comparisons use the same initial trim and first
180-degree air-track turn rather than differently timed samples.

The braked turn changes height by −0.115 m in a uniform 2 m/s updraft and +7.868 m in
a uniform 3 m/s updraft. Those probes initialize both bodies with the vertical air velocity.
Actual terrain air must support the arc; horizontal wind or a small rising patch cannot
promise a climbing turn. Still-air maneuvering always spends altitude.

## Quiet coaching and readable cliff air

Travel stays quiet. Existing ridge qualification remains 1.5 seconds of useful along-face
flight; thermalling still needs three seconds of coherent useful circling in one source.
A manual brake turn can receive reactive advice anywhere a read-only physical forecast
supports the complete arc and its exit. It checks terrain and wing footprint, arena margins,
clouds, rising fog, stalls, inversion and height loss. The 18-second forecast includes a
two-second exit and refreshes at quarter-second simulation intervals. It never changes
the real wing or sky.

Advice follows entry, continuing turn and rollout. An already confirmed ridge retains its
RIDGE SOARING header across a supported turn; elsewhere the header is SOARING TURN.
THERMALLING keeps its own identity. A turn cannot preserve ridge activity after actual lift
is lost. Headers stay stable across actions and secondary warnings. No generic progress bar
or extra panel is added. Actual held buttons remain visible when advice disappears.

Thin world-anchored flow ribbons join incoming air, its upward bend against terrain and the
flow over the crest. Traveling arrowheads establish direction. Warm/cool shading follows
sampled rising/sinking air; the visual is not a lift-zone marker. Fixed storage, bounded
sampling and reduced-motion behavior keep the visualization independent of gameplay.
The wind HUD reports local flow destination; the vario reports actual glider climb.

## Rules and persistence

`SIM_VERSION` is 8; its numeric fingerprint is `6fa07dfd`. Old-version recordings are
rejected rather than flown under different physics. Fresh version 8 progress uses
`good-lift-v8`, exported by the import-free `good-lift-key.js` and shared by the store and
lightweight page reset. Competitive progress is not migrated. Reading, recording or clearing
the Good Lift store leaves the fjord's separate `fjord-glider-v1` progress untouched. The
page's explicit global reset continues to clear both stores.

Hosting and the world-board verifier must be released from the same revision. Local results
remain on this device during a verifier-version mismatch. This documentation and the local
checks do not deploy either target or delete previous boards.

## Verification status

Focused groups overlap and must not be added to infer a full-suite total:

- 57 physical/coach checks pass. All eight mirrored wingovers and four pitch moves complete
  with 0–0.3-second reaction delay and stay quiet for ten seconds after banking. Fresh attempts,
  weak pitch reversal and physical recovery remain covered.
- Eight soaring-turn checks pass: mirrored supported turns, quiet unsupported inputs,
  full-arc constraints, bounded forecasts, paused/reset behavior and release cues before activity
  qualification. Four real-terrain return turns follow the semantic instructions with a 0.2-second
  delay on both cliffs at 3 and 3.5 m/s wind; they gain 1.3–9.1 m with no stalls and retain ridge
  identity. Real wind reversals and lift loss withdraw cached support within 0.25 seconds plus
  two fixed ticks and then clear ridge activity.
- 36 parent integration checks pass for gateway, guide and related runtime integration.
- 45 renderer checks pass: 33 glider/model checks and 12 coach-view checks, including doubled
  mirrored torso lean, unchanged physical origins, rollout/rest, reduced motion, fallback,
  stable activity headers, secondary warnings and quiet recommendation clearing.
- 29 targeted storage/reset/control/HTTP checks pass. The legacy chord submission is detected
  as the same flight and returns `409 duplicate`; the existing tests were not weakened.

Final full-suite total: **717/717 PASS**, zero failed (26.64 seconds).

Production build, split check and function bundle: **PASS**, reported for the current
candidate. The split check explicitly allows the import-free shared storage-key leaf;
it does not allow the game store into the page's initial bundle. Final whitespace check:
**PASS**.

Fresh version 8 Chromium/Node replay receipts and promoted fixture validation: **PASS**.
`src/game/fixtures/good-lift-v8-chromium.json` contains four complete flights (380–403 seconds),
including opposite wind and ears/reopening, plus recovered inversion, wingover and pitch moves.
Complete judged sheets, barograms, authoritative body positions/velocities/quaternions, energy
and observer/reward results match exactly. The two derived inverse-trigonometric angle readouts
are recorded at 1e-12-radian precision to remove platform differences of a few last bits;
no authoritative state or scoring comparison is rounded. The historical v7 fixture remains.

Final production browser UI/input acceptance: **PASS**, 64 screenshots and zero page errors.
The fresh production runner is
`.artifacts/flight-feel-v8/browser-ui.mjs`. It covers four viewports (960×700, 390×844,
844×390 and 320×740), native keyboard/pointer ownership, chord/cancel/blur/focused-button
input, quiet startup and ridge qualification, actual coordinated-turn telemetry/body origins
and rollout, held-state invariance, stable activity/warning fixtures and visible control keys.
Short isolated physical samples and cloned renderer fixtures do not prove a canonical launch,
complete guided return, maneuver score or physical-device performance.

Wind rendering acceptance also passes: an isolated no-bloom scene shows incoming, rising
and crest flow; fresh production west-cliff phone/reduced-motion and east-cliff desktop/full-motion
cases render 11/12 active paths with no browser errors. Held rendering preserves both sky and
flow clocks. Fixed geometry adds one draw call, and the CPU-only benchmark adds about
0.08–0.19 ms/frame; this excludes GPU and physical-phone cost.

Candidate logs, captures and source-bound receipts are under ignored
`.artifacts/flight-feel-v8/verification.json`, `browser-ui.json` and `browser-goldens.json`,
with the independent wind receipt under `.artifacts/wind-ribbons/browser.json`. They bind
the matching production build and source hashes. A fresh `git fetch origin main` confirms
the base revision equals current `origin/main`; existing work remains uncommitted.

```sh
npm test
npm run build
npm run check:split
npm run build:functions
git diff --check
```

Hands-on feel, Safari replay parity, physical-phone frame pacing and a live hosted
submission remain separate acceptance gates. No deployment has been performed.
