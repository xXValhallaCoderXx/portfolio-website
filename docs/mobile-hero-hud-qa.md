# Mobile hero and flight HUD cleanup

Local changes based on `dde6fce`, kept uncommitted for review. The hero and flight share the existing engine, scene, portrait camera framing and resize observer.

## Behavior

- Fresh mobile visits automatically load the animated hero. Reduced motion keeps the poster; the poster also remains during loading and after a module or WebGL failure. Visibility observations survive asynchronous loading, so an offscreen hero starts suspended. The existing slow-frame downgrade now applies to idle rendering too.
- Portrait phones use one card. Free Form places its identity and blue Play Good Lift action above ALT/CLIMB and Map/Menu. Game places Menu beside the identity, with ALT/CLIMB/BAR below. Training places its lesson/menu action beside the identity and ALT/CLIMB below. Desktop, tablet and short landscape retain a compact horizontal row.
- The card and readout rows use CSS grids. Safe-area insets remain in force and every HUD action is at least 44×44 CSS pixels. The coach follows the measured card and telemetry bounds. Scenery cues exclude the card and remain pointer transparent; controls retain their existing action and readout hooks.
- Long BAR values can wrap their units without pushing into another metric. The blessing rune retains its readout and animation hooks; the DEPTH stamp stays within the metric's label row.
- The challenge popup's markup, styles, action and state are removed. Free Form remembers whether Game or Training was opened from its paused menu. Prepared skies, explicit starts, navigation and session ownership remain in their existing services.

## Verification receipts

Current local receipts are in ignored `.artifacts/mobile-hero-hud/`. The browser script instruments WebGL drawing, audio creation/play and storage writes. Long-value fixtures change only DOM readouts and rune attributes. The slow-frame check scales RAF timestamps to exercise the downgrade threshold; it does not measure physical-device performance.

The earlier `.artifacts/ui-revamp/flows.mjs` and `final-smoke.mjs` checks now assert that the former popup and dismissal control are absent. The previous broader UI receipts are documented in [Free Form and Good Lift UI](free-form-good-lift-ui-qa.md).

`npm run verify` passed: TypeScript, architecture, all **1,175 tests** (zero failures/skips), production build, Functions build and bundle splitting. Output: `.artifacts/mobile-hero-hud/verify.log`. The production preview at `http://127.0.0.1:5191/` serves the current `dist/index.html`.

| Receipt | Coverage |
| --- | --- |
| `layout-report.json`, `browser-layout.log` | 64 passing checks across 320×640, 390×844, 440×956, 768×1024, 1280×900, 667×375 and 844×390. Free Form, Daily, Practice and Training; long ALT/CLIMB/BAR values, rune units, identity/action/tool/instrument separation, 44px targets, coach/handle clearance, native emulated touch, Map/Menu, Escape, explicit Play and Free Form return state. |
| `production-report.json`, `browser-production.log`, `production-*.png` | 102 passing checks on the production build. Includes the full viewport/mode matrix, normal-motion samples at 440×956, 1280×900 and 667×375, simulated safe-area insets, native hero entry/exit using the same engine, desktop/mobile resizing, offscreen suspension before and after loading, slow-frame downgrade, poster fallbacks and zero hero audio/run/progression side effects. |
| `candidate.json` | Base revision, uncommitted Git state, source/document/build hashes, browser version, command results and confirmation that the preview serves the current build. |
| `verify.log` | Full repository verification: 1,175 tests, builds, type checking, architecture and split boundary. |

The checks use isolated Chromium contexts and native emulated touch. No public board submission or physical-device run is part of these receipts.

Final production browser: Chromium **143.0.7499.4**, DPR 2, SwiftShader. All **102 checks passed**, with zero page errors. To repeat the local browser receipt after building, run `PREVIEW_ORIGIN=http://127.0.0.1:5191 REPORT_TAG=production node .artifacts/mobile-hero-hud/browser.mjs` from the repository root. The runner uses the existing local Playwright installation.
