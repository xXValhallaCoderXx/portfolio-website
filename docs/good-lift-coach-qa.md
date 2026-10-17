# Actionable flight coach — local acceptance

Historical version 7 receipt. [Flight feel v8 QA](good-lift-flight-feel-v8-qa.md) supersedes
its physics, timing, simulation version, storage key and replay acceptance. The counts and
screenshots below belong to this earlier candidate; they are not a fresh version 8 check.

This records the first coach pass. The current activation and quiet-flight changes
are verified separately in [Coach activity QA](good-lift-coach-activity-qa.md).

Working candidate on `feature/finalize-game`, based on
`0c816d548fa152cd10dd477ee264b465a6ba09aa`. This pass changes presentation and
guidance. It has not been deployed or tested on a physical phone.

## Behavior

The coach gives context, an action, a reason and the matching control chips.
Held input comes from combined keyboard/pointer ownership. Reversals explicitly
release the opposite direction; the old two-direction speed-bar chord remains.
Focused touch buttons support held Space/Enter and release on blur/cancellation.
One semantic message drives both the coach and the touch recommendations.

Only fixed flight steps advance intent, targets and notices. Rendering reads a
cached message and paints actual held input. The only progress bar measures the
existing one-second steady recovery. Timing praise and banked style stay on a
secondary line. Fog/cloud-base warnings share the card instead of overlapping
it; urgent recovery and hazard actions take priority over ordinary lift advice.

Maneuver coaching is reactive. Ordinary course corrections do not invite stunts.
Wingover advice holds through the crest and requests reversal on the returning
45-degree crossing. Pitch advice follows observed brake/pitch phases. Inverted
flight offers orientation and an explicit recovery/abort action; a complete
loop tutorial remains deferred. Existing physical loop scoring is retained.

## Lift and physical instruction checks

Lift guidance retains a useful thermal or ridge, screens six-second turn paths
against terrain, fog, cloud and the arena edge, and considers live source
expiry/generation. Heavy searches run every quarter simulation second; ordinary
direction changes use hysteresis. Thermal circles explicitly use the working
brake, retain circle direction, and release the brake/bar for travel. Drifting
cells retain a stable presentation identity until their slot is reborn.

Following both the lift guide and parent coach with 0.2-second delayed digital
inputs keeps actual Good Lift starts airborne for 60 seconds in both wind
directions. Seeds 1/2 end at 145.2/266.6 m, with at least 47.9 m terrain
clearance. Neither flight starts acro or reverses its circle. Seed 2 retains its
existing brief initial updraft stall transient, with no later failures.
The ordinary fjord start also stays airborne for 60 seconds, ends at 97.9 m,
and retains 81.5 m clearance without stalls or acro prompts.

Two actual 30-second ridge handoffs start at the canonical gate, use manual
departure controls, then follow delayed guide instructions. Both retain more
than 45 m clearance, finish above 120 m and gain height in ridge air with
negligible thermal contribution. No boundary assistance or maneuvers are used;
the guide stays with useful ridge air instead of pulling inland toward a core.

Eight mirrored wingover tests and four pitch tests follow the actual displayed
commands with 0–0.3-second reaction delays. Every flight completes and banks a
real move, with no stalls, breaks or lost sets. Wingovers spend approximately
42–44 m; pitch moves approximately 24 m. Pressing a requested key alone does
not grant score. Recovery tests also cover external raven collapse through
hold/release/second-pump phases and inverted flight during cloud/bell hazards.

## Replay and browser evidence

Two existing Chromium v7 input logs are replayed for 60 seconds with and without
the complete coach. Every fixed step has identical physical bodies, sky, meet,
hazards, observer, scoring, controls and trace; final sheets match exactly.
30/144 Hz and repeated paused reads do not advance the cached instructions.
The seven existing Chromium/Node golden recordings and numeric fingerprint
`ce25122b` remain valid. Simulation version 7 and `good-lift-v7` are retained.

The final full suite passes 648/648 tests, zero failed (38.0 s). The 32-sky
survey retains a 386.0 s median, 32/32 five-to-eight-minute flights and 32/32
openers. Production build, lazy-loading split, function bundle (26 pure modules)
and whitespace checks pass. Canonical flight, physics, sky, run-step and version
files are byte-identical to the pre-coach candidate.

Build logs, browser runners, screenshots and receipts are under ignored
`.artifacts/coach/`. Browser fixture checks are explicitly separated from actual
physical ridge samples and canonical input/replay checks.

The final production browser pass checks 960×700, 390×844, 844×390 and
320×740 layouts, with 36 screenshots and zero page errors. Keyboard/touch
symbols, directional arrows, amber warnings, recovery timing and long
instructions remain visible without covering the controls. Native keyboard,
pointer, mixed ownership, chord, cancellation, blur and focused Space/Enter
checks pass. Repeated rendering leaves simulation and coach state unchanged.
The receipt binds this pass to the verified production build. Long-copy phases
use renderer fixtures; the ridge sample uses actual physical flight.

```sh
npm test
npm run build
npm run check:split
npm run build:functions
git diff --check
```

Hands-on feel, Safari parity and physical-phone frame pacing remain device checks.
