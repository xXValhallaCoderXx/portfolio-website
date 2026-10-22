# Good Lift menus and beginner Training — 22 October 2026

Candidate: local changes on `38c860875bda91bdea854fc8e475f9968d28681b`. Changes are uncommitted. Exact source hashes and a recovery snapshot are in `.artifacts/menu-revamp/manifest.json` and `source-snapshot.tar.gz`.

## Implemented

- Game, Training, pause, results, leaderboard and kit use the compact arcade hierarchy from `game-ui.html`. The reference remains source material; the React UI and shared menu markup implement the actual screens.
- Free Fly exposes Game on the first visit. Crossing the rune arch keeps flying in the fjord; the arch is scenery. Game prepares a sky and offers separate Fly and Training actions. Retry stays direct.
- Training has six native lesson tiles, synchronized illustrative flight paths and brake/key demonstrations, pause/replay, static reduced motion and a persistent Fly action. Browsing never advances a lesson or records a run.
- Steering & Braking uses actual course, bank, airspeed and fresh released recovery. Thermal Climb uses a real stationary thermal, existing lift guidance/qualification, one coherent circle and 10 m net gain. Confirmed lift loss resets unfinished circle/gain evidence and permits reacquisition.
- Foundation completion uses a separate compatible `foundationLessons` field. Training does not award ranked scores, career progress or kit. Existing trick learning remains separate.
- Keyboard Shift reaches full pull through a 0.45-second fixed-step smoothstep. Touch/mouse, ordinary pulls and release remain direct. The recorded quantized input pair includes the curve; physics, replay version and scoring rules retain their existing behavior.
- Normal flight keeps instruments, thermal strength, combos, judges, real hazards and physical safety cues, including preventive stall warnings. Routine teaching stays in Training. Large match achievement notices and travel/turn labels are suppressed.
- Leaving Training clears its result focus boundary. Back works after an engine import failure, and prepared named/challenge skies survive a Training round trip.

## Validation

- Final `npm run verify` passed: **1,145 tests, 1,145 passing, zero failures**, plus typechecking, architecture, production build, function build and bundle separation. Log: `verify-final.log`.
- A further 24 physical keyboard trials cover all four tricks, both directions and 0/.15/.3-second reactions through the actual Shift controller. All complete and bank without faults. Focused input, keyboard and essential-message checks: 39 passed.
- Foundation probes: mirrored steering pilots complete at 33.07/35.63/39.20 seconds for 0/.3/.6-second delays; mirrored thermal pilots complete at 49.73/85.85 seconds for .3/.6-second delays. Successful pilots have no faults or trick moves. Negative and loss/reacquisition cases are covered by domain tests.
- Browser checks passed for desktop 1280×800, phone 390×844 and landscape 844×390: six selectable lessons, moving/paused/static previews, zero pre-Fly progress, thermal start, pause and return. The same harness physically completes Steering & Braking, verifies completion-only storage, checks Training exit/focus cleanup, first-visit Game entry, decorative gate crossing, progressive Shift/reset, exactly one ended run, result/board/kit interaction and import-failure Back.
- Supplemental browser checks passed for prepared named/challenge return addresses and visible real thermal strength during instruction. Both browser reports contain no unexpected page errors.
- All six screens were visually inspected at all three viewport sizes. No horizontal overflow; visible actions remain at least 44 px high, and short screens scroll content within persistent footers.

The supplementary full-brake Free Fly probe did not produce an actual stall in its sampled air; it is not counted as physical stall-warning browser acceptance. The presentation policy has explicit tests retaining pre-stall, stall, collapse and hazard warnings while hiding urgent trick timing.

## Evidence and boundaries

Artifacts: `.artifacts/menu-revamp/browser.json`, `extra-browser.json`, `visual/`, `final-focused.log`, `verify-final.log` and `manifest.json`. The backup includes all modified/new source files; the supplied `game-ui.html` and `image.png` remain intact.

Browser phone/landscape profiles emulate viewport and touch capabilities. They do not establish real-phone handling or spoken accessibility. No commit, push or deployment was made.

## Sharper-turn follow-up

Steering & Braking now teaches a firmer side pull between gentle turns and braking: pull one handle farther, or use Q/E, then release when cued. The lesson requires a real 20° bank, 15° course change and stronger unilateral brake demand, followed by fresh released recovery. Holding gentle steering cannot skip this stage. Mirrored pilots with 0/.3/.6-second reactions complete without trick moves, faults or score rewards; both direct brake demands and actual keyboard shortcuts are covered.

All six lesson previews now advance at 1.2× speed (about 3.33 seconds per step instead of four). Steering has four illustrated steps, including the firmer pull and release; other lessons retain three. The preview clock follows each lesson's step count.

Phone QA exposed an animation timing race: a deferred React updater read a frame timestamp after it had changed, allowing negative elapsed time and an invalid preview phase. Each animation frame now captures its bounded, nonnegative delta before enqueueing the state update. The reproduced error and stack are preserved in `preview-browser-render-race.json`.

Follow-up validation: 97 focused tests passed, plus complete typechecking, architecture, production build and bundle separation. This focused validation supersedes the earlier steering sequence/timing measurements; the full 1,145-test result above describes the earlier menu-revamp candidate. Follow-up artifacts and source snapshot are in `.artifacts/sharper-turns/`.

After the timing fix, final browser checks passed desktop 1280×800, phone 390×844 and landscape 844×390 with no page errors: all six lessons, four steering steps, deeper-pull diagram, moving/pause/replay/static previews, no overflow, visible Fly and no pre-Fly lesson advancement. An isolated browser rendering the actual preview component and catalog confirms stages 0/1/2/3 at 3300/3400/6700/10100 ms, including the sharper pull and fourth braking stage. Timing is isolated from the software flight renderer; full-page layout and interactions use the complete app. Earlier failed diagnostic reports remain archived separately.

## Training scenery and brake-position feedback

Training now replaces the flat mountain silhouettes with two lit alpine ridges, irregular rock facets, broken snowy peaks and an open northern pass. Colours and restrained wire edges follow the shared fjord terrain. Existing islands, cloud banks and aurora remain. The 6,528-triangle landscape is allocated on first use, stays outside a 1,450 m radius from the practice centre, reuses its resources across retries and hides outside Training. Low detail retains the primary ridge and hides its wire edges and the far ridge. Training uses a stable visual seed rather than inheriting the last ranked sky. The ground sampler, lesson origin, air, physics and scoring remain unchanged.

Steering & Braking now displays brake-position progress, then HOLD HERE and green target marks at the correct pull. EASE OFF appears for excessive pressure on either hand. A quiet 150 ms bell confirms a sustained target acquisition. It shares the canonical per-hand acceptance rule, including the .04 maximum for a hand requested released. The .08-second entry dwell, rearming margin and .8-second cooldown prevent brief crossings or jitter from chattering. Neutral phases, other lessons, warnings and completed lessons suppress this feedback. Existing sound, pause and audio-unlock guards apply. Course/bank and recovery progress still come from the physical lesson observer.

Final focused validation: **41 tests passed**, including scenery bounds/reuse/disposal, 2,645 feedback comparisons with canonical acceptance, and mirrored completed Steering flights with identical physical results and exactly four target cues. Typechecking, architecture, production build and bundle separation also passed.

Browser scenery checks passed desktop and phone comparisons, real thermal air/cue visibility, pause, reduced motion, low detail, lesson changes, three retries and return to Game/Free Fly with no duplicate scenery. Feedback checks passed actual keyboard, handle-mouse, canvas-mouse and native emulated touch inputs, overpull/release, neutral/pause/mute/retry guards and exclusion from Thermal/Game. The physical keyboard lesson completed with four one-off bell invocations. After tightening the released-hand threshold, final native two-touch checks rejected canonical (.30196, .05882) with EASE OFF and no bell, then accepted (.30196, .03137) with HOLD HERE, a green target and one bell; a fresh keyboard retry also passed. Browser reports have no page errors.

Scenery evidence is in `.artifacts/training-scenery/`; feedback evidence, final source hashes and the combined recovery snapshot are in `.artifacts/training-feedback/`. Audio evidence establishes native Web Audio scheduling, not physically heard output. Touch is browser emulation. All changes remain local and uncommitted.
