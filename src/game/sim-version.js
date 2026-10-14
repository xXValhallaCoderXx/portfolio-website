// The version of the rules a run is flown under. A replay, a challenge link and a day's board all
// carry it, and a run flown under one version is never judged under another: change how a run
// flies (any tuning table, the step, the meet, the kettlebells, the ground) and this must change
// with it, or every link already shared would replay to a different total. A test fingerprints the
// tables to hold to that (sim-version.test.js). Kept free of imports, so the page can read it
// without loading the game.
//
// 1: Good Lift as it first shipped (the tables sim-version.test.js fingerprints as 145b525a).
export const SIM_VERSION = 1;
