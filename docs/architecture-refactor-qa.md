# Application architecture refactor QA

Local working-tree candidate based on `e017b733c8ec58f13b9982a8a66ec283b0968f5e`,
19 October 2026. All changes are uncommitted and unpushed. No deployment performed.

Review the [production preview](http://localhost:4191/),
[outdoor flight](http://localhost:4191/fly) and
[Good Lift](http://localhost:4191/good-lift?sky=1).

`npm run verify` passed: **897 tests, zero failures**, strict checks in all four environments,
architecture checks, both builds and bundle-split checks. All ten flight/browser layout cases
and the extended website checks passed with zero page errors. Final comment/spacing cleanup
produced the identical production artifact used by browser QA (`comment-cleanup.json`).

## Delivered structure

Shared atoms/molecules/hooks contain reusable UI. Home, projects and experience own their pages,
components, services and feature styles. Flight and Good Lift own lifecycle hooks, typed session
services and presentation; explicit adapters own scene, camera, HUD, controls, audio and storage.
Result/kit models and board selection live in services. Portfolio, flight, coaching, competition
and progression rules live in domains with plain models and injected environment operations.

All authored source, workers, functions, tests and tools use strict TypeScript. Browser, worker,
Node and test configurations check their own environments; browser code rejects unused locals.
Import checks reject UI/environment dependencies in domains and feature dependencies in reusable
UI. Source-graph and production-bundle gates enforce the lazy Good Lift entry. CI runs typing,
architecture, tests, server bundling and bundle-split checks before the existing hosting workflow.

Old paths, duplicate implementations and compatibility reexports are removed. Existing current
data normalization, validation and blocked-storage behavior remain. The start screens now describe
drag controls instead of the removed flight keys. See [architecture.md](architecture.md) for
ownership and commands.

## Behavior and evidence

URLs/history, gallery focus, worker lifecycle, flight handling, camera, scoring, recordings and
saved data retain their behavior. Simulation **3**, fingerprint **`b9dd2bdb`**, recording format
**2** and storage keys are unchanged. All four committed Chromium fixtures are byte-identical
after relocation. Emitted JavaScript comparison also verifies unchanged solver, envelope,
atmosphere, terrain, landing, meet-state and replay implementations, excluding relocated imports.

Evidence is under ignored `.artifacts/architecture-refactor/`. `verification.json` binds the
final source/build digests, baseline revision, command results and browser receipts.
Final source SHA-256: `7d4fe0f08bbd1f89531036fba2947a53531b915331fb8639a23c8ef5d02f991b`.

| Gate | Evidence |
| --- | --- |
| Strict types, architecture, complete tests, application/function builds, bundle split | `verify.log` |
| Source/runtime comparison and unchanged browser fixture hashes | `domain-runtime-comparison.json`, `verification.json` |
| Responsive website: desktop, phone portrait and landscape | `frontend-smoke.json`, screenshots |
| Production worker updates/disposal, gallery keyboard/focus, history/reload and missing routes | `frontend-extended-smoke.json` |
| Both flights: native drag, fixed panel, hands up, mirrored/suppressed coach targets, warnings, menus, pause/reset, assistance, cancellation and input switching | `browser.json`, screenshots |
| Production bloom on/off, native proportional input, exact browser and Node replay of a live run | `preview-smoke.json`, `preview-native-flight.json` |

Flight layouts cover 1280×800 desktop, 390×844 portrait, 320×740 small portrait,
844×390 landscape and 1100×760 hybrid input. Checks include reduced motion, safe bounds,
finger clearance, noninteractive cues and warning priority. Repeated rendering-only calls
preserve flight/coaching/progress/recording state. Headless Chromium uses SwiftShader with native
mouse and CDP touch events; this is browser emulation rather than physical-device acceptance.

Verification runs on Node **24.21.0**, TypeScript **6.0.3** and Vite **8.3.4**. The function bundle
targets Node **22**; hosted Node22 execution, physical devices and deployment are separate gates.
