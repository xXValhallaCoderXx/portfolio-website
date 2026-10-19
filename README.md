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
- Manual flight uses one wing model in the fjord and Good Lift. Left/right (or A/D) steer;
  Space/↓/S holds a repeatable working brake; ↑/W pushes the speed bar; E holds big ears for
  deliberate descent. Release ears, then brake to reopen faster. Both steering keys together
  remain a keyboard shortcut for the bar. Touch has five fixed buttons: left, right, brake, bar,
  ears. A thumb can slide outside a captured button without dropping its input.
  Good Lift also accepts a mouse or finger drag anywhere clear of its UI: left/right pulls that
  brake, down pulls both, and distance sets travel. Release for hands up. Full travel reaches deep
  brake directly and can stall. The two small meters show each hand; their marks indicate working
  depth. Blend a gentle downward and side pull to circle in lift, using actual brake forces.
  Bar/Ears buttons remain
  available on desktop. A fresh key/button press takes control from a drag; maps, menus and pause
  clear held input. The fjord's pillar clicks and hero interaction retain their existing behavior.
  Hold brake with one direction for a coordinated soaring turn: it banks less, turns sooner and
  spends less height than the ordinary turn. Releasing keeps its momentum while the wing levels.
  Brake input is manual; neither the coach nor rising air applies it automatically. Ordinary
  steering and energetic acro retain their own response. The pilot visibly leans into the
  coordinated turn, while its position and the canopy's position follow the physical suspension.
- The canopy and pilot have separate physical positions and velocities. Four aerodynamic samples,
  gravity and a tension-only suspension produce banking, pitch, surges and energy-limited acro.
  Steering shapes brake loading; it never sets heading directly. The same 60 Hz simulation, with
  four internal substeps, runs live play and the leaderboard verifier.
- Wingovers build through well-timed reversals. An energetic swing can carry the pilot over the
  canopy into an inversion. Neither a button threshold nor a rhythm sequence starts a preset loop.
  Maneuvers spend altitude; cycling controls cannot produce free energy in still air.
- The flight coach gives a direction, an action and a reason, with matching keyboard/touch cues.
  Travel stays quiet: ridge soaring needs 1.5 seconds of actual along-cliff lift, and thermalling
  needs three seconds of useful circling in the same drifting source. Brief weak patches have
  exit grace periods; selecting a destination never activates its coach. It distinguishes holding
  a turn from releasing it and checks advice against terrain, clouds and fog. A manual brake turn
  can receive advice anywhere the sampled rising air supports the complete arc and its exit.
  An established ridge keeps RIDGE SOARING through that turn; elsewhere the card says SOARING TURN.
  These headers stay stable while the action and warning change. Weak or horizontal wind alone
  does not open turn coaching. Fjord flight gives reactive guidance for deliberate wingovers
  and pitch moves; Good Lift teaches them only during its altitude lessons.
  Pitch shaping releases at the observed backswing reversal, including a weak one, and catch
  advice follows forward motion rather than a fixed waiting period.
  Completed or cancelled moves require fresh inputs and motion before coaching can restart.
  Praise stays beside the next action, and the only progress bar measures steady recovery.
  Inverted flight offers orientation and a recovery action.
  One complete wingover cycle, pitch-and-catch or
  inversion earns pending style, banked after one second of stable flight. A failure loses pending
  style. Ordinary turns and air-induced swings earn no maneuver rewards. Style multiplies the
  lifted total, up to twice it, and is checked again during server replay.
- Windward terrain bends air upward; lee terrain shelters the wind and brings bounded sink and
  turbulence. Forces, particles, windsocks and instruments sample the same three-dimensional
  field. Thin, world-anchored flow ribbons connect incoming wind to its upward bend over the face;
  traveling arrowheads show direction, warm air rises and cooler lee flow descends. They are
  sampled air paths, not painted lift zones. The HUD's compass says where the local wind flows,
  while its relative arrow turns with the wing. The vario reports the glider's actual climb.
  The canopy and pilot render from interpolated simulation snapshots, with a stable horizon
  and camera obstruction avoidance. Reduced motion retains useful airflow and timing information.
- The first three runs show a briefing before their clocks and recorded controls begin.
- Landing at a place opens the same section the page shows. "Open on page" leaves the flight at
  that section; Escape, the exit button and the browser's back button leave it too.
- A manual landing briefly shows distance from the centre, a grade, points and the best distance
  for that place. Accuracy supplies 95 points and a soft arrival supplies up to five more.
  Map travel, automatic flight and "fly me to next" do not score, including after taking control
  back. A fresh manual takeoff starts a new scoring leg. Light approach wind is shown by each
  windsock; the forge floats you longer, rune ridge has lee-side sink, and the beacon is a small island.
- Good Lift is the game through the glowing east-shore arch: a powerlifting meet in the sky. Fly through the arch or open the game directly. The arch is a
  door: the page warps to `/good-lift/daily` and the run starts at the gate, with the same scene
  and sound. Back leaves it for the fjord. After discovery, the map and the menu offer
  `[ Good Lift ]` directly. Its code, its models and its styles load only once the glider closes
  on the arch (inside 70 m), so the home page never carries them.
  - **Addresses.** `/good-lift/daily` is the Daily Sky, the same for everyone that UTC day; the arch
    opens it and R flies it again. `/good-lift` is practice, a new sky every run.
    `/good-lift?sky=<hex>` is one named sky. Any other address under `/good-lift/` is the missing
    page. Opened directly, an address shows a start screen first, because sound needs a click.
  - **Lift.** An anchored launch source starts the flight facing north over the valley. Four
    hunted cells drift with the wind, bloom and fade, with stable identities so circling progress
    follows the core. Ravens and locally advected motes show their actual airflow. Ambient wind
    is 3–4 m/s, holding toward one cliff for 90 seconds before turning gradually over 25 seconds.
    Windward faces provide a broad soaring band, fading above the crest so thermals take the
    flight higher. Streaks, live windsocks and the wind HUD show the same sampled air. Thermal
    peaks are around 5.5 m/s, with environmental lift capped at 6 m/s. The flight area is a
    320 m radius, allowing time for useful soaring and transfers.
  - **Centring.** A hunted thermal lifts hardest at its very middle, so a circle drifted off it
    climbs harder on the side nearest the core than across from it. In a run the vario's beep
    keeps rising in pitch and pace all the way up a core (`src/game/vario.js`). As the lift surges
    on the near side, a soft swell is heard from the core's side and the vario readout flares
    (`run-surge.js`, which feels for it with the thermal's own waxing and wearing out taken away).
    Straighten for a beat in the surge and turn again as it fades, and the circle moves onto the
    core. Approach remains quiet; sustained useful circling qualifies the thermalling coach.
  - **Turning in.** Flying at the flock's middle and turning there puts the core on the rim of
    the first circle. Pass the core instead on the side the flock turns to, a few metres off its
    middle, and turn as the lift stops building: a low thump from the core's side, the vario
    readout flaring cyan and that wingtip lifting say the moment (`run-entry.js`), and the first
    circle goes round the core. These airflow and sound cues remain while approach coaching stays quiet.
  - **Music.** Once through the rune gate, and only there, quiet background music plays: the two
    tracks in `public/music/`, one after the other, each brought to the same low level
    (`src/game/music.js`, where each track's measured loudness is kept). It plays on between runs
    and stops as you leave for the fjord or the page. It has its own switch, `[ music: on ]` or B,
    apart from the sounds' (`[ sound: on ]` or L), and switched off it stays off on the next visit.
    The fjord and the page never play or fetch any of it.
  - **The title card.** A run opens with a card over the scene: the sky (`Daily #12 · 14 Oct`),
    GOOD LIFT slammed in over a barbell being loaded, and a typed line saying what to lift, or who
    there is to beat. Retries get a shorter card.
  - **The meet.** Every 150 m is a line where three judges' lights check the lift since the last:
    contact (any raven or kettlebell strike), control (any stall or frontal fold) and airspace (more than
    1.5 s in cloud). Two or more white lights make a good lift and bank the bar into the TOTAL;
    otherwise the plates drop into the mist. Either way the next bar starts empty at 25 kg. Plates
    come from full circles turned the flock's way in lift (reps: 2.5 kg each, or 5 kg for a rep to
    depth, a circle whose middle stayed within 7 m of the core, stamped DEPTH beside the bar), from
    a trail of 5 to 25 kg plates laid on the bar's glide from a dying thermal toward the next
    flock, from close calls and, from 550 m, from the iron loose in the sky. A plate loads from
    within 6 m.
  - **Iron in the sky.** From 550 m, before the kettlebells begin, there is more to fetch, each
    kind marked as well as coloured. A gust front about to reach the pilot carries three yellow
    15 kg plates on its line, 22 m either side of the lift being ridden and one further out, each
    trailing the front's pale streaks: a circle widened as the front comes meets one. Climbing
    within 60 m of a storm cloud's base hangs a red 25 kg plate 3 m under it, crackling, for up to
    20 s. After the horn, once the fog is within 200 m below, a red 25 kg plate rides 35 m over the
    fog, 20 m to one side, on an ember ring: the fog brings it up to the wing and it waits there,
    so being over it as it rises takes it. And a strike no longer leaves the bar alone: its plates
    are split into standard ones (eight at most), held while the wing is folded and sprayed round
    it as it reopens, to tumble and sink away for 5.5 s; any flown back through goes back on.
  - **Rune stones.** As the climb comes within 30 m of 500 m, and again of 1,000 m, three rune
    stones are raised at that height 22 m round the lift being climbed (the fjord's own
    `rune-stone.glb`). Each is a pair of standing stones facing the lift's middle with a rune
    glowing between them, a label over it naming its blessing, and faint beams above and below to
    show the opening's height: 12 m wide and 40 m tall. Flying through one takes its blessing,
    with a deep chime, and the others crumble; climbing 30 m past them, or 30 s, crumbles them all.
    One blessing is held at a time, its rune beside the bar's weight, and the 1,000 m stone's
    replaces the 500 m one. ᚠ Fehu loads every plate from 12 m instead of 6, and they fly in to
    the wing; ᛉ Algiz turns the next kettlebell that would hit aside, and is spent; ᚨ Ansuz shows
    the hunted thermals' motes from twice as far; ᛏ Tiwaz counts everything loaded
    twice, but a strike, at any height, loses the whole bar. A stone costs a dash out of the core
    and back, some 80 m of climb, so it is a choice, not a toll.
  - **Progressive pressure.** Ravens are visible from the start, but strikes require sixty
    seconds aloft and 260 m altitude. Kettlebells begin at 700 m with 45–60 seconds between throws;
    the Beast follows an ordinary introduction above 1,000 m, repeating every 35–45 seconds.
    Warnings remain visible before each attack. Weather and storm sink stay part of the flight.
  - **Fog and duration.** Skilled runs target five to eight minutes. Fog starts gently and
    accelerates after five minutes. A surviving run completes at exactly ten minutes, judges its
    carried bar and retains banked style. The recorder, trace and verifier support all 36,000 ticks.
  - **Lightning.** Once the pilot is up among the storm clouds (above 530 m), every 9 to 20 seconds
    spent there one they can see flashes: a bolt runs down out of it, the cloud lights from within,
    the sky behind it brightens, and the thunder rolls in as long after as sound takes from the
    nearest part of the bolt. For half a second every hidden thermal's motes show as if close by:
    a glimpse of where the lift is. Visitors who ask for less motion get one soft swell, with no
    flicker and no flash of the sky. It is the view's alone, on random numbers of its own that the
    run never reads (`src/game/run-lightning.js`); `fjord.lightning.fire()` strikes at once.
  - **The glide ring.** A ring round the pilot shows how far the wing can glide hands up before the
    fog catches it: the fog walked forward at its own speed (which races after the horn), the wing
    sinking at trim, and the breeze carrying the ring downwind. It hangs where that glide meets the
    fog, a few degrees under the pilot's level, so the chase camera always has it in view, and is
    drawn only over the fog. Cyan says go: a flock lies inside it. Amber, broken into dashes, says
    climb first: none does (the flock being ridden is not counted). Out of lift it is drawn in
    full, in lift faintly, and while all the fog is within reach not at all. The ring remains visible
    during quiet travel without opening a coaching card (`src/game/run-glide.js`; `fjord.glide.state`).
  - **The meet sheet.** When a run ends, the sheet shows the SCORE (`SCORE 646 · 512.5 kg × 1.26
    style`), the peak and the best score, the tricks landed, the reps flown and how many were to
    depth, the climb drawn over the rising fog, a row of lights for every lift (a filled white disc
    or a hollow red ring, with the judge's name, so colour is never the only sign), the feats, and a
    line to share the run by, such as `Good Lift · Daily #12 · 646 pts · 512.5 kg · 1,412 m · ⚪⚪⚪ ⚪🔴⚪`. R flies again, `[ new sky ]` gives
    practice and `[ today's sky ]` returns to the Daily Sky. The sheet covers the game's own
    switches, so it carries the music's (`[ music: on ]`, or B).
  - **The skald, the byname and the medals.** Under the ending, a skald's verse speaks to the
    pilot about the run in kennings (the wing a wind-steed, a thermal the ravens' stair, the fog
    Niflheim's breath): one of a handful of hand-written lines (`src/game/meet-verse.js`), chosen
    by what the run did and, among lines that fit as well, by its own numbers, so the same run
    always gets the same line. A run the sky judged also earns its pilot a byname, shown with the
    initials on the sheet and the board (`meet-bynames.js`): the first it qualifies for of the
    Unbroken (every light white over four lines or more), the Unstruck (no strike, with three
    kettlebells or more thrown), the Centred (three reps or more, all to depth), Bell-dodger
    (every kettlebell dodged, three or more), Horn-lifter (a good lift under the horn) and
    Cloud-shy (no second in cloud on a climb past 750 m). As the sheet opens, three bots fly the
    same sky in the page, each in its own world, a few milliseconds at a time while the page is
    idle (`meet-bots.js`): TST, the pilot holding its line on the light brake, and the collector.
    What they score sets the sky's medals, lightest bronze and heaviest gold (a bot flies no tricks,
    so its score is its total), and a run takes one for each bot it outscores (score, then peak, as
    the board ranks): one line, such as `medals: bronze 115 pts · silver 145 pts (TST) · gold 360
    pts · yours: silver`, announced to a screen reader as it arrives, without moving the focus.
    Outscoring TST earns Beat the bot.
    They stop while a run is flown. The visit keeps what they came to on its last 16 skies, so
    none of those is flown twice, and the store keeps the Daily Sky's for the day. Each slice asks
    some 4 ms of the page, and on a page busy every frame they still land in seconds.
  - **Replays and challenges.** A run is its seed and its resolved flight controls
    step by step, and nothing else: every run is recorded (`src/game/recorder.js`) and, as it ends,
    replayed in the page (`replay.js`), and only a run that replays to the very same sheet gets a
    link and a place on the board. The share line carries that link, `/good-lift/daily#vs=…`
    (digital runs compress well; continuously varying brakes can produce much larger links,
    bounded at 196,608 characters). Opening it replays the run before the start screen, which
    shows what it truly came to (`to beat: … pts · … m · verified`; what a link claims is never
    trusted), then flies the same sky; the sheet gives the verdict, and a race on today's sky puts
    the challenger on the day's board. `SIM_VERSION` (`src/game/sim-version.js`) names the rules a
    run was flown under: a test fingerprints every tuning table, so changing how a run flies without
    a new version fails `npm test`, and a link from other rules is refused rather than misread.
    The initial release uses one coupled canopy/pilot solver for both manual flight modes.
    Hold one direction + normal brake to circle in lift; briefly ease the direction to widen.
    Brake slows the wing; rising air provides lift. Double-tap and hold within 300 ms, or hold X,
    for deliberate deep input. A held deep pull can stall; normal brake stabilises backfly,
    release exits, and normal brake catches the forward surge. An uncaught pitch can fold the
    leading edge; released brake and bar let it refill. Recovery advice uses the same coach card.
  - **Feats and the board.** Opener, Under the horn, Giant-dodger, Clean meet, the 1,000 lb club,
    Wingover ×5, Pitched 45°, Training block (the Daily Sky seven days in a row) and Beat the bot
    are Good Lift's own feats:
    the sheet names any new ones when it opens (Beat the bot when the bots land), never during a
    run, and they never move the fjord's belt. Each Daily Sky keeps a board of this browser's ten
    best runs, ranked by score, then peak, then the earlier run, under three initials and the
    run's byname, with TST pinned among them where it ranks as the bot to beat (never stored as
    anyone's run). Initials are written in the runes of the Elder Futhark over their letters (ᚱᛖᚾ
    over REN, `meet-initials.js`), in a 7 KB cut of Noto Sans Runic that comes with the game
    (`public/fonts/`, under the SIL Open Font License beside it) and loads only once a rune is drawn,
    and a short blocklist of offensive three-letter words is refused
    as they are typed, and shown as no initials if a challenge link carries them. Good Lift keeps
    all of this under its own `good-lift` key (`src/game/good-lift-key.js`,
    `good-lift-store.js`, `board.js`), apart from the fjord's progress. The lightweight page reset
    reads the same key, without loading the game store.
  - **The world board.** Where the build names the online board's function (see
    [Online board](#online-board)), the board tab shows the world's best runs of the day beside
    this browser's, with where this browser stands. Initials typed under the sheet's line that says
    they put runs on it are the opt-in: from then on, each Daily Sky run flown under them that is
    this browser's best of the day goes up, and `[ take mine off ]` takes it down again. Initials
    set where the world board was not offered (all of them, before it existed) keep runs here
    until the pilot opts in with `[ opt in ]` beside them; clearing initials opts out. Without the
    function, nothing is fetched and the sheet is as above.
  - **The kit.** Every kilo ever banked here (the tonnage) unlocks looks, never lift, and there is
    no shop: chalk at 1 t, then the Raven wing at 2.5 t, Calibrated at 5 t, Sheetless at 10 t,
    Flyte at 20 t and Hird at 40 t. A clean meet earns the Valkyrie wing and the 1,000 lb club the
    Gjermundbu helmet (`KIT` in `good-lift-store.js`). The sheet names new kit as it opens, and its
    `[ kit ]` tab shows the tonnage, the next rung and how far off it is, and every piece:
    unlocked, or what it asks for. There the visitor picks a wing (radio buttons) and switches the
    chalk and the helmet (check boxes); the glider wears the change at once (`setKit` on the
    engine), and Good Lift writes down only what has been earned (and, as a run ends, takes off
    anything kept that has not been). The chalk switches itself on the first time it is earned; a
    wing or the helmet waits to be put on.
    - The choice is kept under its own `good-lift-kit` key (`src/game/wing-kit.js`, which imports
      nothing), so the engine dresses the glider as the page opens: the kit is worn over the fjord,
      in the game and in the hero. Reset progress clears it with the rest.
    - A livery (`src/game/livery.js`) is a flat picture laid over the wing by a second set of
      texture coordinates worked out from its resting shape (`wing.glb`'s own are scrambled):
      across the span from the pilot's left tip, measured along the arc, and down the chord from
      the leading edge at every station, out to the narrow tips. The picture is the colour and the
      glow both. Each is painted in the page until the owner's own is at
      `public/liveries/<id>.png` (see below). The standard wing is the file's own material, never
      touched, and only the livery worn is held on the graphics card: one taken off is let go.
    - The helmet (`src/game/helmet.js`) is `public/models/helmet.glb` once there is one, and until
      then a low-poly one made in code: a rounded iron cap with a ridge, a brow band and a band over
      the crown, rivets, a short spike and the spectacle guard, no horns, about 1,200 triangles. It
      is fitted over the vertices skinned to the pilot's `Head` bone and held by that bone, so it
      turns with the head.
    - Chalk (`src/game/meet-chalk.js`) is a small white puff from the pilot's hands as a plate or a
      rep loads, from a fixed pool of grains, and never shows for a visitor who asks for less
      motion.
    - The page fetches the livery and the helmet with `import()` the first time either is worn, so
      for a visitor who wears neither it never carries them, and `split.test.js` checks it. The
      game's kit tab brings `livery.js` with it, to paint its swatches. From the console,
      `fjord.wear({ wing: 'hird', helmet: true, chalk: true })` tries anything on without keeping
      it, until the next run ends and puts the kit kept back on; `fjord.kit` is what is worn and
      `fjord.chalk.puff(x, y, z)` starts a puff.
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
  (plates, lines, lights, the horn), `meet-runes.js` the rune stones and their blessings and
  `bells.js` Hrungnir's kettlebells. None of these has 3D code, so `npm test` flies them.
  `cloudbase.js`, `ravens.js` and `meet-view.js` draw a run, with `meet-stones.js` for the rune
  stones, `meet-beast.js` for the Beast's look, its lightning in `run-lightning.js` and the glide
  ring in `run-glide.js`;
  `run-effects.js` is what it does to the wing, the picture and the camera; `run-surge.js` feels
  for the lift surging as a circle closes on a core. `flight-coach.js` and `trick-lessons.js`
  provide the flight instructions, with environment warnings from `coach-run.js`.
  `daily.js` is the Daily Sky; `meet-card.js` works out the meet
  sheet (feats, the share line, the barogram) and `src/components/GoodLiftResult.jsx` draws it,
  shipped with the game, with its kit tab in `GoodLiftKit.jsx`; `good-lift.css` styles its readouts
  and the sheet, and `meet-chalk.js` draws the kit's chalk. `meet-bots.js` flies
  the sheet's bots and sets the medals, `meet-bynames.js` names a run's pilot, `meet-verse.js` is
  the skald and `meet-initials.js` writes initials in runes and keeps the blocklist; all four are
  pure, so `npm test` checks them. `board-online.js` is the page's side of the world board (the
  device token, a run sent, a day's board fetched) and `board-world.js` what it shares with the
  function in `functions/`: a world row and a run's id.
- `src/game/wing-kit.js`, `livery.js` and `helmet.js`: the kit the visitor flies in, read by the
  engine and worn by the glider (`scenery.js`'s `setKit`) wherever they fly. The first is a leaf
  the page carries; the page loads the other two only once worn (the game's kit tab brings
  `livery.js` for its swatches).
  `good-lift-address.js` reads the game's addresses and imports nothing, so the page can use it.
  `npm run check:split` checks the built page carries none of the game, and `split.test.js` checks
  the same of the source.
- `src/game/ground.js`: the height of the land, with no 3D code, so a run can be flown without
  three.js (in the tests, and by the world board's function). `terrain.js` builds the fjord on it.
- `functions/`: the world board's Firebase function. `src/runs.js` is all it does, pure and tested
  with a fake store (`functions/test/`, part of `npm test`); `src/index.js` wires it to HTTP and
  Firestore. `tools/build-functions.mjs` bundles it with the game's pure modules into
  `functions/lib/` (git-ignored), and `firestore.rules` refuses every client.
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
bell is never changed, and Good Lift's rune stones are the fjord's `rune-stone.glb` in a copy of
their own. One slot is waiting for a model: `kettlebell-beast.glb`, Hrungnir's 48 kg Beast, a bell
of cracked stone bound in iron with runes on the handle, standing on its base and facing +z like
the others. Until it exists the Beast is the kettlebell cut again in a stone painted in code
(`src/game/meet-beast.js`) and the request for the file fails quietly; once it is in
`public/models/`, the game draws it instead, glowing as the bells do. The raven's file has a
skeleton but no animation, so its wingbeat is posed in code (`src/game/ravens.js`); it is drawn
about three and a half times life size and lit a little, because a real raven at 200 m against
a night sky is four dark pixels.
Run `npm test` for the scoring, progress, gateway, flight and Good Lift checks. The deploy
workflow runs it, and `npm run check:split`, before every deploy. The Good Lift tests include
reference pilots (`src/game/pilots.js`) and recorded button inputs that fly actual seeded weather.
Acceptance covers stable turns, energy loss, shared wind, safe launch, drifting-core scoring,
five-to-eight-minute skilled sessions and the exact ten-minute deadline. Browser-recorded goldens
must replay to identical judged sheets in Node. Changing flight rules requires a new `SIM_VERSION`,
its fingerprint and updated goldens. The initial release protects two opening cores until the
first 450 m crossing, then blends them into normal depletion and drift over 45 seconds. Raven
attacks and gusts start at 500 m with seeded, gradually shorter intervals; storm clouds begin
at 500 m, and kettlebells join at 700 m. One warned raven attack is possible at a time.

Safe automatic lessons teach pitch and catch at 500 m, then wingovers at 750 m. They start
from ordinary circling, leave flight running, and remember a lesson only after a fresh physical
move and steady style recovery. Back to lift (T) cancels instruction; Repeat trick lessons clears
only learning flags. Recovery instructions take priority over lessons at every height.

Both manual modes share the same physical full stalls, backfly, frontal collapses, wind,
ridge lift and ordinary turns. Failures change aerodynamic forces on the canopy and pilot
bodies, never prescribe a trajectory or supply energy. Only manual flight can score. The
five touch buttons and explicit normal/deep brake gestures are shared across modes.
Thermal guidance retains source identity and requires three seconds of actual useful circling
before displaying THERMALLING. Transfers show NEXT LIFT with direction, distance and a request
to release brake; an unsafe route is never presented as reachable lift.

Progress retains the single `good-lift` storage key and its saved shape. Simulation version 3 adds
proportional brake flight. Replay format 2 records mixed digital input and independent 8-bit brake
pairs; the live fixed step flies those exact quantized demands. Format 1 remains readable, while
flights from other simulation versions retain the version-mismatch response. No progress migration
is needed. Malformed data is validated,
and blocked storage retains progress for the visit. Logs remain bounded to 196,608 characters
and persistent board logs to one MiB.
Current code review, local acceptance and remaining device/release gates are recorded in
[Good Lift QA](docs/good-lift-qa.md) and [proportional brake QA](docs/good-lift-brake-drag-qa.md).
`DAILY_EPOCH` in `src/game/good-lift-address.js` is the UTC day of Daily #1:
on the day Good Lift first ships, set it to that UTC day (and the date `good-lift-address.test.js`
pins with it), so the first Daily Sky anyone can fly is Daily #1.

The kit's art, when it is made, needs no code:

- **Liveries:** `public/liveries/<id>.png` for `raven`, `calibrated`, `sheetless`, `flyte`, `hird`
  and `valkyrie`, 1024 x 512 and opaque, the wing as seen from above flying up the picture: the
  pilot's left tip on the left, the leading edge along the top, the trailing edge along the
  bottom. The wing is about four times as long from tip to tip (along its arc) as its middle
  chord, so the picture is stretched twice as much along the span as down it: paint a circle half
  as wide as it is tall. The picture is the glow too, so use bold shapes that read at 30 m at
  night, and put something bold in the back third of the chord, which is most of what the chase
  camera sees. A picture that loads replaces the painted one; how brightly it glows is `glow` in
  `LIVERIES`. The wing is never much more than 800 pixels across, even on a 4K screen, so a bigger
  picture is drawn down to 1024 x 512 (`LIVERY.picture`) and would only make the visit slower: a
  visitor wearing a livery downloads its picture with the home page. So keep each file small; bold
  flat colour saved as a palette PNG costs little.
- **`helmet.glb`:** put the optimised file in `public/models/` like any other model, facing +z. It
  is fitted by its own box: as wide as the head and an eighth more, its top just over the crown,
  over the middle of the head, and held by the `Head` bone.

`concepts/` and `models-raw/` are local source folders, ignored by Git and unused by the production
build. Back them up separately if you want to regenerate or edit the models later. Keep
`public/models/`, `public/projects/` and `public/poster.jpg` in Git: Vite copies these runtime
assets into `dist/`, so a fresh checkout can build without the raw sources. `npm run models` is
an optional authoring step, not part of deployment.

For a checkout that already tracks the source folders, stop tracking them once with
`git rm -r --cached -- concepts models-raw`. This preserves the local files; it does not remove
them from older commits.

## Firebase Hosting

This is a static Vite app. `firebase.json`'s hosting deploys only `dist/`, rebuilds before
`firebase deploy --only hosting`, and rewrites addresses to `index.html` for `/fly`,
`/projects/<id>` and the missing-page flight. The same file also names the online board's
function and its Firestore rules (see [Online board](#online-board)), so a bare `firebase deploy`
would deploy those too, and fails until their one-time setup is done: deploy the site with
`--only hosting`, as CI does. It caches Vite's
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
builds `dist/`; a failed build stops the deployment. It deploys the site alone: the world board's
function and Firestore's rules are deployed by hand ([Online board](#online-board)), and no hosting
rewrite points at the function, so a push never depends on it.

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

## Online board

The world board is the best runs of each Daily Sky from every browser whose pilot opts in, shown on
the meet sheet's board tab beside this browser's own. One Firebase function, `board`
(`functions/`), takes each run as its log, flies it again through the very step the game flies
(`src/game/replay.js`) and ranks only what that replay comes to. It keeps each day's top 100 in one
Firestore document, at most one run from each device: its best. The page reaches it with plain
`fetch` at the address the build is given as `VITE_BOARD_URL`. While that is unset, as it is until
the setup below is done, the world board is off: nothing is fetched and the game is as it was.

A run goes up only if it was flown on today's or yesterday's (UTC) Daily Sky under the current
`SIM_VERSION`, was ended by the fog, a touchdown or the ten-minute limit, was flown under initials the board shows (and
the page sends one only once its pilot has opted in), replays to the very total and peak its log
claims, and is not on the board already from another device (a run is known by its controls as
the step reads them and by what its replay flew, so neither renaming its link nor rewriting keys
the wing cannot feel, both arrows for the bar, the bar under the brake or anything pressed while
it is folded, makes a new run). One address (for IPv6, one /64, as a home or a phone is handed) may
send 10 runs a minute and one device 50 a day; a log is bounded to 49,152 characters and 36,000 fixed steps. A day counts runs from at most 2,000 devices, and since a device token is whatever
the browser makes it, a new one past that takes the count of one with no run on the board; a run
already on the board is neither counted nor written again, so no flood of copies, under however
many tokens, shuts anyone out. The function answers three routes under `VITE_BOARD_URL`:
`POST /runs` with `{ "log", "token" }` sent as text, `GET /board/<UTC day>` for the last
fortnight, and `DELETE /runs/<UTC day>` with `Authorization: Bearer <token>`.

A run is ranked only if Node's replay of it comes to the very sheet the browser's did. The golden
runs in `npm test` were all flown in Chromium; Safari's JavaScript engine may round a sine or an
arctangent differently in the last bit, and if that ever changed a run, every such run from an
iPhone would be refused as `mismatch` (the function's log says so). Fly a Daily Sky in Safari on a
Mac and on an iPhone against the deployed function before relying on it.

### What it keeps

- **Sent:** for a Daily Sky run flown under initials its pilot opted in with, and only then, the
  run's log (its controls step by step, its initials and what it claims) and this browser's device
  token: 32 random bytes, made the first time a run is sent and kept in localStorage under
  `good-lift-device`. Asking for a day's board sends nothing but the day.
- **Kept**, in each day's document: for each run on the board, its initials, byname, total, peak and
  lights, when it arrived, its id (a digest of its controls), a digest of what its replay flew (to
  tell copies by, never shown) and a digest of the device token with the day, so one device has another name on every day's board; and how many runs each device sent
  that day. Never the log, never the token itself, and never an address: to limit how often one
  asks, the function counts each address's requests in its memory for the clock minute they come
  in, and the first request of a later minute forgets them all (an instance that gets none holds
  them until Cloud Run lets it go). Google Cloud's own request logs, as for any Cloud Run service,
  do record each request's address, for 30 days.
- **Shown:** anyone may read a day's board: initials, bynames and numbers, never the devices.
- **Taken down:** `[ take mine off ]` on the meet sheet takes this browser's run off that day's
  board, and clearing the initials stops any more going up. Only the device that sent a run can
  take it off: a copy of this browser's run that went up from another (its challenge link, renamed
  and sent) stays, and the sheet says so. The sheet finds this browser's run by the runs it keeps
  on its own board, so after Reset progress (which clears that board but leaves the device token) a
  run that went up before is offered for taking down again only once this browser sends another
  that day (the function names the better run's place as it turns the new one away); until then it
  stays up until its day's board expires. A day's board is served for 14 days; with the TTL policy
  in step 2 its document is deleted after that.

### One-time setup

1. **Blaze and a budget alert.** In the Firebase console, upgrade `renate-gouveia-portfolio` to the
   Blaze (pay-as-you-go) plan. Then in the Google Cloud console, under Billing → Budgets & alerts,
   create a $5 budget for the project with email alerts at 50%, 90% and 100%. A budget only warns:
   what caps the spend is the function's three instances at most (`maxInstances` in
   `functions/src/index.js`). Inside the free quotas (2 million function requests a month; 50,000
   Firestore reads and 20,000 writes a day) it should cost nothing.
2. **Firestore.** In the Firebase console, Firestore Database → Create database: Native mode
   (Standard edition), the `(default)` database, production rules (every client refused, as
   `firestore.rules` says), and a location near most visitors. The location cannot be changed
   later. The function runs in `us-central1` (`REGION` in `functions/src/index.js`): pick that, or
   change `REGION` to the database's region (`europe-west1`, `asia-southeast1`, …) before the first
   deploy, so each transaction is a short hop. Then, under Firestore's Time-to-live, add a policy on
   the collection group `boards` and the field `expires`, so each day's board is deleted once it is
   no longer served.
3. **Who deploys.** As a project Owner, `firebase login` is all it takes. A service account would
   need, beside the hosting roles `github-hosting-deploy` has: Cloud Functions Admin; Cloud Run Admin
   (a 2nd-gen function is a Cloud Run service, and the CLI makes this one public there); Service
   Account User on the function's runtime account (the project's default compute service account);
   Artifact Registry Administrator (Firebase sets a cleanup policy on the function's images); and
   Firebase Rules Admin, for `firestore.rules`. The workflow does not deploy the function, so it
   needs none of them today.
4. **Install and deploy**, from a checkout of `main`:

   ```bash
   npm ci                          # the bundler, and the game the function is built from
   npm --prefix functions install  # firebase-functions and firebase-admin, as functions/package.json pins them
   firebase deploy --only functions,firestore --project renate-gouveia-portfolio
   ```

   The predeploy hook runs `npm run build:functions`, which bundles the function into
   `functions/lib/` and stops if it would carry anything but the game's pure modules. npm may warn
   that the function wants Node 22: it is built here on any Node, and runs on 22 in Google Cloud.
   The deploy prints the function's address:
   `https://us-central1-renate-gouveia-portfolio.cloudfunctions.net/board`.
5. **Point the site at it.** In `.github/workflows/firebase-hosting.yml`, add it to the workflow's
   `env:`, beside `FIREBASE_PROJECT_ID`:
   `VITE_BOARD_URL: https://us-central1-renate-gouveia-portfolio.cloudfunctions.net/board`. The build
   in the hosting predeploy reads it, and the next push to `main` turns the world board on. It is no
   secret (the built page carries it). For a deploy by hand, put the same line, as
   `VITE_BOARD_URL=…`, in `.env.production`.
6. **Check it works.**

   ```bash
   day=$(node -e "console.log(Math.floor(Date.now() / 86400000))")
   curl -s "https://us-central1-renate-gouveia-portfolio.cloudfunctions.net/board/board/$day"
   # {"ok":true,"board":{"version":<SIM_VERSION>,"day":…,"rows":[]}}
   ```

   Then run the site against it (`VITE_BOARD_URL=https://… npm run dev`), set initials on the meet
   sheet's board tab (or `[ opt in ]` beside initials set before), fly the Daily Sky until the fog
   takes you and open `[ board ]` again: the world column lists the run with `you: #1`, and
   Firestore holds `boards/<SIM_VERSION>:<day>`. `[ take mine off ]` takes it down. The function's
   logs (Firebase console → Functions → `board`) note any run whose replay there came to another
   sheet than its browser's.

Deploy the function again (step 4) whenever a new `SIM_VERSION` reaches `main`. Until it is, it
refuses the new version's runs and serves the old version's boards, which the page will not show,
so the meet sheet shows this browser's board alone.


### Releasing a flight-rules update

Hosting and its existing world-board function must use the same simulation version. The GitHub
workflow deploys Hosting only, so a physics release needs the board deployed in the same release.
Build and verify both artifacts first:

```bash
npm test
npm run check:split
npm run build
npm run build:functions
```

With the deployment account and production board URL configured, publish both targets together:

```bash
firebase deploy --only functions:board,hosting --project renate-gouveia-portfolio
```

Verify the live board reports the current `SIM_VERSION`, then fly and submit a Daily Sky from the released
client. During a version mismatch, local results remain available and the world-board status
explains that its flight rules are updating. This change does not require deleting old Firestore
boards. Repository changes and local QA do not constitute a deployment.
