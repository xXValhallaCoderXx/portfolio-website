# Shared flight controls and cleanup

The [architecture refactor receipt](architecture-refactor-qa.md) records the current TypeScript
structure, production preview and verification. The candidate details below are historical.

Local, uncommitted candidate based on `330e9cd`, 19 October 2026. Previews:
[outdoor flight](http://localhost:4191/fly) and
[Good Lift](http://localhost:4191/good-lift?sky=1). No commit, push or deployment performed.

## Current controls

Outdoor flight and Good Lift share the same captured mouse/touch/pen drag: sideways pulls
that hand, down pulls both, and diagonals blend the demands. Travel is 120 CSS pixels for
mouse and 80 for touch/pen, with the existing 6% neutral dead zone. Both modes fly the same
8-bit brake precision, using one shared quantizer with the recorder and visual targets.
The coupled canopy/pilot solver and tuning are unchanged.

Both flights show actual left/right brake meters, the kite-shaped diagram with an upper
HANDS UP zone, accepted coach targets, ground-velocity TRAVEL marker and actual turn cue.
Sliding into neutral releases both brakes while retaining the gesture; lifting releases them
and briefly confirms HANDS UP.

The control diagram stays visible during manual flight at one fixed position below the pilot,
including between drags. Only viewport/safe-area changes can move it. A gesture can begin
anywhere on the flight scenery; its initial point remains the real input origin, while the
dot moves relative to the centre of the fixed diagram. Lifting resets the dot to neutral
without hiding the panel. The same 204 × 180 CSS-pixel diagram represents full travel for
mouse, touch and pen; each keeps its original 120/80-pixel physical drag sensitivity. Its origin
is centred horizontally, at 80% of the safe height on narrow screens and 76% on desktop, clamped
to safe bounds. Short landscape screens use a 164 × 148 diagram; unusually tiny viewports scale
it further to fit. Coach targets remain limited to active drags. The coach sits below the HUD,
above the pilot on portrait phones and to the left on desktop/landscape, clear of the control.

The added elements are noninteractive. Navigation labels hide while a drag is captured;
between drags, labels that overlap the panel stay hidden. Pillars and map navigation remain
available. Menus, pause, assistance, briefing and mode exits retain priority over the panel.

A stationary pillar tap or label button still selects assisted travel. Moving more than
6 CSS pixels claims the canvas gesture, even when the handle returns to its origin, so its
synthetic click cannot also select a pillar. Cancellation and interrupted ownership suppress
that click too; the next fresh press can select normally. Acquiring the drag clears pillar
hover and takes control from assisted travel. Assistance remains attached to that landing
leg, so taking control back cannot earn a manual landing score.

Manual flight is drag-only in both modes. Flight keys, on-screen flight buttons, manual time
boost and Bar/Ears shortcuts have been removed. Fresh launches start in direct neutral; pressing
former flight keys leaves idle input and a captured drag unchanged. Deep brake is a continuous
pull into the purple range. Navigation, restart, takeoff, reserve and menu shortcuts remain.
Menus, map, pause, blur, hidden pages and mode exits clear
captured input. Restart, teleport and a fresh launch clear all held controls and previous
pointer ownership. The website's idle hero interaction and landing content access remain.

## Cleanup

Removed the obsolete format-1 recording encoder/decoder and the historical run-ID fallback.
The recorder writes and accepts only current format **2**, with digital and proportional
frames; old formats are rejected. Digital run IDs now use the current encoding. Existing
format-2 browser fixtures remain exact. Simulation **3**, fingerprint **`b9dd2bdb`**, scoring,
current saved progress and kit data remain unchanged. No migration or automatic storage wipe
was added. Format/version validation, corrupt-input rejection, bounds checks and blocked-storage
memory remain current safeguards.

Also removed the obsolete keyboard/button holder sets, listeners, double-tap controller and
its tests, device-specific briefing/help variants, flight-button and unused brake/swing styles,
old hint-position tracking and keyboard-specific coach chip metadata. Historical fixture source
lists retain original capture provenance. The digital simulation path still serves reference
pilots, boundary recovery, assisted travel and current recordings; its active behavior is retained.
Help, briefing and live coach feedback describe the remaining drag controls. Bilateral deep-brake
feedback requires both hands deep; asymmetric pulls retain truthful per-hand feedback.

## Verification

The current receipt is `.artifacts/drag-only-controls/verification.json`; its neighboring ignored
files retain commands, logs, browser reports and screenshots. The complete test set is split
without omissions into all tests except `opening-guidance.test.js`, then that entire file.

**879 tests pass**: 873 core/application/function tests and six opening/recovery gates.
The lower count reflects the deleted obsolete keyboard/button gesture tests; the asymmetric
brake feedback has new mirrored regression coverage.
The opening checks retain 32/32 successes at 0.3-second reactions, 32/32 at 0.6 seconds and
30/32 at one second; recovery checks pass at 150, 250 and 350 m.
Focused tests cover gesture slop and cumulative movement,
reset lifecycle, unchanged drag demands, canonical quantization and malformed demands, current
recording round trips, old-format rejection and current-format run identities. Fixed-panel tests
cover common safe placement, viewport scaling, equivalent mouse/touch/pen dots and targets,
and multiple real gesture origins without moving the panel or changing input demands. Existing flight,
coach, lesson, style, recorded browser replay and server-submission fixtures are included.

Application and function builds, bundle-split and diff checks pass. All ten responsive browser
cases and both production-preview routes pass with zero page errors. Responsive browser checks
use Chromium 143.0.7499.4 on Linux with Node 24.21.0:

| Layout | Viewport | Input | Motion preference |
| --- | --- | --- | --- |
| Desktop | 1280 × 800 | Mouse | Standard |
| Phone portrait | 390 × 844 | Native emulated touch | Reduced |
| Small phone | 320 × 740 | Native emulated touch | Standard |
| Landscape | 844 × 390 | Native emulated touch | Reduced |
| Hybrid | 1100 × 760 | Mouse and native emulated touch | Standard |

Phone profiles use native emulated touch. The hybrid profile verifies mouse → touch → mouse
handoffs with equivalent demands and dot positions. A Chromium mobile-emulation routing trace
is retained separately; synthetic mouse handoff in `isMobile` mode is not treated as device proof.

The earlier outdoor-controls receipt retains native pointer-capture, restart/teleport and
projected-pillar navigation coverage in `.artifacts/outside-controls/`. Current browser checks
exercise both flight modes on all five layouts, including idle visibility, native drags from
three screen positions and directly on the passive control graphic, normalized dot/target positions, actual fixed-step brake travel, held
neutral, release, ignored flight keys while idle and dragging, menus/map/pause/blur and stable positions across coach
and warning changes. Projected pillar taps and label buttons exercise real navigation;
moved-away-and-back drags exercise
synthetic-click suppression. Assisted takeover retains manual-score ineligibility; fresh manual
launch restores it. Checks cover safe bounds, label restoration, warning/menu
priority, reduced motion, render immutability, route exit/reload and both flight modes.
Both built previews pass native input smoke checks with bloom enabled. The outdoor check
verifies physical brake travel, held neutral, menus, pause and route exit. The
Good Lift check replays its native recording exactly in the browser and Node, with hands-up
slide/release checks.

Physical-device, Safari and hosted/release acceptance remain separate from this local review.
