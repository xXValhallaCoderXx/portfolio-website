import { GATES } from '../../../domains/good-lift/meet-runes.ts';


// What the run adds to the readouts: the bar's row, the judges' lights, the chevron and the glow
// along the bottom once Gjallarhorn has sounded.
export const BAR_ROW = /* html */ '<dt class="fj-run">bar</dt><dd class="fj-run" data-hud="bar"></dd>';

// The run's style (meet-style.js), a row of its own that shows once a set of tricks has landed, and
// the line above the swing gauge saying the set in hand, and stamping it landed or lost.
export const STYLE_ROW = /* html */ '<dt class="fj-run fj-trick">style</dt><dd class="fj-run fj-trick" data-hud="style"></dd>';

export const STYLE_LINE = /* html */ '<p class="fj-style" aria-hidden="true"></p>';

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

// The music's switch, beside the sounds' in the readouts and in the menu, shown only in the game.
export const MUSIC_BUTTON = /* html */ '<button data-do="music" hidden>[ music: on ]</button>';

export const BRIEF_MARKUP = /* html */ `
  <div class="fj-brief" role="note" aria-label="How Good Lift is flown" hidden>
    <small></small>
    <b>GOOD LIFT</b>
    <p>Hold and drag anywhere on the flight view. The dot in the control diagram follows your pull from where you started.</p>
    <p>Climb in the thermals the ravens circle. Brake slows the wing; rising air provides lift. Three white lights bank the bar at each 150 m line. Plates add optional bonus kg; the fog rises under you.</p>
    <dl>
      <dt>gentle pull</dt><dd>left or right turns; down pulls both brakes. Blend a gentle downward and side pull to circle in lift.</dd>
      <dt>deep pull</dt><dd>drag farther down for deep brake. Full pulls can stall; follow the release cue.</dd>
      <dt>hands up</dt><dd>slide up, release the mouse or lift your finger to let both brakes up.</dd>
      <dt>tricks</dt><dd>safe lessons begin at 500 m for pitch and catch, then 750 m for wingovers. Tricks spend height and earn style for your final score. Choose Back to lift to leave a lesson.</dd>
    </dl>
    <em>tap or click to fly</em>
  </div>`;

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
