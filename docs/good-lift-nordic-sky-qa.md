# Readable thermals and Nordic sky — local QA

The original generated islands described here were replaced on 20 October 2026.
See the [authored-island QA receipt](authored-islands-qa.md) for the current assets and checks.
This receipt preserves the original candidate's evidence; its generator was retired.

The follow-up [earlier islands and raven-led thermalling receipt](good-lift-raven-flow-qa.md)
documents the lower island reveal and simulation 2 traffic rule. This receipt describes the
original presentation update under simulation 1.

Verified on 18 October 2026, on the local candidate based on `983c50e349aa0158653250a35778835f29db58ab`.
Production preview: <http://localhost:4177/good-lift?sky=1>.
No deployment was performed.

The runtime source digest is `b9beaba6e5f91845c68947991e343583df1efa5745ec2b7ef118f4c8aac41391`.
Commands, build hash, asset hashes, protected-file hashes and browser measurements are recorded in
`.artifacts/nordic-sky/verification.json` and `browser.json`.

## Delivered behavior

Thermal particles concentrate more strongly in the core and dim with sampled cell power.
Their radius, lift profile, drift and upward speed come from the existing cells. The faint core
glow marks the broad strongest region from outside; it fades around the camera and glider so
circling inside the core does not tint the whole sky. Moving, dead and zero-lift cells have no
lift effect. Existing visibility limits, lightning reveals, fog clipping and warning draw order
are retained. The pool still contains 384 launch motes and 256 per hunted cell; rendering never
rewrites their buffers or advances weather.

The compact THERMAL AIR meter sits beside the vario on desktop and below it on narrow screens.
It reads environmental thermal air, while the vario retains net glider climb. Its exponential
filter is 0.6 seconds; STRONGER / STEADY / WEAKER compares one-second history with a 0.25 m/s
deadband. Pause and map freeze its history. Maps, briefings, lessons, recovery and warning
instructions hide it. It can appear on the opening turn before thermalling qualifies.

Cloud sea and mountain silhouettes blend in from 450–900 m. Aurora strengthens overhead from
900–1,500 m, with ruined and split islands entering progressively and higher formations beyond
1,500 m. Stars, moon and aurora follow camera translation with their world bearings retained.
Mountains, decorative cloud banks and islands retain world positions and parallax outside the
playable area. Nine seeded island placements reuse three model views; decorative clouds reuse
the existing cloud asset in an eight-view pool. No additional shadows are enabled.

`buildSky().update(time, context?)` accepts mode, camera, altitude, visual seed, fog,
reduced-motion and detail context. Legacy `update(time)` retains the original sky placement and
four curtains. Asynchronous model fades use presentation time; sky animation follows the run
clock. Retry clears old scenery visibility without discarding loaded resources. The existing
performance fallback reduces stars, curtains, cloud layers, decorative banks and hero islands.

## Dedicated models

All three models are original deterministic geometry authored by `tools/author-islands.mjs`.
They include complete rock undersides, Y-up orientation, one matte material and one embedded
1024×1024 base-colour atlas. The rock shells have no open edges and positive enclosed volume.
Front, back and underside renders were reviewed for each asset in
`.artifacts/nordic-sky/model-*.png`.

| Asset | Triangles | Optimized bytes |
| --- | ---: | ---: |
| `island-alpine.glb` | 1,480 | 458,072 |
| `island-ruins.glb` | 2,392 | 482,164 |
| `island-split.glb` | 1,690 | 465,344 |

The snowy shelf carries windswept pines and a tapered underside. The terraced ruins include a
broken stone hall, arch and rune monolith. The split model has unequal crags, a pronounced gap,
broken bridge ends, moss and pines. The files contain no sky or surrounding cloud geometry.

Reproduce the assets with:

```sh
node tools/author-islands.mjs
npm run models -- island-alpine island-ruins island-split
```

Only the three new exports were normalized and optimized. Existing model files are unchanged.

## Verification

- `npm test`: **810 passed, zero failed**, including flight energy, handling, scoring,
  recovery, thermalling qualification, replay and server gates.
- Final presentation/model checks: **54 passed**, covering profile and power, core/edge density,
  weakening, drift, overlap, source replacement, fog, pause/reset, reduced motion, bloom-free
  brightness, load failure, resource ownership and model budgets/topology.
- `npm run build`, `npm run build:functions`, `npm run check:split` and `git diff --check` passed.
  No run-only module leaked into the page's chunks.
- Simulation **1**, fingerprint **`af831e72`**, recording format **1** and saved-data shape are
  unchanged. Protected physics, weather, scoring, coach/lesson, activity, replay and storage
  sources were compared with HEAD and are byte-identical.

Production-browser review used Google Chrome for Testing 143.0.7499.4. It produced **56 captures**,
including 40 cardinal views at 150, 500, 1,000, 1,500 and 2,000 m across desktop and phone sizes.
Nine layout/warning measurements cover 960×700, 390×844, 320×740 and 844×390, including native
emulated touch. Readouts fit, menus remain clear, warning cards avoid controls, and touch targets
remain at least 44 px.

Native left and right circles showed air feedback **1.5 seconds after starting the turn**, before
the three-second qualification. Sustained air changes registered WEAKER in **0.41–0.68 s** and
STRONGER in **0.61–0.72 s**. Pause and map kept both value and history frozen. Real fog warnings
and the automatic pitch lesson hid the meter. Retry returned it to zero and hid old islands.
A separate check of the visible DOM labels added four captures: WEAKER appeared in **0.51–0.88 s**
and STRONGER in **0.51–0.60 s**, with the meter visible during ordinary circling in both directions
(`.artifacts/nordic-sky/native-ui.json`).
Reduced motion and bloom-disabled rendering passed. An intentionally failed ruins request left
the remaining scenery and flight working; there were **zero page errors** and only that expected
failed-request console entry.

Repeated altitude cycles retained **101 geometries, 37 textures and 60 shader programs**.
Hero views stayed bounded at three, with at most two after the performance fallback. Decorative
clouds stayed bounded at eight, reduced to at most two. These are browser resource measurements,
not physical-device frame-rate acceptance.

The cardinal captures translate both physical bodies while holding flight and park hazard geometry
to inspect scenery. Native circle checks first follow the existing recovery coach, then align one
stationary thermal with the circle and change only its environmental lift from 5.5 to 4.2 m/s and
back. Physical state and the solver are untouched during those flights. Desktop rendering gates
were resumed only after matching source and build hashes; the final receipt contains all gates.
The unmodified canonical flight/replay gates are separate. Practice browser contexts submit no
fixture scores.

Physical-phone ergonomics, GPU performance, Safari, hosted acceptance and deployment remain
separate. Browser touch emulation is not physical-device acceptance.
