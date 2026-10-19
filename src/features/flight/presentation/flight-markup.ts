export const FLIGHT_MARKUP = /* html */ `
  <canvas class="fj-scene"></canvas>
  <div class="fj-veil"></div>
  <div class="fj-strike"></div>
  <div class="fj-labels"></div>
  <div class="fj-hud" hidden>
    <dl>
      <dt>alt</dt><dd data-hud="alt"></dd>
      <dt>vario</dt><dd class="fj-vario-row"><span data-hud="vario"></span><span class="fj-thermal-air" hidden>
        <span>THERMAL AIR</span><span class="fj-thermal-track" role="meter" aria-label="Thermal air strength" aria-valuemin="0" aria-valuemax="6"><i></i></span>
        <span data-thermal-trend>STEADY</span>
      </span><span class="fj-brake-pair" hidden>
        <span>L <span data-brake-side="left" role="meter" aria-label="Left brake" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span></span>
        <span>R <span data-brake-side="right" role="meter" aria-label="Right brake" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span></span>
      </span></dd>
      <dt>speed</dt><dd data-hud="speed"></dd>
      <dt>wind</dt><dd data-hud="wind"></dd>
      <dt>next</dt><dd data-hud="next"></dd>
      <dt>belt</dt><dd data-hud="belt"></dd>
    </dl>
    <nav>
      <button data-do="map">[ <kbd>m: </kbd>map ]</button>
      <button data-do="keys" aria-expanded="false">[ <span class="for-keys">h: controls</span><span class="for-touch">≡ menu</span> ]</button>
      <button data-do="sound">[ sound: on ]</button>
      <button data-do="fullscreen">[ <kbd>f: </kbd>fullscreen ]</button>
      <button data-do="exit">[ <kbd>esc: </kbd>exit ]</button>
      <aside class="fj-keys" hidden>
        <button data-do="cloudbase" hidden>[ Good Lift ]</button>
        <button data-do="quit-cloudbase" hidden>[ end run ]</button>
        <button data-do="repeat-lessons" hidden>[ Repeat trick lessons ]</button>
        <div class="fj-keys-more">
          <button data-do="sound">[ sound: on ]</button>
          <button data-do="fullscreen">[ fullscreen ]</button>
          <button data-do="exit">[ <kbd>esc: </kbd>exit ]</button>
        </div>
        <p>controls</p>
        <p class="fj-pointer-help">Hold and drag anywhere on the flight view. The dot in the fixed control diagram follows your pull from where you started. Full pulls can stall.</p>
        <dl>
          <dt>side pull</dt><dd>drag left or right to turn; use a smaller pull for a gentler turn</dd>
          <dt>down</dt><dd>pull both brakes into the working range to slow down and check a surge</dd>
          <dt>deeper</dt><dd>drag farther down into the purple range for deep brake</dd>
          <dt>hands up</dt><dd>slide up, release the mouse or lift your finger to let both brakes up</dd>
          <dt>thermals</dt><dd>blend a gentle downward and side pull to circle; ease the side pull to widen. Brake slows the wing; rising air provides lift.</dd>
          <dt>tricks</dt><dd>use a deep pull to set up an energetic swing; release and reverse the side pull with the swing for wingovers, or shape a pitch, release and catch with a working pull. Recover level to bank the move.</dd>
          <dt>recovery</dt><dd>holding a deep pull can stall the wing. Follow the coach through backfly and the exit surge. A missed pitch catch can fold the leading edge; let go to let it reopen.</dd>
          <dt class="fj-keys-fjord">enter</dt><dd class="fj-keys-fjord">take off again once landed</dd>
          <dt class="fj-keys-fjord">tap / click</dt><dd class="fj-keys-fjord">a lit pillar or its label, to fly there by itself</dd>
          <dt class="fj-keys-fjord">n</dt><dd class="fj-keys-fjord">once landed, fly to the next place</dd>
          <dt>m</dt><dd>map: pick a place to fly to</dd>
          <dt>r</dt><dd>start again from the launch</dd>
          <dt>l · f</dt><dd>sound · fullscreen</dd>
          <dt>esc</dt><dd>back to the page</dd>
        </dl>
        <p class="fj-keys-goal fj-keys-fjord">land inside a lit ring to read that part of the page</p>
        <p class="fj-keys-goal fj-keys-run" hidden>Read the air: streaks rise over windward cliffs, and ravens circle thermals. Center the lift and bank the bar every 150 m. Raven warnings, gusts and storms begin above 500 m; kettlebells join at 700 m and the Beast at 1,000 m. Storms bring sink. The fog builds after five minutes; a surviving flight completes at ten. Safe lessons introduce pitch and catch at 500 m, then wingovers at 750 m. Tricks spend height and earn style, increasing your final score. Back to lift (T) leaves a lesson. Use gentle pulls for soaring and working pulls for catches; pull farther into the deep range to build pitch or an energetic wingover entry. Slide up or let go for hands up. Music: B.</p>
      </aside>
    </nav>
  </div>
  <div class="fj-toasts"></div>
  <div class="fj-hint"></div>
  <section class="fj-map window" hidden>
    <header><i></i><i></i><i></i><span>~/fjord/map — pick a place to fly to</span></header>
    <canvas class="fj-map-canvas" width="300" height="420"></canvas>
    <div class="fj-map-list"></div>
    <footer>
      <button data-do="map">[ <kbd>esc: </kbd>close ]</button>
      <button data-do="fjord" hidden>[ back to the fjord ]</button>
      <button data-do="reset">[ reset progress ]</button>
    </footer>
  </section>
  <section class="fj-coach" aria-label="Flight coach" hidden>
    <span class="fj-coach-kicker">FLIGHT COACH</span>
    <strong data-coach="action"></strong><small data-coach="reason"></small>
    <div data-coach="controls"></div><small data-coach="feedback"></small>
    <div data-coach="progress" hidden><span></span><i><b></b></i></div>
    <button data-do="back-to-lift" data-coach="cancel" hidden>Back to lift <kbd>T</kbd></button>
    <span data-coach="announce" class="fj-visually-hidden" aria-live="polite" aria-atomic="true"></span>
  </section>
  <span class="fj-drag-tip" hidden>Hold + drag to fly<br><small>↓ both brakes · release for hands up</small></span>
  <div class="fj-flight-cues" aria-hidden="true"></div>
  <div class="fj-fade"></div>`;
