# Good Lift flight and ridge lift — local acceptance

Historical version 7 flight/ridge receipt. [Flight feel v8 QA](good-lift-flight-feel-v8-qa.md)
supersedes its flight tuning, timing, version, storage and replay acceptance. Retained field
behavior still needs current-candidate verification; the counts below remain historical.

Candidate: working changes on `feature/finalize-game`, based on
`0c816d548fa152cd10dd477ee264b465a6ba09aa`, verified equal to remote `main`.
This report covers local builds and browser acceptance. No deployment or
physical phone flight has been performed.

This is the directional-ridge/start-position receipt. The subsequent presentation-only
coach pass is documented separately in `good-lift-coach-qa.md`; its current checks
supersede the coach screenshots and test count below.

## Flight and directional ridge air

The fjord and Good Lift share the coupled canopy/pilot force model and input
shaping. Controls retain the previous 38° normal bank target and 0.22 s input
response. The force model and flight adapter are byte-identical to the candidate
before this ridge pass. The 60 Hz simulation has four physical substeps;
rendering interpolates snapshots and never advances the simulation.

Terrain air probes obstacles 24/48/72/96 m downwind with broad-support, relief
and uphill-grade checks. It selects the strongest obstacle response and blends
its face-normal sampling continuously. Incoming normal flow bends upward;
along-ridge flow remains. This creates a usable lane before the face without
multiplying lift when several probes see the same obstacle. Narrow rocks are
rejected. Ridge air is capped at 3.5 m/s, useful through crest +55 m and zero
by crest +120 m. Lee shelter/sink and the combined 6 m/s air limit remain.

Six actual 60-second digital-control passes over the real fjord terrain cover
both cliffs in 3, 3.5 and 4 m/s favorable wind. Mean climb is 0.83–1.65 m/s,
minimum terrain clearance is 69.6 m, and there are no stalls, thermals or
boundary assistance. Direction, oblique/parallel flow, still air and finite
ridge ceiling have isolated field tests. The original discontinuous probe
selection is covered by an exact centimetre regression and a wider terrain
scan: maximum vector change is below 0.15 m/s per quarter metre.

Good Lift now starts at (85, 100, 280), 20 m higher and beyond the stone arch.
This gives the longer crossing to the left cliff more clearance while keeping
the same controls, starter thermal and directional ridge field. Eight seeded
manual digital departures reach usable ridge air within 12 s, retain at least
25 m terrain clearance and show actual climbing after a counterturn along the
face. A held turn directly into the mountain remains an unsafe route.

## Weather and presentation

Seeded ambient flow favors either cliff at 3–4 m/s: 90 seconds steady followed
by a smooth 25-second turn. Layer shear remains. Only fixed steps update the
weather clock, clouds and cells; sampling is read-only and reset is repeatable.
Cloud positions integrate current layer wind and wrap at faded, invisible seams
outside the arena. Existing gusts retain their launch heading.

Cells retain 90–120 second lifetimes, with drift speed limited by their travel
allowance. A 12-second boundary fade completes before relocation; generation
identity remains stable during drift/fading. Glide advice and reference pilots
use the earlier of natural expiry and boundary fade when judging reachability.
Thermal core/centering, wear and scoring designs are otherwise unchanged.
The existing drifting-position reset in thermal feedback is deferred to the
thermalling pass.

Wind streaks sample the physical field and redistribute part of their fixed
pool toward nearby terrain flow. Windsocks sample local live air. The HUD labels
flow destination explicitly. The coach distinguishes weak rising air from air
strong enough to support a gentle glide; the vario still reports actual climb.
Warm lift streaks require roughly 1.55 m/s upward flow. Plain-language SINKING AIR
replaces LEE SINK and explains the sheltered side. Wind shifts and a brief first
plate-trail notice yield to hazards and recovery/maneuver instructions. Plates
are optional bonus kg, and trails lead toward the next thermal. A shared
presentation-only variometer filter and audio scale represent actual glider
climb over the useful soaring range.

## Browser and replay evidence

Chromium headless shell 143.0.7499.4 / Playwright 1.57.0 production-preview checks
stage the glider in each ridge band, isolate thermal lift and let the physical
wing fly before capturing feedback. Both scenes show positive climb, visible
streaks and RIDGE LIFT. Checks at 89/95/116 simulation seconds show steady wind,
a shift announcement and lee sink on the old windward face. Held rendering leaves
the complete sky state unchanged. These staged checks do not represent scored
manual runs.

Further held-state checks distinguish weak rising air and exercise the optional
plate notice behind a wind shift, stall recovery and an inversion. Later trails
do not repeat the lesson. These staged notice checks also preserve the hazard
hint while recovery instructions are active.

Both scenes pass at 960×700, 390×844, 844×390 and 320×740, including reduced
motion: no horizontal overflow, no coach/HUD/touch-target overlap, five touch
targets at least 44 px, and no browser page errors. The normal start button and
right key also enter the loaded and fallback arch without repositioning.
The west scene also checks weak-air, sinking-air and plate copy at all four sizes.
Launch remains 35 m farther back and 5 m higher; the forgiving doorway volume
and strict scored-rune crossing remain as previously implemented.

Seven fresh Chromium recordings match complete Node replay exactly: three
soaring runs (371.2, 387.5 and 377.8 s), an ears/reopening run continuing to fog
at 384.5 s, and recovered inversion/wingover/pitch moves banking 60/20/20 style.
All three maneuver recordings have zero stalls or observer breaks. The receipt
includes full barograms, input logs and physical recovery snapshots.

Simulation version 7 uses fresh `good-lift-v7` progress and rejects older
simulation links. Control bits and recording format are unchanged. The numeric
fingerprint is `ce25122b`; the browser simulation source digest is
`f67519dd537d564742eb51f223666f81e9bfbd9651da03a54cdbb1a7ce33c4c7`.
The exact Chromium JSON is `src/game/fixtures/good-lift-v7-chromium.json`.
Current runners, screenshots and logs are under ignored `.artifacts/lift-access/`;
the earlier directional-ridge evidence remains in `.artifacts/ridge-pass/`.

## Repeatable checks

Recorded on the final local candidate: 588 tests passed, zero failed (37.2 s).
Production build, lazy-load split check, Firebase function bundle and whitespace
check passed. The 32-sky survey has a 386.0 s median, 32/32 flights within
five to eight minutes and 32/32 reaching the opener. Ordinary soaring earns
zero maneuver style. Both full browser gate regressions passed with no page
errors; their fresh receipts are in `.artifacts/lift-access/gate-entry/`, including
the new beyond-arch destination.

```sh
npm test
npm run build
npm run check:split
npm run build:functions
git diff --check
```

The 32-sky digital-input acceptance retains a 300–480 s median, at least 22
skies in that range, an approachable opener, quiet early hazards, complete
traces and zero style from ordinary soaring. The ten-minute deadline retains
all 36,000 steps and 601 barogram samples. HTTP verification covers version
rejection, canonical replay, deduplication and request limits. Website and
function bundles must be published from the same revision, as documented in
README.md.

Hands-on feel, Safari replay parity and physical-phone frame pacing remain
device checks. Earlier v5 result/challenge and landing UI receipts are historical;
they are not presented as fresh v7 browser acceptance.
