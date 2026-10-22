import { multiplierOf } from '../../../domains/good-lift/score.ts';
import { comboMultiplier, styleLine, type ComboFacts } from './style-line.ts';

export const COMBO_FEEDBACK = Object.freeze({ move: 900, multiplier: 1100, banked: 1600, lost: 1200, announce: 120 });
export interface ComboStyle {
  elements: number; links: number; pending: number; last: number; total: number; landed: number; lost: number; said: number;
}
export interface ComboEvent extends ComboFacts { phase: 'move' | 'multiplier' | 'banked' | 'lost' }
const empty = (): ComboStyle => ({ elements: 0, links: 0, pending: 0, last: 0, total: 0, landed: 0, lost: 0, said: 0 });
interface TextNode { textContent: string | null }
interface ComboNode { hidden: string | boolean; className: string; dataset: Record<string, string | undefined> }
export interface ComboPolicy { layout: 'coach' | 'standalone' | 'hidden'; suppressed: boolean }

/** Only completed scored moves enter this presentation observer. It never writes to a run. */
export function createComboObserver() {
  let previous = empty();
  function reset() { previous = empty(); }
  function observe(style: Readonly<ComboStyle>, move = style.last): ComboEvent | null {
    if (style.landed < previous.landed || style.lost < previous.lost || style.total < previous.total) reset();
    const facts = { move: style.last || move || previous.last, elements: style.elements, links: style.links,
      pending: style.pending, points: 0, scoreMultiplier: multiplierOf(style.total) };
    let event: ComboEvent | null = null;
    if (style.landed > previous.landed) event = { ...facts, phase: 'banked', elements: previous.elements || 1, points: style.said };
    else if (style.lost > previous.lost) event = { ...facts, phase: 'lost', elements: previous.elements, points: style.said };
    else if (style.elements > previous.elements) event = { ...facts,
      phase: comboMultiplier(style.links) > comboMultiplier(previous.links) ? 'multiplier' : 'move',
      points: style.pending - previous.pending };
    previous = { ...style };
    return event;
  }
  return { observe, reset };
}

/** A small DOM boundary with an injectable presentation clock; no physics or score state advances. */
export function createComboPresenter({ element, label, detail, announce, now = () => performance.now() }: {
  element: ComboNode; label: TextNode; detail: TextNode; announce: TextNode; now?: () => number;
}) {
  const observer = createComboObserver();
  let current = empty(), queued: ComboEvent | null = null;
  let beat = 0;
  let active: { event: ComboEvent; until: number } | null = null;
  let announcement: { text: string; at: number } | null = null;
  const write = (node: TextNode, text: string) => { if (node.textContent !== text) node.textContent = text; };
  function clear() {
    queued = active = announcement = null;
    element.hidden = true;
    element.className = 'fj-style';
    element.dataset.phase = '';
    write(announce, '');
  }
  function reset() { observer.reset(); current = empty(); clear(); write(label, ''); write(detail, ''); }
  function observe(style: Readonly<ComboStyle>, move?: number) {
    const event = observer.observe(style, move);
    if (!event && current.elements > 0 && style.elements === 0) clear();
    else if (!event && style.links !== current.links) clear();
    current = { ...style };
    // Keep only the latest outcome between renders. Suppressed celebrations never form a queue.
    if (event) queued = event;
  }
  function present(policy: ComboPolicy): ComboEvent | null {
    if (policy.layout === 'hidden' || policy.suppressed) { clear(); return null; }
    const clock = now();
    const event = queued;
    queued = null;
    if (event) {
      active = { event, until: clock + COMBO_FEEDBACK[event.phase] };
      element.className = 'fj-style';
      element.dataset.beat = String(beat = 1 - beat);
      if (event.phase === 'banked') {
        write(announce, '');
        announcement = { text: `${event.elements > 1 ? 'Combo' : 'Move'} banked. ${event.points} style. Score multiplier ${event.scoreMultiplier.toFixed(2)}.`,
          at: clock + COMBO_FEEDBACK.announce };
      } else announcement = null;
    }
    if (active && clock >= active.until) { active = null; element.className = 'fj-style'; write(announce, ''); }
    if (announcement && clock >= announcement.at) { write(announce, announcement.text); announcement = null; }
    const facts: ComboFacts | null = active?.event ?? (current.elements > 0 ? { phase: 'pending', move: current.last,
      elements: current.elements, links: current.links, pending: current.pending, points: 0, scoreMultiplier: multiplierOf(current.total) } : null);
    element.hidden = !facts;
    element.dataset.phase = facts?.phase ?? '';
    if (facts) { const text = styleLine(facts); write(label, text.label); write(detail, text.detail); }
    return event;
  }
  reset();
  return { observe, present, clear, reset };
}
