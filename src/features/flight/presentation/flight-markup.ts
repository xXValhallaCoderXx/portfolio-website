const mapIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/></svg>';
const menuIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14"/></svg>';

export const FLIGHT_MARKUP = /* html */ `
  <canvas class="fj-scene"></canvas>
  <div class="fj-veil"></div><div class="fj-strike"></div><div class="fj-labels"></div>
  <div class="fj-hud" hidden>
    <dl aria-label="Flight instruments">
      <div class="fj-metric"><dt data-alt-label>ALT</dt><dd data-hud="alt"></dd></div>
      <div class="fj-metric"><dt>CLIMB</dt><dd data-hud="vario"></dd></div>
      <div class="fj-metric fj-destination-metric"><dt>NEXT</dt><dd data-hud="destination"></dd></div>
      <div class="fj-alt-progress" role="progressbar" aria-label="Altitude to next banking line" aria-valuemin="0" aria-valuemax="100" hidden><i></i></div>
    </dl>
    <nav aria-label="Flight tools">
      <button data-do="map" aria-label="Map, pauses the flight" aria-haspopup="dialog">${mapIcon}<span>map</span></button>
      <button data-do="keys" aria-label="Menu, pauses the flight" aria-expanded="false" aria-haspopup="dialog">${menuIcon}<span>menu</span></button>
    </nav>
    <div class="fj-telemetry" aria-label="Secondary flight instruments">
      <span data-hud="belt"></span><span data-hud="speed"></span><span data-hud="wind"></span><span data-hud="next"></span><span data-flight-status hidden></span>
      <span class="fj-thermal-air" hidden><span>THERMAL AIR</span><span class="fj-thermal-track" role="meter" aria-label="Thermal air strength" aria-valuemin="0" aria-valuemax="6"><i></i></span><span data-thermal-trend>STEADY</span></span>
      <span class="fj-brake-pair" hidden><span>L <span data-brake-side="left" role="meter" aria-label="Left brake" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span></span><span>R <span data-brake-side="right" role="meter" aria-label="Right brake" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span></span></span>
    </div>
  </div>
  <section class="fj-keys" role="dialog" aria-modal="true" aria-labelledby="fj-pause-title" tabindex="-1" hidden>
    <header class="fj-pause-heading"><div><b id="fj-pause-title" class="fj-paused-badge">❚❚ PAUSED</b><span>the sky waits for you</span></div><button data-do="resume" aria-label="Resume flight">×</button></header>
    <button class="primary fj-resume" data-do="resume">▶ resume flight</button>
    <p class="fj-pause-summary" data-pause-summary></p>
    <div class="fj-menu-content">
      <h2>TWO BRAKES · ONE WING</h2>
      <dl class="fj-control-rows">
        <div><dt>Touch</dt><dd>pull either side handle down; use both thumbs to brake together. Lift a thumb to release that hand.</dd></div>
        <div><dt>Keyboard</dt><dd>A / D or ← / → turn gently. Space, S or ↓ pulls both brakes. Add a direction to circle.</dd></div>
        <div><dt>Acro</dt><dd>Q / E builds wingovers. Shift + a direction pulls fully for a loop; Shift + Space pulls both fully.</dd></div>
        <div><dt>Mouse</dt><dd>drag anywhere: sideways turns, down pulls both brakes; let go to release. Full pulls can stall.</dd></div>
      </dl>
      <details><summary>thermals &amp; climbing</summary><p>Keep a little brake on both hands and pull the inside hand farther to circle in rising air. Ease the difference to widen. On keyboard, W holds both gently; W + A / D circles, then W alone widens. Brake slows the wing; rising air provides lift.</p><p class="fj-keys-fjord">Land inside a lit ring to read that part of the page. Select a pillar or map destination for automatic travel.</p><p class="fj-keys-goal fj-keys-run" hidden>Bank the bar every 150 m. Raven warnings, gusts and storms begin above 500 m; kettlebells join at 700 m and the Beast at 1,000 m. Fog rises slowly below; a surviving flight completes at ten.</p></details>
      <details><summary>tricks &amp; recovery</summary><p>Safe lessons introduce pitch and catch at 500 m, wingovers at 750 m, then loops at 1,000 m. Build rhythm with timed pulls and releases, link moves into a combo, and recover level to bank style. Follow the coach or choose Back to lift to leave a lesson. Full pulls can stall; follow the release cue.</p><button data-do="repeat-lessons" hidden>Repeat trick lessons</button></details>
      <div class="fj-keys-more"><button data-do="sound">sound: on</button></div>
    </div>
    <footer class="fj-menu-footer"><button data-do="cloudbase" hidden>Good Lift</button><button data-do="quit-cloudbase" hidden>end run</button><button data-do="exit">back to the page</button></footer>
  </section>
  <div class="fj-toasts"></div>
  <div class="fj-hint"></div>
  <section class="fj-map window" role="dialog" aria-modal="true" aria-labelledby="fj-map-title" tabindex="-1" hidden>
    <header><i></i><i></i><i></i><span id="fj-map-title">~/fjord/map</span></header>
    <div class="fj-map-heading"><span>pick a place to fly to</span><b class="fj-paused-badge">❚❚ PAUSED</b></div>
    <div class="fj-map-content"><canvas class="fj-map-canvas" width="300" height="420" aria-label="Map of the fjord and flight destinations"></canvas>
      <p class="fj-map-legend"><span>▲ you</span><span>∩ Good Lift</span></p><div class="fj-map-list"></div></div>
    <footer><button class="primary" data-do="map">close</button><button data-do="fjord" hidden>back to the fjord</button><button class="fj-reset-button" data-do="reset">reset progress… <span>(asks first)</span></button></footer>
    <section class="fj-reset-confirm" aria-labelledby="fj-reset-title" hidden><h2 id="fj-reset-title">Reset all progress?</h2><p>This clears your portfolio visits and achievements, Good Lift records, and unlocked kit on this device.</p><button data-do="reset-cancel" class="primary">keep my progress</button><button data-do="reset-confirm">reset progress</button></section>
  </section>
  <section class="fj-coach" aria-label="Flight coach" hidden>
    <small class="fj-coach-warning" data-coach="warning" hidden></small>
    <div class="fj-coach-main"><span class="fj-action-symbol" aria-hidden="true">◇</span><div class="fj-coach-copy"><span class="fj-coach-kicker">FLIGHT COACH</span><strong data-coach="action"></strong><small data-coach="reason"></small><div data-coach="controls"></div><small data-coach="feedback"></small></div></div>
    <div data-coach="progress" hidden><span></span><i><b></b></i></div>
    <button data-do="back-to-lift" data-coach="cancel" hidden>Back to lift</button>
    <span data-coach="announce" class="fj-visually-hidden" aria-live="polite" aria-atomic="true"></span>
  </section>
  <div class="fj-drag-tip" role="status" hidden><span class="fj-action-symbol" aria-hidden="true">◇</span><div><small>AIRBORNE</small><strong>Small pulls, smooth flight</strong><span class="fj-touch-help">pull either handle down · lift your thumb to release</span><span class="fj-key-help">A / D turn · Space brakes · Q / E swing · release to glide</span><span class="fj-mouse-help">drag sideways to turn · down to brake · let go to glide</span></div></div>
  <div class="fj-brake-handles" aria-label="Flight brake handles" hidden>
    ${(['left', 'right'] as const).map(side => `<div class="fj-brake-handle" data-hand="${side}">
      <span class="fj-handle-label">${side.toUpperCase()} BRAKE</span>
      <div class="fj-handle-rail"><i class="fj-handle-working"></i><i class="fj-handle-wingover"></i><i class="fj-handle-full"></i><i class="fj-handle-target" hidden></i>
        <button type="button" data-brake-handle="${side}" aria-label="${side} brake. Hold and pull down; release to let go." aria-describedby="fj-handle-help"><span>≡</span></button>
      </div><span class="fj-handle-key">${side === 'left' ? 'A / ← · Q swing' : 'D / → · E swing'}</span><span class="fj-handle-depth">HANDS UP</span>
    </div>`).join('')}
    <span id="fj-handle-help" class="fj-visually-hidden">Pull each handle down independently. The broad cyan range is for ordinary flight; purple builds a swing, and the bottom is a full pull. Lift your thumb to release. With a focused handle, hold Space or Enter to pull it; release the key to let go.</span>
    <span class="fj-brake-key-help">SPACE · BOTH BRAKES <span>SHIFT · FULL PULL</span></span>
  </div>
  <div class="fj-flight-cues" aria-hidden="true"></div><div class="fj-fade"></div>`;
