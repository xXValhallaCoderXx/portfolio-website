# Board-first Good Lift results

Local implementation inspired by the compact Board variant in `result-board.html`. The reference is unchanged; implementation changes remain uncommitted.

## Behavior

- Each new finished Game run opens Board, followed by Result and Kit. A compact summary shows the actual points, banked weight, peak, strikes and new-best status. Longer ending explanations, first-line guidance, charts, feats and medal details remain in Result. Existing flight and equipment actions retain their owners.
- The Board distinguishes this browser's scores from the world leaderboard. It keeps genuine rankings, the bot target, the current-run highlight, and the existing eligibility rules. Empty decorative rows are removed so the real scores and submission form are easier to reach.
- Eligible Daily results have one ordinary three-letter initials field and an explicit **Submit score** action. Native touch opens normal text entry; keyboard input, selection and paste work normally. Typing only changes the draft. Incomplete and blocked initials cannot submit.
- Submission is per result, including for existing users whose stored `optIn` was true. Completion, replay verification, leaderboard reads, typing and subsequent runs never publish automatically. Initials are remembered only after an explicit submission action. Local saving, verification, publishing, success, higher-score, rejection, retry and withdrawal states are distinct.
- The result controller names the finished verified log by re-encoding initials metadata only, replacing its existing local row in place. Its format, rules version, controls, steps, canonical flight identity, original row time, score and progression stay intact. A result outside the local board's retained rows is not inserted by naming it.
- A slow leaderboard read does not delay a failed submission's Retry action. Duplicate clicks share one pending submission; late reads and submission responses cannot overwrite a retry or a newer result. Delayed bot/world updates preserve the current tab, focus, scroll and draft.
- Only verified Daily runs judged by fog, landing or the time limit can publish. Practice, non-Daily challenges, early quits, failed verification and builds without a world-board URL show their local-only explanation. Existing removal semantics remain, including a copied run owned by another browser. Removing an entry never republishes it.
- **Copy link** is available from every tab and copies the latest complete verified challenge URL. There is no URL textarea, visible URL, native share-sheet action or failure fallback that reveals it. Copy feedback resets when the result or its link changes.
- Mobile, tablet, desktop and short landscape retain safe-area spacing, a separate detail scroller and persistent flight actions. Buttons and the initials field provide at least 44px touch targets. The score and altitude columns accommodate longer values without crossing neighboring columns.

## Verification

`npm run verify` passes TypeScript, architecture, all **1,199 tests** (no failures, cancellations or skips), the production build, Functions build and bundle splitting. The focused service/presentation pass contains **37 passing tests**. It uses a real recorded flight to assert that naming preserves replay results and canonical identity, replaces a row without duplicate progression, and retains ranking tie-breaks. It covers legacy consent, invalid/unranked/unverified results, duplicate requests, explicit later submissions, network and server outcomes, slow reads, stale results, retries and withdrawal.

The rendered source checks passed **33 grouped browser checks** in isolated Chromium contexts at 320×640, 440×956, 768×1024, 1280×900 and 667×375. They exercise the real result component, controller and browser transport with intercepted responses: native emulated touch and typing, real clipboard paste/copy, validation, Enter, sending/success/error states, one request per submission, unchanged local progression, withdrawal, delayed updates, copy failures, navigation actions, larger values at 320px and 440px, reset behavior for a new result, a reduced phone viewport and rectangle/touch-target assertions.

The full-application check passed **8 grouped checks**. It starts Daily with native emulated touch, holds ordinary full-brake keys until a physical fog ending, verifies the real recording, enters new initials and submits it to the actual backend validator backed by a temporary in-memory store. The validator accepts the named recording; its canonical identity, row count and progression remain unchanged. Copy, removal, Again, early quit and idle Training selection also pass. No simulation state or result score is changed to force the ending.

The built-preview receipt passed **10 grouped checks** covering the served entry against `dist/index.html`, native Practice ending, the five responsive sizes, Result/Kit, clipboard copy and the return to Free Form. It blocks external writes. The full gate, source checks, live run and production receipt are summarized in the final candidate receipt.

## Receipts and reproduction

| Receipt | Purpose |
| --- | --- |
| `focused.log`, `verify.log` | Focused service tests and the complete `npm run verify` gate. |
| `fixture.html`, `fixture.tsx`, `browser.mjs`, `browser-report.json`, `browser.log` | Real result presentation/controller with controlled scores and isolated network responses, screenshots, source hashes and grouped assertions. |
| `live.mjs`, `live-report.json`, `live.log`, `live-*.png` | Full application through Play, a physical judged ending, explicit submission, copy, withdrawal, Again, early quit and Training selection. Browser requests reach the real Functions validator through an in-process board store. |
| `production.mjs`, `production-report.json`, `production.log`, `production-*.png` | Current built preview entry, native Practice ending, responsive results, Result/Kit, clipboard copy and Free Form return. External writes are blocked. |
| `candidate.json` | Base revision, final source/document/build hashes, verification counts and served-preview identity. |

The source fixture is served by Vite on port 5192. The isolated live check uses a separate Vite process on port 5193 with `VITE_BOARD_URL=https://scores.goodlift.test`; Playwright intercepts that reserved test host and calls the actual validator with temporary in-memory storage. It sends no requests to the public leaderboard. Each context closes after its run, and the temporary board is discarded. The temporary port 5193 server was stopped after verification; the ordinary preview and source-fixture servers remain available.

The original production receipt above used a build without `VITE_BOARD_URL`, which correctly presented local-only results. The follow-up below configures the current local preview to use the live board. The original submission tests remain isolated browser and backend-validator evidence; physical-device, hosted and release acceptance are separate.

## Live leaderboard from local development

At the user’s request, this checkout now has the existing public production endpoint in the ignored `.env.local`. Both the running development server on port 5192 and the rebuilt production preview on port 5191 load it. README documents the setup and current per-result submission flow; local Vite overrides are ignored by Git. No backend or CORS deployment was needed: the deployed function already accepts localhost and 127.0.0.1 origins, and its rules version matches this client (5).

`npm run build`, `npm run check:split` and `git diff --check` pass. Direct reads from both preview origin variants return HTTP 200 with the appropriate CORS response. The live connection receipts, browser screenshots and current build identity are in ignored `.artifacts/live-board-local/`. The earlier full 1,199-test verification covers the unchanged application source.

Open `http://127.0.0.1:5191/good-lift/daily` and complete the Daily run. Board shows the local results, initials field, **Submit score**, and live world leaderboard. Clicking Submit now publishes to the real board. Opening results or typing initials still sends no score.

The live browser follow-up passed **4 grouped checks** after an ordinary physical Daily ending. The real board read returned HTTP 200 through browser CORS, and the initials field and enabled Submit score button were visible. Typing was checked with all non-GET requests to the live endpoint blocked and counted: **zero writes were attempted**. Today’s board was empty at the time of this receipt. All browser contexts were closed after verification.
