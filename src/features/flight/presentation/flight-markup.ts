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
  <section class="fj-keys fj-arcade-pause" role="dialog" aria-modal="true" aria-labelledby="fj-pause-title" tabindex="-1" hidden>
    <header class="fj-pause-heading"><div><b id="fj-pause-title" class="fj-paused-badge">❚❚ PAUSED</b><span>the sky waits for you</span></div><button data-do="resume" aria-label="Resume flight">×</button></header>
    <button class="primary fj-resume" data-do="resume">▶ resume flight</button>
    <p class="fj-pause-summary" data-pause-summary></p>
    <div class="fj-menu-content">
      <div class="fj-pause-quick fj-keys-more"><button class="fj-training-entry" data-do="training">Train ›<small>choose a guided lesson</small></button><button data-do="sound">sound: on</button></div>
      <section class="fj-pause-guide" aria-labelledby="fj-pause-guide-title"><h2 id="fj-pause-guide-title">HOW TO FLY <span>· TWO BRAKES · ONE WING</span></h2>
        <div class="fj-pause-basics"><div><b>↶ PULL ONE</b><span>turn that way</span></div><div><b>↓ PULL BOTH</b><span>brake together</span></div><div><b>↑ LET GO</b><span>hands up</span></div></div>
        <details><summary>keyboard controls</summary><dl class="fj-control-rows"><div><dt>A / D · ← / →</dt><dd>turn gently</dd></div><div><dt>Space · S · ↓</dt><dd>pull both to working brake</dd></div><div><dt>Q / E</dt><dd>pull one hand into the swing range</dd></div><div><dt>Shift + direction</dt><dd>build a full side pull for a loop</dd></div><div><dt>Shift + Space</dt><dd>both full · can stall</dd></div></dl></details>
        <details><summary>touch &amp; mouse controls</summary><p>Touch: pull either side handle down. Use both thumbs to brake together; lift a thumb to release that hand.</p><p>Mouse: press and drag anywhere. Sideways turns; down pulls both brakes. Let go to release. Full pulls can stall.</p></details>
      </section>
      <p class="fj-score-flow">TRICK + TRICK → LEVEL <b>3 s</b> → <b>BANKED</b></p>
      <details><summary>thermals &amp; climbing</summary><p>Keep a little brake on both hands and pull the inside hand farther to circle in rising air. Ease the difference to widen. On keyboard, W holds both gently; W + A / D circles, then W alone widens. Brake slows the wing; rising air provides lift.</p><p class="fj-keys-fjord">Land inside a lit ring to read that part of the page. Select a pillar or map destination for automatic travel.</p><p class="fj-keys-goal fj-keys-run" hidden>Bank the bar every 150 m. Raven warnings, gusts and storms begin above 500 m; kettlebells join at 700 m and the Beast at 1,000 m. Fog rises slowly below; a surviving flight completes at ten.</p></details>
      <details><summary>tricks &amp; recovery</summary><p>Link pitch, Spiral 360, wingover and loop moves for acro points. Add different moves for variety, then recover level for three seconds to bank. Training starts high and guides one lesson at a time. Full pulls can stall; release to recover.</p></details>
    </div>
    <footer class="fj-menu-footer"><button data-do="cloudbase" hidden>Game</button><button data-do="back-to-game" hidden>back to game</button><button data-do="training-choose" hidden>choose lesson</button><button data-do="quit-cloudbase" hidden>end run</button><button data-do="exit">back to the page</button></footer>
  </section>
  <div class="fj-toasts"></div>
  <div class="fj-hint"></div>
  <section class="fj-training-result" role="dialog" aria-modal="true" aria-labelledby="fj-training-title" tabindex="-1" hidden>
    <small>TRAINING · UNRANKED</small><h2 id="fj-training-title" data-overlay-focus tabindex="-1"></h2><p data-training-detail></p>
    <div><button class="primary" data-do="training-retry">Try again</button><button data-do="training-next">Next lesson</button><button data-do="training-choose">Choose lesson</button><button data-do="back-to-game">Back to game</button></div>
  </section>
  <section class="fj-map window" role="dialog" aria-modal="true" aria-labelledby="fj-map-title" tabindex="-1" hidden>
    <header><i></i><i></i><i></i><span id="fj-map-title">~/fjord/map</span></header>
    <div class="fj-map-heading"><span>pick a place to fly to</span><b class="fj-paused-badge">❚❚ PAUSED</b></div>
    <div class="fj-map-content"><canvas class="fj-map-canvas" width="300" height="420" aria-label="Map of the fjord and flight destinations"></canvas>
      <p class="fj-map-legend"><span>▲ you</span><span>∩ rune arch</span></p><div class="fj-map-list"></div></div>
    <footer><button class="primary" data-do="map">close</button><button data-do="fjord" hidden>back to the fjord</button><button class="fj-reset-button" data-do="reset">reset progress… <span>(asks first)</span></button></footer>
    <section class="fj-reset-confirm" aria-labelledby="fj-reset-title" hidden><h2 id="fj-reset-title">Reset all progress?</h2><p>This clears your portfolio visits and achievements, Good Lift records, and unlocked kit on this device.</p><button data-do="reset-cancel" class="primary">keep my progress</button><button data-do="reset-confirm">reset progress</button></section>
  </section>
  <section class="fj-coach" aria-label="Flight coach" hidden>
    <small class="fj-coach-warning" data-coach="warning" hidden></small>
    <div class="fj-coach-main"><span class="fj-action-symbol" aria-hidden="true">◇</span><div class="fj-coach-copy"><span class="fj-coach-kicker">FLIGHT COACH</span><strong data-coach="action"></strong><small data-coach="reason"></small><div data-coach="controls"></div><small data-coach="acknowledgement" hidden></small><small data-coach="feedback"></small></div></div>
    <div data-coach="progress" hidden><span></span><i><b></b></i></div>
    <button data-do="training-choose" data-coach="cancel" hidden>Choose lesson</button>
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
