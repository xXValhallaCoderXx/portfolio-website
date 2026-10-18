# Gentler opening and altitude trick lessons — v12 local acceptance

Historical v12 receipt. Current recovery mechanics and retained opening/lesson acceptance are
recorded in [the v13 receipt](good-lift-recovery-v13-qa.md).

Local candidate on `feature/finalize-game`, based on `10dd9c7730f27287f2d4ddae5f78a549ca225044`.
The pre-existing uncommitted v11 work is retained. Preview:
<http://localhost:4176/good-lift?sky=1>. Nothing has been deployed.

## Opening and recovery

The launch at `(100, 285)` and second source at `(60, 170)` start at 80 m radius and
5.5 m/s. Both remain stationary, full and unspent until the run first reaches 450 m.
Their normal clocks restart at that crossing; radii and the second source's drift blend
into normal behavior over 45 seconds. Source objects and generations survive the blend.
Descending never restarts protection. The other three sources use the ordinary seeded layout.

Good Lift displays the safe route before an activity qualifies: **NEXT LIFT**, direction,
distance, and an explicit request to release brake. Useful lift requests direction plus
normal brake. Target retention and the physical three-second THERMALLING qualification remain.

Wind correction compares ordinary working-brake controls on a private copy of the actual
wing. Transfers also check the released-brake turn using the physical model. This matters
when returning toward a thermal behind the pilot: a wide, unbraked turn can run out of room.
If no safe lift route exists, the card says so and requests a safe recovery turn when one is
available. It never presents the recovery point as reachable lift. Releasing ears prompts
normal brake to reopen promptly in Good Lift. Ordinary fjord coaching retains its policy.

## Encounters

Ravens mark thermals below 500 m without damaging the wing. Raven attack opportunities and
gusts start at 500 m, kettlebells at 700 m. First delays are respectively 45–60, 30–45 and
10–15 seconds. Later intervals interpolate by peak height to the 1,000 m rates:

| Encounter | Initial interval | At 1,000 m |
| --- | --- | --- |
| Raven | 60–90 s | 25–40 s |
| Gust | 90–120 s | 40–60 s |
| Kettlebell | 75–90 s | 35–45 s |

Each interval is sampled once when scheduled. A raven opportunity warns for one second,
then permits one bird to collide for three seconds. Misses consume the opportunity too.
The cloud pool remains 33, with the requested ten layers and counts and a 500 m damage floor,
including the canopy sample immediately below that height. Existing strike severity is retained.

## Lessons and progress

Pitch and catch unlocks at 500 m; wingover at 750 m, after pitch is learned. Both enter from
stable useful lift, including ordinary circling, with the required independent terrain/fog
reserves. The card explains height cost, style and its score multiplier. Setup begins by
leveling the wing and deliberately requesting deep input; observed physical phases then guide
the swing, catch/reversal and steady recovery.

Hazards, warnings, low reserve, ignored setup and the attempt timeout cancel instruction.
Retries wait 45 seconds and renewed entry conditions. **Back to lift** and **T** cancel without
changing held controls or either flight body. No maneuver is flown automatically.

Only a fresh matching physical completion followed by its actual style bank teaches a lesson.
The card reports the awarded style and resulting multiplier. Normalized `pitch`/`wingover`
flags save immediately, with the existing visit-memory fallback when storage fails.
**Repeat trick lessons** clears only those flags; **Reset progress** clears current progress.
Outside lessons, deliberate pitch/wingover teaching is off; safety coaching and physical
maneuver scoring remain available. The five flight touch buttons remain.

## Evidence and checks

The final command results, source digest and artifact hashes are in
`.artifacts/lessons-v12/verification.json`. Full simulation acceptance runs in `npm test`.
All **814 tests pass**. `npm run build`, `npm run check:split`,
`npm run build:functions` and `git diff --check` also pass. The frozen game-source SHA-256 is
`2918b801574265615920b30b6c7685e92d8c1598280f93f334b5b2abadd31c73`.

`opening-guidance.test.js` measures 32 seeds separately at 0.3, 0.6 and 1 second reactions,
using only visible instructions from the actual launch. Each delay must pass at least 29/32
within three minutes without assistance and with at least 30 m terrain clearance.

| Reaction delay | Reach 450 m | Time range | Minimum terrain clearance |
| --- | --- | --- | --- |
| 0.3 s | 32/32 | 104.35–127.28 s | 47.92 m |
| 0.6 s | 32/32 | 100.75–126.67 s | 47.92 m |
| 1 s | 32/32 | 98.53–119.70 s | 47.92 m |

Recovery cases begin with actual flights near 150, 250 and 350 m, in both initial wind
directions. A private copy selects a bounded manual departure trace, which is then flown on
the real run without moving bodies or changing sources. Ordinary turns/bar leave useful lift;
ears create the 20 m loss and are released before timing recovery. Setup stays within the
arena, keeps terrain clearance and leaves nearby lift. After setup, all control changes come
from visible coaching at the stated reaction delay. Six cases require one sustained second
of positive climb in useful air within 45 seconds and at least 30 m clearance throughout.
The measured receipt is `.artifacts/lessons-v12/recovery-acceptance.log`.
All six cases pass: **11.87–23.10 seconds** to sustained positive climb, at least
**37.62 m** terrain clearance, with no assistance or ended flights.

Sixteen real lesson flights cover both tricks, both starting circle directions and 0–0.3 s
reactions. Each requires a matching physical maneuver, a real style bank and steady recovery,
without stall, collapse, inversion or lost style. Eligibility, cancellation, interruption,
timeouts, retries, queue order and remembered completion have separate coverage.

Seven fresh Chromium recordings replay to identical complete Node sheets/barograms and
physical maneuver snapshots in `good-lift-v12-chromium.json`. Another sixteen Chromium lesson
recordings in `good-lift-v12-lessons-chromium.json` replay the ordinary circle, setup, complete
maneuver and style bank in Node, and prove immediate learning persistence without changing
bests. Authoritative bodies and scoring compare exactly; derived lesson telemetry uses
1e-11 precision, and the existing maneuver snapshots retain 1e-12 angular precision.

Native browser checks cover normal/deep brake gestures, release/re-press, ears, catches and
cancellation in both Good Lift and fjord flight. Lesson-specific native checks prove T/button
cancellation preserves held controls and bodies, Repeat preserves scores, and reload remembers
completion. Four viewports (960×700, 390×844, 844×390, 320×740) cover the briefing and fourteen
coach states: 60 layout captures, without HUD/control overlap or document overflow.

The native input/entry fixtures translate bodies to safe altitude and park hazards. Layout
fixtures use the source renderer with cloned production markup/styles. Those receipts prove
input and layout behavior; the physical launch, recovery and replay traces supply flight proof.

Nine wing, control, maneuver/scoring and reference-pilot files match the initial v11 working
tree byte for byte (`unchanged-handling.json`). The handling flag keeps its original 260 m
boundary independently of the new 500 m raven threshold. Energy, turn, ridge, gateway, score
and suspension gates are retained. The manual west-ridge approach is adjusted by 0.5 s and
the earliest ridge transfer by 1 s for the wider opening sources; no acceptance limits are relaxed.
Ordinary hunted-cell tests use a normally seeded cell instead of the protected second core.

Simulation version **12**, fingerprint **`f9c419a4`**, starts fresh `good-lift-v12` competitive
progress. Recording format **2**, five input bits and historical decoding remain unchanged.
Earlier progress and browser fixtures remain separate.

## Remaining acceptance

Physical-device ergonomics, Safari behavior and final player feel remain separate playtesting
steps. Deployment requires the matching v12 client and board function followed by hosted
submission/replay acceptance. Local browser/build evidence does not establish those gates.
