# Responsive flight UI revamp QA

The reference is `concepts/new-game-before-after.html`, using all nine After boards. The shared flight HUD, coach, control diagram, paused menu and map apply to both portfolio flight and Good Lift. The game briefing and result sheet use the same presentation on phones and desktop.

## Implementation boundaries

- Physics, scoring, progression, saved-data formats and replay encoding are unchanged.
- Menu and map pause the fixed-step simulation and gameplay sound. Closing releases input and discards elapsed paused time. Music retains its own toggle.
- One message area prioritizes recovery/hazards/warnings, judges, introductory drag guidance, normal coaching and notices. Warnings sit above the current action.
- Briefing starts only through Fly or Enter/Space. Its back action returns to the portfolio.
- Reset requires confirmation; cancelling leaves both stores intact.
- Results retain board, kit, sharing, replay and music actions, with persistent summary/tabs/next-flight controls. Long detail panels scroll.

## Evidence

Local build and browser evidence lives in the ignored `.artifacts/mobile-ui-revamp/` directory. The browser harness records revision, source and build hashes, command, viewport geometry, screenshots and runtime errors. Run it against a built preview with:

```sh
QA_BASE=http://127.0.0.1:4196 node .artifacts/mobile-ui-revamp/browser.mjs
```

The viewport matrix is 320×740, 390×844, 844×390, 1280×800 and hybrid touch 1100×760. Each checks `/fly` and `/good-lift?sky=1`; hybrid uses reduced motion. The full built-preview matrix passed all 60 checks with zero browser console or page errors and 70 screenshots.

Native pointer/keyboard events cover drag activation, input release, actual menu/map pause, focus containment, overlay switching, reset cancellation, briefing launch/exit and result actions. Pause assertions compare canonical pilot/canopy positions and velocities, flight time, sky, meet and inputs across 650 ms. Rare warning/recovery/long-result fixtures deliberately alter console-accessible runtime state to expose layout cases; these screenshots are not evidence of scored or replay-valid flights.

After the full matrix, the only code adjustment was responsive instrument-unit typography. A rebuilt preview passed 12 final launch/layout checks at 320, 390 and 844 px in both modes, with zero errors. The glyph measurement confirms 7.67 px clearance between climb text and the bar column at 320 px. This final receipt is `report-layout-phone-small-phone-landscape.json`; `report.json` preserves the full behavioral matrix.

The independent result fixture is under `.artifacts/result-revamp/`. It covers keyboard tabs, kit callbacks and More-menu keyboard/focus/actions.

Repository validation passed with `npm run verify`: 904 tests, type checking, architecture rules, browser and functions builds, and the lazy-load split check. Its log is `.artifacts/mobile-ui-revamp/verify.log`. Physical-phone, Safari and deployed-site acceptance are separate; no deployment was performed. Changes remain local and uncommitted.


## Follow-up: pilot clearance and obsolete keyboard help

The supplied `blocking-desktop.png` and `keyboard-not-valid.png` informed this local follow-up. On wider flight views (safe viewport width greater than 560 px), the diagram now docks at the bottom right, outside the centre occupied by the pilot. Narrow phones retain the lower-centre layout. The diagram still shows the same relative drag and coach targets; gesture mapping is unchanged.

The paused menu's keyboard-shortcuts disclosure and visible key badges have been removed from the shared flight UI and result actions. The drag guide and normal keyboard focus/activation remain available.

Follow-up validation: 18 flight-cue tests, type checking, production build, lazy-load split check and diff check passed. The focused built-preview browser evidence is in `.artifacts/controls-followup/`, covering 1280×800, 752×892, 844×390, hybrid 1100×760, 390×844 and 320×740 in both flight modes. It checks safe diagram placement, camera-projected pilot clearance, pointer input through the diagram, stable anchoring, release to neutral and menu operation without keyboard hints. The focused receipt passed 32 scoped checks with zero browser errors: wide views include native drag checks, while unchanged phone layouts cover placement and menu operation. These receipts supersede the earlier layout snapshots for diagram position and keyboard-help content.


## Latest refinement: centered desktop controls and mouse/touch menu

The desktop diagram is now horizontally centered while retaining the lower, bottom-aligned vertical position. Short landscape screens keep the corner placement to leave the pilot visible; narrow phones retain their existing layout. This supersedes the right-aligned desktop position described in the previous follow-up.

The actual paused Menu uses an explicit “MOUSE / TOUCH · DRAG TO FLY” heading and plain drag/release descriptions, without arrow-style table labels, keyboard shortcuts, key badges or a fullscreen button. A fresh page load is required to replace the menu in an already-running flight engine.

The 18 flight-cue tests, type checking, production build, split check and diff check passed. All six fresh built-preview UI cases passed with zero browser errors: regular and narrow desktop views in both flight modes, plus phone and short-landscape Good Lift. They verify menu contents, centered desktop placement and at least 16 px clearance from the camera-projected pilot body. Evidence and 12 screenshots are in `.artifacts/menu-centering/`; source and build hashes match the receipt. Previous browser receipts document earlier UI states.
