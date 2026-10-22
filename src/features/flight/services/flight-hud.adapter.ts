import { ACHIEVEMENTS, beltFor } from '../../../domains/progression/achievements.ts';
import type { readProgress } from '../../../adapters/browser/flight-progress.service.ts';
import type { FlightState, FlightInput, AirSample } from '../../../domains/flight/models.ts';
import type { CoachFields } from '../../../domains/coaching/models.ts';
import { THERMAL_AIR } from '../presentation/thermal-air.ts';
import { windReadout } from '../presentation/wind-feedback.ts';
import { flightMessageOwner, flightSecondaryOwner } from '../presentation/flight-message.ts';
import { TRAINING_LESSON_INFO, type TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';
import type { FlightZone } from './flight-navigation.service.ts';
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
interface RunReadouts {
 nextLine: number; bar: number; total: number; fogClearance: number; status: string; acroPoints: number; horn: boolean;
}
interface FlightHudPort {
 stage: HTMLElement; g: FlightState; input: FlightInput; air: AirSample;
 vario: { readonly value: number }; thermalAir: { readonly fill: number; readonly value: number; readonly trend: string };
 progress: ReturnType<typeof readProgress>; zoneLabels: { zone: FlightZone; el: HTMLElement }[]; autoHaste: number;
 readonly mode: string; readonly auto: FlightZone | null; readonly mapOpen: boolean; readonly keysOpen: boolean; readonly briefing: boolean; readonly hasDragged: boolean; readonly portal: boolean; readonly held: boolean; readonly coachMessage: CoachFields | null;
 isAirborne(): boolean; compact(): boolean; runHud(quiet: boolean): string; runReadouts?(): RunReadouts | null;
 clearComboFeedback?(): void;
 trainingReadouts?(): {lesson: string; points: number} | null;
 nearestZone(onlyUnvisited: boolean): { zone: FlightZone; dist: number } | null; hintText(): string; drawMap(): void;
}
/** DOM readouts only sample the session; all flight and coaching state remains owned upstream. */
export function createFlightHud(port: FlightHudPort) {
 const { stage, g, input, air, vario, thermalAir, progress, zoneLabels } = port;
 const $ = (selector: string): HTMLElement => { const node = stage.querySelector<HTMLElement>(selector); if (!node) throw new Error(`Flight HUD is missing ${selector}`); return node; };
 const hud = (name: string) => $(`[data-hud="${name}"]`);
 const brakePair = $('.fj-brake-pair'), brakeTracks = [...stage.querySelectorAll<HTMLElement>('[data-brake-side]')], dragTip = $('.fj-drag-tip');
 const thermalTrack = $('.fj-thermal-track'), thermalFill = thermalTrack.querySelector('i')!, thermalTrend = $('[data-thermal-trend]');
 const label = $('[data-alt-label]'), altitudeProgress = $('.fj-alt-progress'), status = $('[data-flight-status]');
 const styleReadout = document.createElement('span'); styleReadout.dataset.styleReadout = ''; styleReadout.hidden = true; $('.fj-telemetry').append(styleReadout);
 function metric(name: string, value: string, unit: string) {
   const node = hud(name), text = `${value} ${unit}`;
   if (node.textContent === text && node.querySelector('.fj-metric-unit')) return;
   const suffix = document.createElement('span'); suffix.className = 'fj-metric-unit'; suffix.textContent = ` ${unit}`;
   node.replaceChildren(document.createTextNode(value), suffix);
 }
 function messages() {
   const blocked = !port.isAirborne() || port.mapOpen || port.keysOpen || port.briefing || port.portal || port.held || document.hidden;
   const message = port.coachMessage;
   const urgent = !!message?.warning || !!message?.urgent;
   const judges = !!stage.querySelector('.fj-lights:not([hidden])');
   const owner = flightMessageOwner({ blocked, urgent, coach: !!message, judges,
     notice: !!stage.querySelector('.fj-toast'), hint: !!$('.fj-hint').textContent,
     intro: port.mode !== 'cloudbase' && port.mode !== 'training' && !port.hasDragged && !port.auto });
   stage.dataset.messageOwner = owner;
   const secondary = flightSecondaryOwner({ blocked, urgent, judges });
   stage.dataset.secondaryOwner = secondary;
   const comboLayout = blocked || urgent || judges ? 'hidden' : owner === 'coach' ? 'coach' : 'standalone';
   stage.dataset.comboLayout = comboLayout;
   stage.dataset.comboSuppressed = String(comboLayout === 'hidden');
   if (comboLayout === 'hidden') port.clearComboFeedback?.();
   dragTip.hidden = owner !== 'intro';
   const said = stage.querySelector('.fj-said');
   said?.setAttribute('aria-live', secondary === 'judges' ? 'polite' : 'off');
   $('.fj-toasts').setAttribute('aria-hidden', String(secondary !== 'judges' && owner !== 'notice'));
 }
 function layoutMessages() {
   const telemetry = $('.fj-telemetry').getBoundingClientRect();
   const top = Math.ceil(telemetry.bottom - stage.getBoundingClientRect().top + 12);
   stage.style.setProperty('--coach-top', `${top}px`);
   stage.style.setProperty('--message-top', `${top}px`);
   const coachHeight = stage.dataset.messageOwner === 'coach' ? $('.fj-coach').getBoundingClientRect().height : 0;
   stage.style.setProperty('--secondary-top', `${top + (coachHeight ? coachHeight + 8 : 0)}px`);
 }
 function updateHud() {
   const blocked = port.mapOpen || port.keysOpen || port.briefing || port.portal || port.held;
   const direct = port.isAirborne() && input.controlMode === 'brakes' && !port.auto;
   brakePair.hidden = !direct || blocked || Math.max(g.leftBrake ?? 0, g.rightBrake ?? 0) < .04;
   for (const track of brakeTracks) {
     const amount = direct ? clamp((g[`${track.dataset.brakeSide as 'left' | 'right'}Brake`] ?? 0) / 0.6, 0, 1) : 0;
     track.querySelector('i')!.style.transform = `scaleX(${amount.toFixed(3)})`;
     track.setAttribute('aria-valuenow', String(Math.round(amount * 100)));
     track.dataset.depth = amount > 0.70 ? 'deep' : 'working';
   }
   metric('alt', String(Math.max(0, Math.round(g.pos.y))), 'm');
   hud('wind').textContent = windReadout(air, g.yaw);
   const climb = Math.abs(vario.value) < 0.05 ? 0 : vario.value;
   metric('vario', `${climb >= 0 ? '+' : '−'}${Math.abs(climb).toFixed(1)}`, `m/s ${climb >= 0 ? '▲' : '▼'}`);
   hud('vario').classList.toggle('up', climb > 0.2);
   thermalFill.style.transform = `scaleX(${thermalAir.fill.toFixed(3)})`;
   thermalTrend.textContent = thermalAir.trend;
   thermalTrack.setAttribute('aria-valuenow', Math.min(THERMAL_AIR.scale, thermalAir.value).toFixed(1));
   thermalTrack.setAttribute('aria-valuetext', `${thermalAir.value.toFixed(1)} metres per second of thermal air, ${thermalAir.trend.toLowerCase()}`);
   label.textContent = 'ALT'; altitudeProgress.hidden = true; status.hidden = true; styleReadout.hidden = true;
   $('.fj-destination-metric dt').textContent = port.mode === 'training' ? 'LESSON' : 'NEXT';
   if (port.mode === 'lost') {
     hud('speed').textContent = `${Math.round(Math.abs(g.vy) * 3.6)} km/h down`;
     hud('destination').textContent = '404'; hud('next').textContent = 'nowhere · 404';
     hud('belt').textContent = `${beltFor(progress)} · ${progress.unlocked.length}/${ACHIEVEMENTS.length}`;
     $('.fj-hint').textContent = '';
   } else if (port.mode === 'cloudbase') {
     $('.fj-hint').textContent = port.runHud(blocked);
     const run = port.runReadouts?.();
     if (run) {
       label.textContent = `ALT → ${run.nextLine}`;
       metric('alt', String(Math.max(0, Math.floor(g.pos.y))), 'm');
       metric('bar', String(Math.round(run.bar * 10) / 10), run.horn ? 'kg ×2' : 'kg');
       hud('belt').textContent = `score ${Math.round(run.total + run.acroPoints)} · lifted ${Math.round(run.total * 10) / 10} kg`;
       hud('next').textContent = `fog ${run.fogClearance} m ↓`;
       hud('next').classList.toggle('fj-fog-close', run.fogClearance < 80);
       status.textContent = run.status; status.hidden = !run.status;
       styleReadout.textContent = `acro +${run.acroPoints.toLocaleString('en-GB')}`; styleReadout.hidden = run.acroPoints <= 0;
       altitudeProgress.hidden = false;
       const previousLine = Math.max(0, run.nextLine - 150);
       const fill = clamp((g.pos.y - previousLine) / Math.max(1, run.nextLine - previousLine), 0, 1);
       altitudeProgress.querySelector<HTMLElement>('i')!.style.transform = `scaleX(${fill})`;
       altitudeProgress.setAttribute('aria-valuenow', String(Math.round(fill * 100)));
       altitudeProgress.setAttribute('aria-valuetext', `${Math.max(0, Math.round(g.pos.y))} metres; next banking line ${run.nextLine} metres`);
     }
   } else if (port.mode === 'training') {
     const practice = port.trainingReadouts?.();
     const lesson = TRAINING_LESSON_INFO[practice?.lesson as TrainingLessonId]?.label ?? (practice?.lesson ?? '').toUpperCase();
     label.textContent = 'TRAINING';
     hud('destination').textContent = lesson;
     hud('speed').textContent = `${Math.round(g.speed * 3.6)} km/h`;
     hud('belt').textContent = 'unranked practice';
     hud('next').textContent = practice?.points ? `acro +${practice.points}` : '';
     hud('next').classList.remove('fj-fog-close');
     status.textContent = g.stall > 0 ? 'stalled' : g.tuck > 0 ? 'collapsed' : ''; status.hidden = !status.textContent;
     $('.fj-hint').textContent = '';
   } else {
     hud('next').classList.remove('fj-fog-close');
     status.textContent = g.stall > 0 ? 'stalled' : ''; status.hidden = !status.textContent;
     const pace = port.auto ? ` · auto ×${port.autoHaste}` : g.brake > 0.05 ? ' · brake' : '';
     hud('speed').textContent = `${Math.round(g.speed * 3.6)} km/h${port.mode === 'flying' ? pace : ''}`;
     const next = port.nearestZone(true) ?? port.nearestZone(false);
     if (next) {
       const bearing = wrapAngle(Math.atan2(next.zone.x - g.pos.x, -(next.zone.z - g.pos.z)) - g.yaw);
       const arrow = ARROWS[((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
       hud('destination').textContent = next.zone.label;
       hud('next').textContent = `${arrow} ${Math.round(next.dist)} m`;
     }
     hud('belt').textContent = `${beltFor(progress)} · ${progress.unlocked.length}/${ACHIEVEMENTS.length}`;
     for (const { zone, el } of zoneLabels) {
       const dist = Math.round(Math.hypot(zone.x - g.pos.x, zone.z - g.pos.z));
       el.children[1].textContent = `${zone.place} · ${dist} m${progress.visited.includes(zone.id) ? ' · visited' : ''}`;
       el.children[2].textContent = zone === port.auto ? 'flying there' : '▶ fly here';
     }
     $('.fj-hint').textContent = port.hintText();
   }
   $('.fj-toasts').style.removeProperty('top');
   messages();
   layoutMessages();
   if (port.mapOpen) port.drawMap();
 }
 return { update: updateHud, presentMessages: messages, layoutMessages };
}
