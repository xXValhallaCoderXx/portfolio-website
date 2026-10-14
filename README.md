# portfolio-website

A terminal-styled portfolio with a flight in its hero: visitors can scroll the page as usual, or
steer a paraglider over a night fjord and land at the place for each section.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` writes the static site to `dist/`.

## How the page and the flight fit together

- The page is the website. The fjord idles behind the hero; its glider can be pulled about with
  the mouse and swings back when let go, but nothing there is needed to use the page.
- "Take-off", at the foot of the hero, is the way in to the route: clicking it scrolls to the
  first section. On a phone the hero stops short of the window so that it shows.
- Below the hero the page is one flight path with a waypoint per section. A small glider follows
  the path as the page scrolls, and the top bar counts its height down. Scrolling is never taken
  over. As the hero scrolls away the fjord's camera climbs until the scene reads as a map, and
  the path starts where the glider hangs.
- On a phone, Experience reads one career camp at a time: pick from the compact ridge or list,
  use Older/Newer or swipe the summary, then explore the report a section at a time. It starts
  at the current role with its chapter closed, and keeps reading mode when changing camps.
  Desktop keeps a career list with summaries/titles controls and Report/Behind tabs. The existing
  rune ridge and live view follow the role being read. Both layouts use the same career reader
  in the page and flight panels; sketches run only while their Behind tab is visible.
- Three projects have a playable preview: a scripted model of what the product does, never the
  product itself. Each project also has its own address, `/projects/<id>`, with the full report.
- Project reports use a screenshot-led header and a selectable contribution tour. Screens open
  in a gallery with arrow-key navigation and Escape to close; the phone layout uses numbered
  contribution buttons and a compact stage selector for Hird's sample run.
  The project pages and the reading windows in `fly.sh` use the same detail component. Escape
  closes the gallery first, then the project window, leaving the visitor at the forge.
- `[ ./fly.sh ]`, the `fly.sh` tab or a section's "fly to" link starts the flight. It fills the
  window, locks page scrolling and moves the address to `/fly`.
- The swap in either direction plays behind a short warp of star streaks.
- In flight, `[ h: controls ]` at the top right lists every key. Shift speeds time up. Clicking a place's pillar or label makes the glider fly itself
  there, and steering takes control back.
- Space, ↓ and S (▼ on a touch screen) are one brake that goes deeper the longer it is held. A
  fifth of a second in it is light: the wing slows to where it sinks least and turns a circle of
  about 8 m instead of 14. Held on, it goes deep (after about half a second over the fjord, eight
  seconds in Good Lift): slow and steep, the way down into a ring. A meter under the hint shows
  it, and letting go of the key for a fifteenth of a second (70 ms) returns a deep brake to a
  light one. Over the fjord the wing never stalls, however the brake is held, and the meter shows
  no red. Past the arch it can: red grows in from the right as the wing nears a stall, held into
  the red it stalls, and in a turn it spins toward the inside wing; it recovers by itself, sooner
  with the brake let go. ↑ or W is the speed bar: hands up, faster, sinking more and turning
  wider. In Good Lift, ← and → held together push the bar as well, as ◀ and ▶ do on a phone.
- Landing at a place opens the same section the page shows. "Open on page" leaves the flight at
  that section; Escape, the exit button and the browser's back button leave it too.
- A manual landing briefly shows distance from the centre, a grade, points and the best distance
  for that place. Accuracy supplies 95 points and a soft arrival supplies up to five more.
  Map travel, automatic flight and "fly me to next" do not score, including after taking control
  back. A fresh manual takeoff starts a new scoring leg. Light approach wind is shown by each
  windsock; the forge floats you longer, rune ridge has lee-side sink, and the beacon is a small island.
- Good Lift is the game through the glowing east-shore arch: a powerlifting meet in the sky. Turn
  hard right for roughly two seconds after launch, then glide east through the arch. The arch is a
  door: the page warps to `/good-lift/daily` and the run starts at the gate, with the same scene
  and sound. Back leaves it for the fjord. After discovery, the map and the menu offer
  `[ Good Lift ]` directly. Its code, its models and its styles load only once the glider closes
  on the arch (inside 70 m), so the home page never carries them.
  - **Addresses.** `/good-lift/daily` is the Daily Sky, the same for everyone that UTC day; the arch
    opens it and R flies it again. `/good-lift` is practice, a new sky every run.
    `/good-lift?sky=<hex>` is one named sky. Any other address under `/good-lift/` is the missing
    page. Opened directly, an address shows a start screen first, because sound needs a click.
  - **Lift.** The amber column beyond the arch lifts you clear of the hillside and then wears out.
    After that the lift is hidden: a flock of ravens circles inside each live thermal, so find the
    birds, fly to them and climb beside them, turning the way they turn. Sparks and the core ring
    show only from close by. Two thermals are alive at a time; each fades with use and with age,
    and when it dies its ravens fly on to the next.
  - **Centring.** A hunted thermal lifts hardest at its very middle, so a circle drifted off it
    climbs harder on the side nearest the core than across from it. In a run the vario's beep
    keeps rising in pitch and pace all the way up a core (`src/game/vario.js`). As the lift surges
    on the near side, a soft swell is heard from the core's side and the vario readout flares
    (`run-surge.js`, which feels for it with the thermal's own waxing and wearing out taken away).
    Straighten for a beat in the surge and turn again as it fades, and the circle moves onto the
    core. From the second thermal on, a circle that missed the core gets the hint for it.
  - **Music.** Once through the rune gate, and only there, quiet background music plays: the two
    tracks in `public/music/`, one after the other, each brought to the same low level
    (`src/game/music.js`, where each track's measured loudness is kept). It plays on between runs
    and stops as you leave for the fjord or the page. It has its own switch, `[ music: on ]` or B,
    apart from the sounds' (`[ sound: on ]` or L), and switched off it stays off on the next visit.
    The fjord and the page never play or fetch any of it.
  - **The title card.** A run opens with a card over the scene: the sky (`Daily #12 · 14 Oct`),
    GOOD LIFT slammed in over a barbell being loaded, and a typed line saying what to lift, or who
    there is to beat. Retries get a shorter card.
  - **The meet.** Every 250 m is a line where three judges' lights check the lift since the last:
    contact (any raven or kettlebell strike), control (any stall or spin) and airspace (more than
    1.5 s in cloud). Two or more white lights make a good lift and bank the bar into the TOTAL;
    otherwise the plates drop into the mist. Either way the next bar starts empty at 25 kg. Plates
    come from full circles turned the flock's way in lift (reps: 2.5 kg each, or 5 kg for a rep to
    depth, a circle whose middle stayed within 7 m of the core, stamped DEPTH beside the bar), from
    a trail of 5 to 25 kg plates laid on the bar's glide from a dying thermal toward the next
    flock, and from close calls.
  - **Hrungnir.** From 550 m the giant throws kettlebells, each with 2.4 s of warning: a grunt from
    his side, a red ring where it will land and, if that is off the screen, a chevron at its edge.
    It is aimed where the wing will be if the pilot holds what they are doing, so changing that
    dodges it: circling, push the bar; flying straight or on the bar, turn. A hit folds the wing
    as a raven strike does; a miss under 9 m is a close call, worth 10 kg.
  - **The horn.** At 110 s Gjallarhorn sounds, just as the fog starts to race, and every good lift
    after it banks double. The fog, or touching down, ends a run and judges what is on the bar at
    face value; Escape ends a run and forfeits it. Retrying, Back and leaving the page end a run
    silently.
  - **Hazards.** Touching a raven collapses the wing, which costs about 60 m and a moment of
    steering, and then nothing can strike for a few seconds. Storm clouds drift through in layers
    from about 580 m; inside one there is no lift, the wing sinks and the view greys out. A breeze
    of 2-4 m/s turns as you climb, and every 16-26 s a gust band crosses the zone, drawn as a
    curtain of bright streaks before it arrives. A front that reaches a braked wing from behind can
    tip a deep brake into a stall. Above 260 m a stall costs about as much height as a strike.
  - **The meet sheet.** When a run ends, the sheet shows the TOTAL, the peak and the best, the
    reps flown and how many were to depth, the climb drawn over the rising fog, a row of lights for
    every lift (a filled white disc or a hollow red ring, with the judge's name, so colour is never
    the only sign), the feats, and a line to share the run by, such as
    `Good Lift · Daily #12 · 512.5 kg · 1,412 m · ⚪⚪⚪ ⚪🔴⚪`. R flies again, `[ new sky ]` gives
    practice and `[ today's sky ]` returns to the Daily Sky. The sheet covers the game's own
    switches, so it carries the music's (`[ music: on ]`, or B).
  - **Replays and challenges.** A run is its seed and its four controls (left, right, brake, bar)
    step by step, and nothing else: every run is recorded (`src/game/recorder.js`) and, as it ends,
    replayed in the page (`replay.js`), and only a run that replays to the very same sheet gets a
    link and a place on the board. The share line carries that link, `/good-lift/daily#vs=…`
    (a whole run is about 1-2 KB of it). Opening it replays the run before the start screen, which
    shows what it truly came to (`to beat: … kg · … m · verified`; what a link claims is never
    trusted), then flies the same sky; the sheet gives the verdict, and a race on today's sky puts
    the challenger on the day's board. `SIM_VERSION` (`src/game/sim-version.js`) names the rules a
    run was flown under: a test fingerprints every tuning table, so changing how a run flies without
    a new version fails `npm test`, and a link from other rules is refused rather than misread.
    Version 2 brought the peaked cores and reps to depth.
  - **Feats and the board.** Opener, Under the horn, Giant-dodger, Clean meet, the 1,000 lb club
    and Training block (the Daily Sky seven days in a row) are Good Lift's own feats: the sheet
    names any new ones when it opens, never during a run, and they never move the fjord's belt. Each
    Daily Sky keeps a board of this browser's ten best runs, ranked by total, then peak, then the
    earlier run, under three initials. Good Lift keeps all of this under its own `good-lift-v1`
    key (`src/game/good-lift-store.js`, `board.js`), apart from the fjord's progress.
  - **Everything else.** The map pauses the run and leaves the portfolio's places off: the way to
    them is `[ back to the fjord ]`. Time boost is off in a run, and on a touch screen the »
    button is a second brake, so the four buttons sit as two pairs. Each sky is laid out from its
    own seed, and the same seed always gives the same sky. Best height and discovery are saved
    locally; Reset progress clears them and Good Lift's store together.
- Phones, and visitors who ask for reduced motion, get a still image in the hero. The 3D code
  loads for them only if they choose to fly.
- In an upright window the hero is two bands, the scene above the words, so the glider is never
  behind the headline. In any small window the top bar is one row and the hero says less. The
  rules are together at the end of `src/styles.css`, under "small windows".
- On a touch screen the flight shows as little as it can: a line of readouts, a map button and a
  menu, and round buttons to fly with. Key names are left out of every button there.

- Any other address is a missing page, and gets an emergency of its own: the wing collapses and the
  visitor either throws the reserve in time and lands in a tree, or does not and is fished out of
  the fjord by the longship. The way home is on screen from the first moment. The story is in
  `src/game/lost.js`.

The host must serve `index.html` for every address (a single-page-app rewrite), or direct links to
the flight, to a project and to missing pages will show the host's own error page instead.

## Where things live

- `src/content.js`: everything a visitor reads. The page and the flight both draw from it.
- `src/App.jsx`: the top bar, the hero, and which of the page, a project or the flight is showing.
- `src/components/Route.jsx`, `src/route.css`: the flight path and its waypoints.
  `Sections.jsx` is what each waypoint holds, and what a landing in the flight shows.
- `src/components/demos/`, `src/components/sketches/`, `src/demos.css`: the playable previews on
  the projects and the sketches in the field reports.
- `src/components/Experience.jsx`, `src/experience.css`: the shared career reader. It adapts to
  its container width and reads roles, reports and sketch names from `EXPERIENCE` in `src/content.js`.
- `src/components/ProjectDetail.jsx`, `src/project.css`: the shared project reports; `ProjectPage`
  adds standalone page navigation. Layouts adapt to the available page or window width. Gallery
  images, captions and contribution highlights live in `PROJECTS` in `src/content.js`. Replace
  a screen's `src` and `alt` and remove `placeholder` when its real screenshot is available;
  highlights use percentages of the uncropped image. Runtime images belong in `public/projects/`.
- `src/game/`: the flight. `game.js` runs it: input, HUD, map, sound and the arch's portal; `terrain.js` is the
  world; `scenery.js` is the sky, buildings and glider; `achievements.js` is progress and belts;
  `landing.js` scores a landing, `approach.js` is the wind at each place (and the breeze the
  streaks draw over the fjord) and `gateway.js` the arch. `flight.js` is how the glider flies:
  airspeed and sink, the brake, the speed bar, the stall and gusts, with no 3D code, so tests fly
  it; `stall-effects.js` is what a stall does to the wing and camera and what the brake meter
  shows; `fjord-hints.js` picks free flight's line of advice; `wind-streaks.js` draws the wind;
  `vario.js` is the variometer's beep.
  `hints.js` holds what every hint shares. `lost.js` is the missing page and `ridge.js` the small
  live view of rune ridge on the page.
- `src/game/good-lift.js` and everything it imports: Good Lift, loaded through one `import()` in
  `game.js`. `run-step.js` is one fixed step of a run (the wing, the sky, the meet and the
  kettlebells, in one order) that the game and the tests share; `cloudbase-state.js` is the run's
  sky (seeded thermals, ravens, storm clouds, wind, gusts and fog); `meet-state.js` is the meet
  (plates, lines, lights, the horn) and `bells.js` Hrungnir's kettlebells. None of these has 3D
  code, so `npm test` flies them. `cloudbase.js`, `ravens.js` and `meet-view.js` draw a run;
  `run-effects.js` is what it does to the wing, the picture and the camera; `run-surge.js` feels
  for the lift surging as a circle closes on a core; `cloudbase-hints.js` picks its one line of
  advice; `daily.js` is the Daily Sky; `meet-card.js` works out the meet
  sheet (feats, the share line, the barogram) and `src/components/GoodLiftResult.jsx` draws it,
  shipped with the game; `good-lift.css` styles its readouts and the sheet.
  `good-lift-address.js` reads the game's addresses and imports nothing, so the page can use it.
  `npm run check:split` checks the built page carries none of the game, and `split.test.js` checks
  the same of the source.
- `public/poster.jpg`: the still shown in the hero before the live scene loads.

## 3D models

Put a raw `.glb` export in `models-raw/`, then shrink it into `public/models/`:

```bash
npm run models
```

A model's file name is the name the scene loads it by, so keep them short and stable (`hall.glb`,
`pine-tree.glb`). Where each one stands is set in the `FURNITURE` table in `src/game/scenery.js`.
`concepts/` holds the images the models were generated from.

The optimizer maps the new generator filenames to `windsock.glb`, `gateway.glb`, `raven.glb`
and `clouds.glb`. To process just these sources, run `npm run models -- windsock gateway raven clouds`.
The windsock and gateway load with the fjord. The raven, the storm cloud and the kettlebell load
as the glider closes on the arch, or the first time Good Lift starts, with simple stand-ins drawn
until they arrive. The kettlebells glow in a copy of the forge prop's material, so the forge's own
bell is never changed. The raven's file has a
skeleton but no animation, so its wingbeat is posed in code (`src/game/ravens.js`); it is drawn
about three and a half times life size and lit a little, because a real raven at 200 m against
a night sky is four dark pixels.
Run `npm test` for the scoring, progress, gateway, flight and Good Lift checks. The deploy
workflow runs it, and `npm run check:split`, before every deploy. The Good Lift tests include
reference pilots (`src/game/pilots.js`) that fly whole runs through `run-step.js` in the run's own
wind, with their hands up or circling on the brake, which catch a large shift in how hard the
game is: if a tuning table in `cloudbase-state.js` or `flight.js` changes, they say whether
1,000 m and 1,500 m are still roughly where they were. Recorded runs of those pilots are pinned to
the bit, so any change to how a run flies shows. The measured numbers are in comments beside the
tests. `src/game/golden.test.js` replays runs flown in Chromium on keys alone (recorded with the
git-ignored `.artifacts/flight-qa/golden-qa.mjs`) and must land on the sheets the browser showed.
Retuning anything a run is flown by needs a new `SIM_VERSION` with its fingerprint pinned in
`sim-version.test.js`, and the golden runs recorded again: a new version is also a new Daily Sky
and a new board. `DAILY_EPOCH` in `src/game/good-lift-address.js` is the UTC day of Daily #1.

`concepts/` and `models-raw/` are local source folders, ignored by Git and unused by the production
build. Back them up separately if you want to regenerate or edit the models later. Keep
`public/models/`, `public/projects/` and `public/poster.jpg` in Git: Vite copies these runtime
assets into `dist/`, so a fresh checkout can build without the raw sources. `npm run models` is
an optional authoring step, not part of deployment.

For a checkout that already tracks the source folders, stop tracking them once with
`git rm -r --cached -- concepts models-raw`. This preserves the local files; it does not remove
them from older commits.

## Firebase Hosting

This is a static Vite app. `firebase.json` deploys only `dist/`, rebuilds before `firebase deploy`,
and rewrites addresses to `index.html` for `/fly`, `/projects/<id>` and the missing-page flight. It caches Vite's
hashed bundles for a year; HTML, models and images revalidate because their filenames stay the
same when their contents change.

Serve the optimized GLBs from the same Firebase Hosting site at `/models/*.glb`. They are small,
self-contained files with embedded textures and already use Meshopt compression. A separate
storage bucket or model CDN is unnecessary for this site.

Install the [Firebase CLI](https://firebase.google.com/docs/cli) and sign in with `firebase login`.
This repository targets [`renate-gouveia-portfolio`](https://console.firebase.google.com/project/renate-gouveia-portfolio/overview)
through `.firebaserc`. The config is ready to use; there is no need to run `firebase init` or add
a Firebase SDK to the app.

To check the built site locally with Firebase's routing and headers:

```bash
npm ci
npm run build
firebase emulators:start --only hosting --project demo-portfolio
```

Open http://localhost:5000 and check `/`, a direct visit and refresh at `/fly`, an unknown address,
project images, and the 3D models. The `demo-` project ID keeps this local check independent of a
real Firebase project.

To publish a temporary preview, then deploy the live site after reviewing it:

```bash
npm run build
firebase hosting:channel:deploy prelaunch --project renate-gouveia-portfolio
firebase deploy --only hosting --project renate-gouveia-portfolio
```

### Automatic deployment from GitHub

After `.github/workflows/firebase-hosting.yml` is merged, every push to `main`, including a merged
pull request, starts the **Deploy portfolio** workflow. It installs dependencies with `npm ci`,
authenticates to Google Cloud, and runs `firebase deploy --only hosting`. The predeploy hook
builds `dist/`; a failed build stops the deployment.

Follow the run in [GitHub Actions](https://github.com/xXValhallaCoderXx/portfolio-website/actions/workflows/firebase-hosting.yml).
A successful run publishes the site at https://renate-gouveia-portfolio.web.app. To deploy again
manually, open **Actions → Deploy portfolio → Run workflow** and select `main`.

GitHub authenticates using [Workload Identity Federation](https://github.com/google-github-actions/auth),
which issues temporary credentials. The configured provider accepts only this repository's
`firebase-hosting.yml` workflow on `main`, triggered by `push` or `workflow_dispatch`. The
`github-hosting-deploy` service account has Firebase Hosting Admin and API Keys Viewer roles
in `renate-gouveia-portfolio`. This setup uses no service-account keys or repository secrets.

The Google Cloud provider is
`projects/194838900506/locations/global/workloadIdentityPools/github-actions/providers/portfolio-main`.
Its repository and owner conditions use GitHub's numeric IDs. If the repository moves to a new
owner or the workflow is renamed, update the provider's conditions as well as the workflow.

Firebase Hosting includes a [global CDN and usage quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing).
Monitor data transfer as traffic grows; move models to separate storage only if their size or
release workflow warrants it.
