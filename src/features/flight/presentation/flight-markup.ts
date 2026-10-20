const mapIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/></svg>';
const menuIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14"/></svg>';
const controlGuide = `<svg class="fj-control-guide" viewBox="0 0 220 170" aria-hidden="true">
  <text x="110" y="15" text-anchor="middle">▲ HANDS UP</text><path d="m110 32 28 28-28 28-28-28Z" fill="#e8f1fa0d" stroke="#9fb2c6"/>
  <path d="m22 88 88 56 88-56Z" fill="#29c7e328" stroke="#29c7e3"/><path d="m22 88 88 56 88-56-88 78Z" fill="#c9b6ff38" stroke="#9c78e2"/>
  <text x="22" y="76">◀ LEFT</text><text x="198" y="76" text-anchor="end">RIGHT ▶</text><text x="110" y="164" text-anchor="middle" fill="#c9b6ff">DEEP</text><circle cx="110" cy="88" r="8" fill="#29c7e3"/>
</svg>`;

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
      <h2>CONTROLS · DRAG ANYWHERE</h2>${controlGuide}
      <dl class="fj-control-rows">
        <div><dt>◀ ▶ side</dt><dd>turn; a smaller pull turns gently</dd></div>
        <div><dt>▼ down</dt><dd>both brakes: slow down, check a surge</dd></div>
        <div><dt>deeper</dt><dd>purple is deep brake and can stall</dd></div>
        <div><dt>▲ hands up</dt><dd>slide up, release the mouse or lift your finger</dd></div>
      </dl>
      <details><summary>thermals &amp; climbing</summary><p>Blend a gentle downward and side pull to circle in rising air. Ease the side pull to widen. Brake slows the wing; rising air provides lift.</p><p class="fj-keys-fjord">Land inside a lit ring to read that part of the page. Select a pillar or map destination for automatic travel.</p><p class="fj-keys-goal fj-keys-run" hidden>Bank the bar every 150 m. Raven warnings, gusts and storms begin above 500 m; kettlebells join at 700 m and the Beast at 1,000 m. The fog builds after five minutes; a surviving flight completes at ten.</p></details>
      <details><summary>tricks &amp; recovery</summary><p>Safe lessons introduce pitch and catch at 500 m, then wingovers at 750 m. Follow the coach, recover level to bank style, or choose Back to lift to leave a lesson. Full pulls can stall; follow the release cue.</p><button data-do="repeat-lessons" hidden>Repeat trick lessons</button></details>
      <div class="fj-keys-more"><button data-do="sound">sound: on</button><button data-do="fullscreen">fullscreen</button></div>
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
  <div class="fj-drag-tip" role="status" hidden><span class="fj-action-symbol" aria-hidden="true">◇</span><div><small>AIRBORNE</small><strong>Drag anywhere to steer</strong><span>sideways turns · down brakes · up lets go</span></div></div>
  <div class="fj-flight-cues" aria-hidden="true"></div><div class="fj-fade"></div>`;
