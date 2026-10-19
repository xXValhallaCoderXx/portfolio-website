import { ACHIEVEMENTS, beltFor } from '../../../domains/progression/achievements.ts';
import type { readProgress } from '../../../adapters/browser/flight-progress.service.ts';
import type { FlightState, FlightInput, AirSample } from '../../../domains/flight/models.ts';
import type { CoachFields } from '../../../domains/coaching/models.ts';
import { THERMAL_AIR } from '../presentation/thermal-air.ts';
import { windReadout } from '../presentation/wind-feedback.ts';
import type { FlightZone } from './flight-navigation.service.ts';
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
interface FlightHudPort {
 stage: HTMLElement; g: FlightState; input: FlightInput; air: AirSample;
 vario: { readonly value: number }; thermalAir: { readonly fill: number; readonly value: number; readonly trend: string };
 progress: ReturnType<typeof readProgress>; zoneLabels: { zone: FlightZone; el: HTMLElement }[]; autoHaste: number;
 readonly mode: string; readonly auto: FlightZone | null; readonly mapOpen: boolean; readonly keysOpen: boolean; readonly briefing: boolean; readonly hasDragged: boolean; readonly portal: boolean; readonly held: boolean; readonly coachMessage: CoachFields | null;
 isAirborne(): boolean; compact(): boolean; runHud(quiet: boolean): string;
 nearestZone(onlyUnvisited: boolean): { zone: FlightZone; dist: number } | null; hintText(): string; drawMap(): void;
}
/** DOM readouts only sample the session; all flight and coaching state remains owned upstream. */
export function createFlightHud(port: FlightHudPort) {
 const { stage, g, input, air, vario, thermalAir, progress, zoneLabels } = port;
 const $ = (selector: string): HTMLElement => { const node = stage.querySelector<HTMLElement>(selector); if (!node) throw new Error(`Flight HUD is missing ${selector}`); return node; };
 const hud = (name: string) => $(`[data-hud="${name}"]`);
 const brakePair = $('.fj-brake-pair'), brakeTracks = [...stage.querySelectorAll<HTMLElement>('[data-brake-side]')], dragTip = $('.fj-drag-tip');
 const thermalTrack = $('.fj-thermal-track'), thermalFill = thermalTrack.querySelector('i')!, thermalTrend = $('[data-thermal-trend]');
  function updateHud() {
    const direct = port.isAirborne() && input.controlMode === 'brakes' && !port.auto;
    brakePair.hidden = !direct || port.mapOpen || port.keysOpen || port.briefing;
    for (const track of brakeTracks) {
      const amount = direct ? clamp((g[`${track.dataset.brakeSide as 'left' | 'right'}Brake`] ?? 0) / 0.6, 0, 1) : 0;
      track.querySelector('i')!.style.transform = `scaleX(${amount.toFixed(3)})`;
      track.setAttribute('aria-valuenow', String(Math.round(amount * 100)));
      track.dataset.depth = amount > 0.70 ? 'deep' : 'working';
    }
    dragTip.hidden = !port.isAirborne() || !!port.auto || port.hasDragged || port.briefing || port.portal || port.held || port.mapOpen || port.keysOpen || !!port.coachMessage?.warning;
    if (!dragTip.hidden) {
      const instruments = $('.fj-hud > dl');
      dragTip.style.top = `${instruments.offsetTop + instruments.offsetHeight + 10}px`;
    }
    hud('alt').textContent = `${Math.max(0, Math.round(g.pos.y))} m`;
    hud('wind').textContent = windReadout(air, g.yaw);
    const climb = Math.abs(vario.value) < 0.05 ? 0 : vario.value;
    const bars = Math.min(4, Math.round(Math.abs(climb) / 1.5));
    hud('vario').textContent = `${climb >= 0 ? '+' : '−'}${Math.abs(climb).toFixed(1)} m/s ${(climb >= 0 ? '▲' : '▼').repeat(bars)}`;
    hud('vario').classList.toggle('up', climb > 0.2);
    thermalFill.style.transform = `scaleX(${thermalAir.fill.toFixed(3)})`;
    thermalTrend.textContent = thermalAir.trend;
    thermalTrack.setAttribute('aria-valuenow', Math.min(THERMAL_AIR.scale, thermalAir.value).toFixed(1));
    thermalTrack.setAttribute('aria-valuetext', `${thermalAir.value.toFixed(1)} metres per second of thermal air, ${thermalAir.trend.toLowerCase()}`);
    if (port.mode === 'lost') {
      hud('speed').textContent = `${Math.round(Math.abs(g.vy) * 3.6)} km/h down`;
      hud('next').textContent = 'nowhere · 404';
      hud('belt').textContent = `${beltFor(progress)} · ${progress.unlocked.length}/${ACHIEVEMENTS.length}`;
      $('.fj-hint').textContent = '';
      return;
    }
    if (port.mode === 'cloudbase') {
      // The run writes its own readouts, and says nothing while the map is open.
      $('.fj-hint').textContent = port.runHud(port.mapOpen);
      // The notifications, with the judges' lights at their head, run down the middle of the screen.
      // Wherever they would cross the readouts (which can wrap on small phones) they start below
      // the readouts' real height, and below the buttons wherever they would cross those. A screen
      // wide enough to keep them apart keeps them at the top, clear of the title card a run opens
      // with.
      const readouts = $('.fj-hud dl').getBoundingClientRect();
      const buttons = $('.fj-hud nav').getBoundingClientRect();
      const toasts = $('.fj-toasts');
      const column = toasts.getBoundingClientRect();
      if (port.compact() || column.left < readouts.right + 8) toasts.style.top = `${Math.ceil(readouts.bottom + 8)}px`;
      else if (column.right > buttons.left - 8) toasts.style.top = `${Math.ceil(buttons.bottom + 8)}px`;
      else toasts.style.removeProperty('top');
      if (port.mapOpen) port.drawMap();
      return;
    }
    $('.fj-toasts').style.removeProperty('top');
    if (port.mode === 'flying' && g.stall > 0) hud('alt').textContent = `${Math.max(0, Math.round(g.pos.y))} m · stalled`;
    const pace = port.auto ? ` · auto ×${port.autoHaste}` : g.brake > 0.05 ? ' · brake' : '';
    hud('speed').textContent = `${Math.round(g.speed * 3.6)} km/h${port.mode === 'flying' ? pace : ''}`;
    const next = (port.nearestZone(true) ?? port.nearestZone(false))!;
    const bearing = wrapAngle(Math.atan2(next.zone.x - g.pos.x, -(next.zone.z - g.pos.z)) - g.yaw);
    const arrow = ARROWS[((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
    hud('next').textContent = `${next.zone.label} ${arrow} ${Math.round(next.dist)} m`;
    hud('belt').textContent = `${beltFor(progress)} · ${progress.unlocked.length}/${ACHIEVEMENTS.length}`;
    for (const { zone, el } of zoneLabels) {
      const dist = Math.round(Math.hypot(zone.x - g.pos.x, zone.z - g.pos.z));
      el.children[1].textContent = `${zone.place} · ${dist} m${progress.visited.includes(zone.id) ? ' · visited' : ''}`;
      el.children[2].textContent = zone === port.auto ? 'flying there' : '▶ fly here';
    }
    $('.fj-hint').textContent = port.hintText();
    if (port.mapOpen) port.drawMap();
  }

 return { update: updateHud };
}
