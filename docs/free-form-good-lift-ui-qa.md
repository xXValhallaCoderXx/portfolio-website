# Free Form and Good Lift UI

Local implementation of the eight After screens in `game-ui-update.html`. Changes remain uncommitted. The reference file is unchanged.

## Behavior

- `fly.sh` and `/fly` enter Free Form. Its HUD identifies website exploration and offers Play Good Lift. The challenge hint is dismissible for the page visit. The paused menu has the four actual destinations, Resume, Game and Training cards, controls, sound availability, and a separate website exit.
- Game opens its prepared hub. Play starts the run. Escape toggles pause in Free Form, Game and Training. Practice Sky is explicitly unranked. Back remembers whether Free Form was paused; a direct entry has a website fallback.
- Training retains its six lessons and animated/static previews. Pause shows the active lesson and observed phase. Selecting a different lesson changes only the preview; Resume continues the active attempt, Restart repeats it, and Start begins the selected lesson afresh. Opening menus and previews earns no progress.
- The coach separates measured lesson progress from brake position. Its action, device cue, passive phase indicators, release instructions and handle callout use the existing structured requests. Original announcements, warnings, target feedback and bing remain. The actual nine steering phases include the intervening releases; preview steps cannot advance them.
- Result shows the actual ending, peak, first-line shortfall, banked kilograms, score and personal best. The Thermal climb action preselects the lesson without starting. Medal targets are correlated to the displayed run; feats are a separate section. The Board preserves initials validation, future-run naming, online consent, submission status and withdrawal. Kit keeps independent wing/harness choices, locked equipment, gear, reduced motion and lazy pictures.
- Available launch statistics are read from existing local records after the lazy Game entry has loaded. Best on device is labelled as such. Opening a Free Form menu does not load the Game runtime. Physics, lesson thresholds, scoring, simulation version and URLs are unchanged.

## Verification

`npm run verify` covers TypeScript, architecture, all **1,175 tests**, production build, Functions build and bundle splitting. The original baseline passed **1,168 tests**. Seven focused tests were added for preview ownership, observed phases, structured device cues, banked quits and correlated medal targets. `git diff --check` passes.

Browser artifacts are in ignored `.artifacts/ui-revamp/`:

| Receipt | Coverage |
| --- | --- |
| `flows-report.json`, `flows-final-report.json` | Full application at 320×640, 390×844, 768×1024, 1280×900 and 667×375, each with normal and reduced motion. Free Form and lazy entry, paused clocks/positions, Escape, held keys, explicit Play, six lessons, selection/Resume/Start, coach/handle geometry, native emulated touch and run ending. |
| `fixtures-report.json` | Result/Board/Kit at the same ten profiles. Zero-line and banked quits, medal targets, empty boards, touch/keyboard initials, blocked names, consent, world submission/withdrawal, clipboard sharing, independent kit, locked controls, lazy swatches and delayed updates preserving tab/focus/scroll. |
| `edges-report.json` | Invoking-screen returns, direct-entry website fallback, unranked Practice, consumed Enter, contextual Thermal preselection, independent sound/music preferences, active-lesson Restart, physical stall failure/recovery, both lazy import failure exits and cancelled loading. |
| `complete-report.json` | Steering physically completed by following canonical brake targets. No pose or observer was altered. Only the completed foundation lesson persisted; no ranked runs or tonnage. Next lesson starts Thermal climb. |
| `candidate.json`, `verify-final.log`, `typecheck-final.log`, `focused-final.log`, `final-smoke-report.json` | Revision, source/build hashes and final verification output. |

These are local Chromium and native emulated-touch receipts. Online behavior uses isolated UI fixtures and the repository's existing service/server tests; no public board data was submitted. Physical-device, hosted and release checks are separate.
