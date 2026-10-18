// The version of the rules a run is flown under. A replay, a challenge link and a day's board all
// carry it, and a run flown under one version is never judged under another: change how a run
// flies (any tuning table, the step, the meet, the kettlebells, the ground) and this must change
// with it, or every link already shared would replay to a different total. A test fingerprints the
// tables to hold to that (sim-version.test.js). Kept free of imports, so the page can read it
// without loading the game.
//
// 1: Good Lift as it first shipped (the tables sim-version.test.js fingerprints as 145b525a).
// 2: hunted thermals peak at their middle, and a rep centred on the core is a rep to depth and
//    loads 5 kg (CLOUD_HUNT.core and .peak, MEET.depth and .deep).
// 3: plates ride the gust fronts, hang under storm clouds and rise on the fog after the horn, a
//    strike sprays the bar's plates for the pilot to catch again, rune gates at 500 and 1,000 m
//    bless the pilot who flies through one, and the first bell past 1,000 m is the Beast (WIND,
//    THUNDER, BAIT, SCATTER, GATES, BLESSING, BEAST, MEET.beast and .iron).
// 4: the wing is flown, not only held: big ears for a steep way down (EARS, the brake and the bar
//    bits together); a brake that goes deep within two seconds and stalls within about five, eased
//    every couple of seconds to stay light (BRAKE, STALL); a wing that swings fore and aft over the
//    pilot as the brake and the air push it, surging as the air drops away and front-collapsing,
//    anywhere in a run, unless the brake catches it, and pumped bigger on purpose (PITCH, FALL,
//    TUCK); a wing that swings side to side through wingovers, tipping past its limit (ROLL, TIP),
//    and loops flown out of them (LOOP); a folded wing pumped open sooner (CLOUD_STRIKE.pump,
//    TUCK.pump); and the style its tricks earn multiplying the total a run is ranked by (BANDS,
//    WATCH, STYLE, SCORE).
// 5: one energy-based wing and moving wind field; soaring runs up to ten minutes, stable controls,
//    drifting thermal reps, progressive hazards and individually banked maneuvers. Fresh progress.
// 6: readable windward ridge lift with a finite crest ceiling; seeded gradual wind shifts and
//    continuously advected weather. Fresh competitive progress, with the same control bits.
// 7: begin beyond the stone arch at 100 m with enough clearance to reach either windward ridge.
//    Controls, terrain and weather are unchanged. Fresh competitive progress for the new start.
// 8: sharper pitch response, coordinated manual brake turns and matching physical maneuver timing.
// 9: more forgiving wind-driven ridge climb before the first thermal transfer.
// 10: explicit working/deep brake intent and consistent ordinary steering; five-bit recordings.
// 11: damped ordinary turns, smoother steering release and air-track thermal guidance.
// 12: protected opening thermals, altitude-paced encounters and automatic optional trick lessons.
// 13: separated-flow stalls, physical backfly, frontal inflation and phase-specific recovery.
export const SIM_VERSION = 13;
