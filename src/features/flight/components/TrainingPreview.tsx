import { useEffect, useRef, useState } from 'react';
import type { TrainingLessonId } from '../../../domains/coaching/training-catalog.ts';

import { LESSON_ART } from '../presentation/lesson-art.ts';
export { LESSON_ART } from '../presentation/lesson-art.ts';

const PREVIEW_STEP_MS = 4000;
const PREVIEW_SPEED = 1.2;

export function BrakeDiagram({ left, right }: { left: number; right: number }) {
  return <svg viewBox="0 0 44 48" width="44" height="48" role="img" aria-label={`Left brake ${Math.round(left * 100)} percent, right brake ${Math.round(right * 100)} percent`}>
    {[left, right].map((depth, i) => <g key={i} transform={`translate(${i * 23} 0)`}>
      <rect x="2" y="2" width="17" height="44" rx="8" fill="#0b1a2c" stroke="#3a5574" />
      <path d="M5 30h11M5 38h11" stroke={depth > .7 ? '#9b7bff' : '#29c7e3'} opacity=".5" />
      <rect x="4" y={4 + depth * 28} width="13" height="12" rx="5" fill={depth > .7 ? '#9b7bff' : depth > 0 ? '#29c7e3' : '#9fb2c6'} />
      <path d={`M7 ${9 + depth * 28}h7`} stroke="#04101f" strokeWidth="1.5" />
    </g>)}
  </svg>;
}

/** A self-contained illustration: it never reads or advances the flight simulation. */
export default function TrainingPreview({ lesson, steps }: { lesson: TrainingLessonId; steps: readonly string[] }) {
  const art = LESSON_ART[lesson];
  const duration = PREVIEW_STEP_MS * art.inputs.length;
  const path = useRef<SVGPathElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [, refreshPath] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { setElapsed(0); setPaused(false); refreshPath(value => value + 1); }, [lesson]);
  useEffect(() => {
    if (paused || reduced) return;
    let frame = 0, previous = 0;
    const tick = (now: number) => {
      const delta = Math.max(0, Math.min(now - previous, 100)) * PREVIEW_SPEED;
      if (previous) setElapsed(value => (value + delta) % duration);
      previous = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lesson, paused, reduced, duration]);
  const phase = reduced ? 0 : Math.min(art.inputs.length - 1, Math.floor(elapsed / PREVIEW_STEP_MS));
  const stepElapsed = elapsed % PREVIEW_STEP_MS;
  const input = lesson === 'pitch' && phase === 1 && stepElapsed < PREVIEW_STEP_MS / 2 ? [0, 0, 'RELEASE'] as const :
    lesson === 'steering' && stepElapsed > PREVIEW_STEP_MS * .625 ? [0, 0, 'RELEASE'] as const : art.inputs[phase];
  const fraction = reduced ? .14 : elapsed / duration;
  const length = path.current?.getTotalLength() ?? 0;
  const point = path.current?.getPointAtLength(length * fraction) ?? { x: 20, y: 58 };
  const next = path.current?.getPointAtLength(Math.min(length, length * fraction + 1)) ?? point;
  const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
  return <div className="fj-lesson-demo" data-preview-state={reduced ? 'static' : paused ? 'paused' : 'playing'}>
    <div className="fj-demo-heading"><span>FLIGHT PATH + BRAKES</span><div>
      <button type="button" disabled={reduced} onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play lesson preview' : 'Pause lesson preview'}>{paused ? '▶ Play' : 'Ⅱ Pause'}</button>
      <button type="button" onClick={() => { setElapsed(0); setPaused(false); }} aria-label="Replay lesson preview">↻ Replay</button>
    </div></div>
    <div className="fj-demo-visual" aria-hidden="true">
      <svg viewBox="0 0 200 86" className="fj-demo-path"><path ref={path} d={art.path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" opacity=".5" />
        <g transform={`translate(${point.x} ${point.y}) rotate(${angle})`}><path d="M-8 3Q0-8 8 3" stroke="#e8f1fa" strokeWidth="2.7" fill="none" strokeLinecap="round" /><path d="M-6 1 0 7 6 1M0-2V7" stroke="#9fb2c6" strokeWidth=".6" /><circle cy="7" r="1.8" fill="#3ee6b0" /></g>
      </svg>
      <div className="fj-demo-hands"><BrakeDiagram left={input[0]} right={input[1]} /><kbd>{input[2]}</kbd></div>
    </div>
    <ol className="fj-lesson-steps">{steps.map((step, index) => <li key={index} data-active={phase === index ? 'true' : undefined}><b>{index + 1}</b><span>{step}</span><BrakeDiagram left={art.inputs[index][0]} right={art.inputs[index][1]} /><kbd>{art.inputs[index][2]}</kbd></li>)}</ol>
    {reduced && <p className="fj-demo-static">Static preview · reduced motion</p>}
  </div>;
}
