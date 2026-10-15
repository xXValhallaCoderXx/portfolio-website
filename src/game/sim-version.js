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
//    bits together), a wing that dives as the air drops away and tucks unless the brake catches it,
//    a harsh stall ending in a dive to catch (DIVE), and a folded wing pumped open sooner
//    (CLOUD_STRIKE.pump).
export const SIM_VERSION = 4;
