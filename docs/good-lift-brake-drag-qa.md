# Good Lift — proportional mouse and touch brakes

The subsequent presentation-only travel marker, drag diagram and coach target are covered by
[the light flight cues receipt](good-lift-flight-cues-qa.md). Its local preview and verification
supersede the preview below for reviewing those additions; the control implementation remains unchanged.

Local working candidate based on `af905cc`, 19 October 2026. Preview:
<http://localhost:4188/good-lift?sky=1>. No deployment performed.

## Controls and compatibility

Hold and drag on clear Good Lift scenery. Left/right pulls that hand, down pulls both,
diagonals blend them, and distance determines travel. Mouse travel is 120 CSS pixels;
touch/pen travel is 80, with a 6% neutral dead zone. Releasing returns both demands to zero.
The full range maps directly to the existing 0.6 deep travel, without a tap gate.
The two meters display actual hand travel, with working depth marked at two thirds.
Ordinary thermalling blends a downward pull with the chosen side; easing keeps a little
bilateral brake. A side-only pull is available, but is not the recommended climbing circle.

Keys and the five touch buttons retain their familiar handling. Desktop Bar/Ears buttons
allow mouse use. A fresh flight-control press takes ownership; cancellation, lost capture,
blur, maps, menus and pause clear input. Starts and resumes require a fresh press.
Portfolio travel and the hero interaction retain their controls.

Direct flight uses independent smoothed brake forces and passive stability. It synthesizes
no bank target or opposite-hand brake. Full bilateral pulls can produce an actual stall;
both hands must release for reopening. The existing global cloth model remains: independent
tip stalls/spins are outside this change. Coaching, predictions, lessons, style observations,
hands and trailing edges understand each side separately.

Simulation **3**, fingerprint **`b9dd2bdb`**. Format **2** records 8-bit hand demands and
controller mode; live play flies the same quantized inputs. Format 1 stays readable and
old simulation versions retain the version-mismatch response. Saved progress and historical
boards keep their shapes and data. Browser/server canonicalization remains shared.

The recorder allocates 144,000 bytes for 36,000 packed frames. A noisy ten-minute test
produces 192,022 link characters within the 196,608 bound; persistent board logs retain
their one MiB aggregate budget.

## Verification

All **867 tests pass**: 861 core cases plus six opening/recovery gates. Application and
function builds, bundle-split and diff checks pass. Machine-readable results, logs and screenshots are in
`.artifacts/analog-brakes/`; fresh Chromium captures are in `.artifacts/analog-brakes-current/`.
`verification.json` binds the working-tree runtime SHA-256, preview build SHA-256,
test logs and browser results. Environment: Linux, Node 24.21.0, Chromium 143.0.7499.4.

The full test set is partitioned without omissions: all tests except
`opening-guidance.test.js`, plus its three reaction-delay cases separately and its three
recovery cases. This lets the 96 seeded opening flights run in parallel. Required build gates:
`npm run build`, `npm run build:functions`, `npm run check:split`, and `git diff --check`.

The opening gates reach 450 m within 180 seconds in 32/32 skies at 0.3-second reactions,
32/32 at 0.6 seconds and 30/32 at one second, passing the existing 29/32 floor.
Successful openings keep at least 47.9 m of clearance. Recovery gates pass at 150, 250 and 350 m.

Eight direct-circling cases use the actual radius-60, strength-5.5 thermal profile, both
directions, stationary and with matched wind/drift. Inner/outer demands 0.45/0.15 gain
23.85 m over 80 seconds; 0.50/0.20 gain 36.58 m, completing over five circles with bank
below 30 degrees. These measure established circles after 60 seconds of natural physical
preparation; they do not establish entry success. Initial side-only candidates lost height,
so the final coach forecasts and teaches a downward-and-side blend, easing to 0.20/0.20.

Fresh Chromium 143.0.7499.4 receipts cover 37 flights: seven flight/maneuver, 16 lessons,
ten recovery and four proportional/mixed records with 30 physical/observer checkpoints.
Browser and Node compare bodies, envelope, observers, style and resulting sheets; browser
daily recordings also exercise the server submission handler.

All five native browser layouts pass: desktop 1280×800, phone 390×844, small phone 320×740,
landscape 844×390 and hybrid 1100×760, including both motion preferences.
Checks exercise capture, release, cancellation, source
switching, maps, menus, pause, warning layout, button access and recorded-flight replay.
Phone coverage uses Chromium touch emulation, not physical devices. Physical-device
acceptance and coordinated hosting/function deployment remain separate.
