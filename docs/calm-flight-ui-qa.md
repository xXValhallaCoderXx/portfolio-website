# Good Lift launch, coaching and combo feedback

Local candidate based on `c6360ae`; changes are uncommitted. Preview:
`http://localhost:5190/good-lift/daily`.

## Behaviour

- One React launch dialog prepares the sky and verifies a challenge before enabling Fly.
  Preparing does not start the run clock, create audio, award achievements or write flight,
  run or kit progress. Fly consumes the prepared request once in its trusted input event.
- Result/menu Retry starts directly. Failed engine or game-module downloads recover through
  an explicit same-address reload because browsers cache failed module imports. Other sky
  preparation failures can retry in place. Cancelled loads cannot start or persist a run.
- Fixed-step coach intent supplies a shared identity, owner, urgency, acceptance and input
  acknowledgement to the text and handle cues. Correct input acknowledges after 150 ms;
  disagreement must last 300 ms to clear it. Numeric progress and accepted input do not
  create new screen-reader instructions.
- Ordinary navigation wording settles for 250 ms and refreshes no faster than once per
  second while its actionable demand remains the same. Different brake demands, targets,
  generations or depths update immediately. Internal alignment phases do not replace the
  human navigation heading.
- A direct reversal stays readable for at least 600 ms and until 150 ms of matching input,
  provided the required brake pair remains unchanged. Deliberate acro recovery uses a
  +/-0.05 rad deadband; startup and flight-envelope recovery retain their proven timing.
- Judge results and combos accompany the primary instruction. Scored moves show pending
  points, real chain multipliers, subtle event-driven animation and the existing soft tones.
  Banking has a 1.6 s confirmation and one independent polite announcement. Score and chain
  multipliers are labelled separately. Mute and reduced motion remain supported.
- Pausing, hiding the page, judging or urgent guidance clears transient combo feedback;
  old celebrations and sounds do not queue behind them. Pending facts may return quietly.

## Navigation policy decision

Initial experiments delayed already forecast brake commands and isolated the centering
cache. Those changes altered trajectories and failed existing opening-height acceptance.
They were removed. The released candidate retains the proven navigation/cache policy;
calmness is implemented in same-demand wording and acknowledgement, without delaying a
different physical request. Physics, scoring, recording format and simulation version are
unchanged. No replay goldens were replaced.

## Evidence

- `npm run verify` passed: 1,018 tests, type checking, architecture, production app build,
  server-functions build and lazy-bundle checks. Fixed-input replay goldens and the
  simulation fingerprint remain unchanged. `git diff --check` passed.
- `.artifacts/calm-flight-ui/report.json`: five Chromium profiles, 320 px phone through
  desktop, portrait/short landscape, first/returning storage, pointer/Enter/Space launch,
  keyboard input, pause, direct Retry, reduced motion and normal motion.
- `.artifacts/calm-flight-ui/launch-paths.json`: malformed sky/challenge, verified challenge,
  failed engine/game downloads and recovery, exit during loading, and fjord menu portal entry.
- `*-ready.png` and `*-flying.png` are live UI captures. `*-combo.png` uses an explicitly
  isolated DOM/presenter fixture over a paused flight; these screenshots do not claim an
  actual player earned those points. Physical combo earning is covered separately by the
  pitch-linking and 24 direct-lesson tests.
- Six visible direct pilots, three skies and 0.3/0.6 s reaction delays, retain the original
  gates: 450 m within 180 s, 500 m within 220 s, no assistance, stalls, tucks or strikes,
  and at least 35 m terrain clearance.

The earlier rejected navigation experiment is retained in
`.artifacts/calm-flight-ui/verify-before-navigation-fix.log`. Final repository checks are
recorded separately in `.artifacts/calm-flight-ui/verify.log`.

These are local Chromium and deterministic simulation checks. Physical-phone/Safari and
hosted deployment acceptance were not performed.
