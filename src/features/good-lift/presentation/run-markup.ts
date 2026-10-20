import { GATES } from '../../../domains/good-lift/meet-runes.ts';


// What the run adds to the readouts: the bar's row, the judges' lights, the chevron and the glow
// along the bottom once Gjallarhorn has sounded.
export const BAR_ROW = /* html */ '<div class="fj-run fj-bar-metric"><dt>bar</dt><dd data-hud="bar"></dd></div>';

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

// The music's switch, beside the sounds' in the menu, shown only in the game.
export const MUSIC_BUTTON = /* html */ '<button data-do="music" hidden>[ music: on ]</button>';

export const BRIEF_MARKUP = /* html */ `
  <div class="fj-brief" role="dialog" aria-modal="true" aria-labelledby="fj-brief-title" tabindex="-1" hidden>
    <small></small>
    <b id="fj-brief-title">GOOD_LIFT</b>
    <p class="fj-brief-objective">Climb through a line every 150 m. Three judges light each lift.</p>
    <ol class="fj-brief-controls">
      <li>
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <polygon points="28,6 50,28 28,50 6,28" fill="none" stroke="currentColor" opacity=".45" />
          <circle cx="28" cy="28" r="4" fill="currentColor" />
          <path d="M20 28H8m4-4-4 4 4 4m24-4h12m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div><strong>Turn</strong><span>drag left or right</span></div>
      </li>
      <li>
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <polygon points="8,28 28,48 48,28" fill="#9b7bff" fill-opacity=".35" stroke="#9b7bff" stroke-opacity=".8" />
          <polygon points="16,28 28,40 40,28" fill="#0f2434" stroke="currentColor" stroke-opacity=".6" />
          <circle cx="28" cy="16" r="4" fill="currentColor" />
          <path d="M28 21v15m-5-5 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div><strong>Brake</strong><span>drag down · <em>purple</em> is deep and can stall</span></div>
      </li>
      <li>
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <polygon points="28,8 42,22 28,36 14,22" fill="#e8f1fa" fill-opacity=".08" stroke="#e8f1fa" stroke-opacity=".6" />
          <circle cx="28" cy="42" r="4" fill="currentColor" />
          <path d="M28 37V14m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div><strong>Hands up</strong><span>slide up, or just let go</span></div>
      </li>
    </ol>
    <p class="fj-brief-note">Thermals, plates, kettlebells and tricks: the coach introduces each one in flight.</p>
    <div class="fj-brief-actions">
      <button type="button" class="primary" data-brief-action="fly">▶ Fly</button>
      <button type="button" data-brief-action="exit">Back to the page</button>
    </div>
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
