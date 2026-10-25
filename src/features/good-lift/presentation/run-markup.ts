import { GATES } from '../../../domains/good-lift/meet-runes.ts';


// What the run adds to the readouts: the bar's row, the judges' lights, the chevron and the glow
// along the bottom once Gjallarhorn has sounded.
export const BAR_ROW = /* html */ '<div class="fj-run fj-bar-metric"><dt>bar</dt><dd data-hud="bar"></dd></div>';

// The run's banked combos (meet-combo.js), a row of its own that shows once a combo has banked.
export const STYLE_ROW = /* html */ '<dt class="fj-run fj-trick">style</dt><dd class="fj-run fj-trick" data-hud="style"></dd>';

// The combo meter (combo-meter.js), beside the pilot: a link's banner on the card's top edge;
// the chain and its multiplier, with the cap faint after it; what banking now would pay, the ring
// that fills as the wing settles and BANK NOW; and the flight's word on the card's bottom edge. All
// of it is for the eye: a combo banked or lost is said in a status line of its own, always there.
export const METER_MARKUP = /* html */ `
  <div class="fj-meter" aria-hidden="true" hidden>
    <p class="fj-meter-banner" data-meter="banner" hidden></p>
    <div class="fj-meter-card" data-meter="card" hidden>
      <p class="fj-meter-chain"><span data-meter="trail"></span><b data-meter="hand"></b></p>
      <p class="fj-meter-times"><b data-meter="multiplier"></b><small data-meter="cap"></small></p>
      <p class="fj-meter-pay"><span data-meter="payout"></span><svg class="fj-meter-ring" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"></circle><circle data-meter="ring" cx="8" cy="8" r="6" pathLength="100"></circle></svg><em data-meter="hurry" hidden>BANK NOW</em></p>
    </div>
    <p class="fj-meter-word" data-meter="word" hidden></p>
  </div>
  <p class="fj-meter-announcement fj-visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>`;

// The cue for a wing in trouble (wing-cue.js), over the pilot: what has happened, and on the A
// and the B its fix with the key for its step; SAVED with what it cost; SOFT. For the eye; each is said
// in a status line of its own as it begins.
export const CUE_MARKUP = /* html */ `
  <p class="fj-turn-cue" aria-hidden="true" hidden><b data-cue="name"></b><span data-cue="fix" hidden></span><kbd data-cue="keys" hidden></kbd></p>
  <p class="fj-turn-cue-announcement fj-visually-hidden" role="status" aria-live="assertive" aria-atomic="true"></p>`;

export const MARKUP = /* html */ `
  <div class="fj-horn" aria-hidden="true"></div>
  <div class="fj-chevron" aria-hidden="true" hidden></div>
  <div class="fj-title" aria-hidden="true" hidden>
    <small></small>
    <b data-text="GOOD LIFT">GOOD LIFT</b>
    <div class="fj-barbell"><i></i><i></i><em></em><i></i><i></i></div>
    <span></span>
  </div>`;

// The rune stones' labels, one for each stone of a set, laid in the picture under the readouts (as
// the fjord's labels for its places are), so neither the readouts nor the hint is ever covered.
export const GATE_MARKUP = /* html */ `<div class="fj-gates" aria-hidden="true">${'<p class="fj-gate" hidden><b></b><small></small></p>'.repeat(GATES.count)}</div>`;

// The music's switch, beside the sounds' in the menu, shown only in the game.
export const MUSIC_BUTTON = /* html */ '<button data-do="music" hidden>[ music: on ]</button>';

// The lights head the column the notifications stack in, which the engine keeps clear of the
// readouts, so a milestone reached on a line never covers them.
// The call is also said, in a status line that is always there (a live region that appears with
// its words in it says nothing).
export const LIGHTS = /* html */ `
  <div class="fj-lights" aria-hidden="true" hidden>
    <p><i style="--n: 0"></i><i style="--n: 1"></i><i style="--n: 2"></i></p>
    <b></b>
    <small></small>
  </div>
  <p class="fj-said" role="status"></p>`;
