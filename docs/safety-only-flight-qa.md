# Safety-only flight messages

Local follow-up to the mobile hero and integrated HUD work. All changes remain uncommitted. The existing hero loading, integrated HUD and reference images are preserved.

## Behavior

- Free Form and Good Lift Game show no routine coaching or entry card. The timed pillar and landing instruction tips are removed, including their presentation state and dismissal-on-input plumbing.
- Both modes retain a compact amber safety strip below the measured HUD and telemetry bounds. Physical recovery retains the current phase-specific action, including deep-brake entry, backfly and frontal collapse instructions. An attached warning uses its hazard label without exposing the routine instruction underneath.
- The compact strip omits lesson explanations, control chips, acknowledgements and progress bars. Its screen-reader announcement matches the visible text, does not repeat on progress or intent changes, and clears when the alert ends or an overlay blocks it.
- Automatic travel appears as `Flying to {destination}` in the existing telemetry. Boundary correction appears as `Returning to fjord`. Stalled/collapsed status takes priority; the status clears when manual flight resumes.
- Training retains its full coach, device-specific cue, actual brake targets, measured lesson progress, feedback, announcements and explicit lesson-start behavior. Switching between Training and ordinary flight clears the previous presentation.
- Instruments, brake controls and their labels, destination markers, achievements, judging, scoring and hazard effects keep their existing owners. Physics, scoring, replay format, simulation version, URLs and persisted data are unchanged.

## Verification

`npm run verify` passes all **1,178 tests** (zero failures/skips), TypeScript, architecture, production build, Functions build and bundle splitting. The focused presentation pass contains **36 tests**. Seven behavior tests cover concise warnings, recovery actions, announcement deduplication/blocking, presentation transitions and navigation status; four obsolete navigation-tip tests were removed with that feature.

Receipts are in ignored `.artifacts/safety-only/`:

| Receipt | Purpose |
| --- | --- |
| `baseline.json`, `baseline.patch`, `baseline/` | Preserve the pre-existing local changes and reference-image hashes before this follow-up. |
| `focused.log`, `typecheck.log`, `verify.log` | Focused and complete repository verification. |
| `native-training-menu-report.json`, `debug-menu.log` | Separate fresh-entry native Training Menu click, paused lesson and Escape resume checks, including touch-handle input beforehand. |
| `fixture.html`, `fixture.mjs` | Render the real markup, HUD adapter and coach view with controlled readouts/messages. No simulation is run or modified by these fixtures. |
| `browser.mjs`, `production-report.json`, `browser-production.log`, `production-*.png` | Rendered warning/recovery/Training fixtures and full-application control/navigation checks at 320×640, 440×956, 1280×900 and 667×375. The 440px profile uses normal motion; the others use reduced motion. |

The fixtures cover ordinary lift and urgent maneuver suppression, attached fog warnings, Game hazard labels, five physical recovery phases, compact geometry, hidden lesson content, blocked/cleared announcements and Training-to-safety transitions. Full-application checks cover Free Form, Daily, Practice and Training, native emulated touch or keyboard, Map/Menu, Escape and lesson/Free Form returns. The 440px checks also exercise automatic-travel/boundary telemetry and physically induced brake warnings in Free Form and Game. The longer raw-touch sequence uses Escape to open Training pause; the native Training Menu click is verified independently on fresh entry. A rapid mixed CDP/Playwright sequence delivered pointer events without a browser click, so the native Menu check is run separately.

All browser contexts are isolated. Fixture coverage is presentation evidence; physical warning checks use real flight controls. Boundary positioning and the elevated Free Form launch use existing debug session actions. No public board submission or physical-device run is part of these receipts.

The final production run passed **19 grouped browser checks**, with zero page errors, using Chromium **143.0.7499.4** and SwiftShader. The production app is served at `http://127.0.0.1:5191/`; controlled source presentation fixtures are served separately at port 5192. `candidate.json` records source/document/build hashes, test results, the separate native Menu receipt and confirmation that the preview serves the current build.
