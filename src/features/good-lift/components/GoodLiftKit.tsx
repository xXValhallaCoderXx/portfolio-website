import type { CSSProperties } from 'react';
import type { KitSheet, KitChoice } from '../good-lift.models.ts';
import { nameOf, lookOf, rowClass, pieceName, asks, weight, buildKitView } from '../services/kit-view.service.ts';
import { useEffect, useId, useRef, useState } from 'react';
import { liveryPicture, paintLivery } from '../../../adapters/rendering/livery.ts';
import { HARNESSES } from '../../../adapters/rendering/harness.ts';
import { emptyKit } from '../../../domains/progression/wing-kit.ts';
import { kilos } from '../../../domains/good-lift/meet-card.ts';

// The meet sheet's kit tab: what the kilos banked over every run, and two of the feats, have earned
// (`sheet`, good-lift-store.js's kitSheet), and the choice of what to fly in. A choice goes to the
// game (`onKit`), which keeps only what has been earned, writes it down and dresses the glider at
// once, and hands back the kit now worn. Plain controls throughout, each labelled with its state:
// independent radio groups for wing and harness, and check boxes for chalk and helmet. Like
// the rest of the sheet it ships with the game, never with the page.

// Whether this device asks for less motion, for which the chalk, though switched on, never shows
// (meet-chalk.js).
const calmDevice = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * A wing's livery painted small, as the wing wears it: the span along, the chord down. The owner's
 * own painting, a large file, is asked for only once the swatch is on screen, so a sheet opened on
 * its result never fetches six of them.
 */
function Swatch({ id }: { id: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return undefined;
    let current = true;
    const { width, height } = element;
    paintLivery(ctx, id, width, height);
    const ask = () =>
      liveryPicture(id, import.meta.env.BASE_URL).then((picture: HTMLImageElement | null) => {
        if (current && picture) ctx.drawImage(picture, 0, 0, width, height);
      });
    const seen = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        seen?.disconnect();
        ask();
      })
      : null;
    if (seen) seen.observe(element);
    else ask();
    return () => {
      current = false;
      seen?.disconnect();
    };
  }, [id]);
  return <canvas ref={canvas} className="good-lift-swatch" width={192} height={48} aria-hidden="true" />;
}

/**
 * The kit a run has just earned, said as the sheet opens, as the feats are. The chalk switches
 * itself on, so the line says so, unless the device asks for less motion, when it never shows.
 */
export function KitNews({ sheet }: { sheet?: KitSheet }) {
  const fresh = sheet?.items.filter((item) => sheet.fresh.includes(item.id)) ?? [];
  if (!fresh.length) return null;
  const chalk = calmDevice() ? 'chalk (off while this device asks for less motion)' : 'chalk, switched on';
  const names = fresh.map((item) => (item.id === 'chalk' ? chalk : pieceName(item)));
  return <p className="good-lift-fresh">new kit: {names.join(' · ')} — see [ kit ]</p>;
}

/** The kit tab. Without a `sheet` (a run's controller that keeps none) it says so and offers nothing. */
export default function GoodLiftKit({ sheet, onKit }: { sheet?: KitSheet; onKit?: (change: Partial<KitChoice>) => KitChoice | undefined }) {
  const id = useId();
  const [worn, setWorn] = useState(() => sheet?.worn ?? emptyKit());
  const [part, setPart] = useState<'wing' | 'harness'>('wing');
  useEffect(() => {
    if (sheet?.worn) setWorn(sheet.worn);
  }, [sheet]);
  if (!sheet) return <p className="dim">// the kit comes with a run.</p>;

  const calm = calmDevice();
  const { fresh, piece, wings, next, done, state } = buildKitView(sheet);
  // Only what the game kept is shown as worn: a choice it would not keep changes nothing. Only the
  // change is sent, which the game lays over the kit it keeps, so a tab drawn again from an older
  // sheet (the map opened over it) can never put back a piece since changed.
  const choose = (change: Partial<KitChoice>) => {
    const now = onKit?.(change);
    if (now) setWorn(now);
  };

  return (
    <div className="good-lift-kit">
      <div className="good-lift-kit-progress">
        <p className="good-lift-tonnage"><span>LIFETIME BANKED</span><strong>{kilos(sheet.tonnage)} <small>kg</small></strong></p>
        <p className="good-lift-kit-next">{next ? `${kilos(next.left)} kg to ${pieceName(next)}` : 'Every rung of the ladder is open'}</p>
        <p className="good-lift-ladder" aria-hidden="true"><i style={{ '--done': done.toFixed(3) } as CSSProperties} /></p>
        {next && <p className="good-lift-kit-goal">Next unlock at {weight(next.kg!)}</p>}
      </div>
      <div className="good-lift-hangar-heading"><h3>HANGAR</h3><div role="group" aria-label="Kit part"><button type="button" aria-pressed={part === 'wing'} onClick={() => setPart('wing')}>Wing</button><button type="button" aria-pressed={part === 'harness'} onClick={() => setPart('harness')}>Harness</button></div></div>
      <fieldset className="good-lift-choice good-lift-hangar" hidden={part !== 'wing'}>
        <legend className="good-lift-hide">wing</legend>
        {wings.map((key) => {
          const item = piece(key);
          return (
            <label key={key} className={rowClass(item.earned, worn.wing === key)}>
              <input type="radio" name={`${id}-wing`} value={key} checked={worn.wing === key} disabled={!item.earned} onChange={() => choose({ wing: key })} />
              {key === 'standard' ? <span className="good-lift-swatch standard" aria-hidden="true" /> : <Swatch id={key} />}
              <b>
                {nameOf(key)}
                {fresh.has(key) && <em> new</em>}
              </b>{' '}
              <span>{worn.wing === key ? 'Equipped · ' : item.earned ? 'Equip · ' : 'Locked · '}{key === 'standard' ? lookOf(key) : state(item)}</span>
            </label>
          );
        })}
      </fieldset>

      <fieldset className="good-lift-choice good-lift-hangar" hidden={part !== 'harness'}>
        <legend className="good-lift-hide">cocoon harness</legend>
        {wings.map((key) => {
          const item = piece(key);
          const theme = HARNESSES[key as keyof typeof HARNESSES];
          const look = theme?.look ?? 'the original blue-grey cocoon';
          return (
            <label key={key} className={rowClass(item.earned, worn.harness === key)}>
              <input type="radio" name={`${id}-harness`} value={key} checked={worn.harness === key} disabled={!item.earned} onChange={() => choose({ harness: key })} />
              <span className={`good-lift-swatch harness${theme ? '' : ' standard'}`} style={theme ? { '--body': theme.body, '--trim': theme.trim } as CSSProperties : undefined} aria-hidden="true" />
              <b>{nameOf(key)}{fresh.has(key) && <em> new</em>}</b>{' '}
              <span>{worn.harness === key ? 'Equipped · ' : item.earned ? 'Equip · ' : 'Locked · '}{item.earned ? look : asks(item, sheet)}</span>
            </label>
          );
        })}
      </fieldset>

      <p className="good-lift-kit-mix">Each colour unlocks for wing and harness together. Mix them as you like.</p>
      <fieldset className="good-lift-choice good-lift-gear">
        <legend>gear</legend>
        {['chalk', 'gjermundbu'].map((key) => {
          const item = piece(key);
          const on = key === 'chalk' ? worn.chalk : worn.helmet;
          return (
            <label key={key} className={rowClass(item.earned, on)}>
              <input
                type="checkbox"
                checked={on}
                disabled={!item.earned}
                onChange={(event) => choose(key === 'chalk' ? { chalk: event.target.checked } : { helmet: event.target.checked })}
              />
              <b>
                {nameOf(key)}
                {fresh.has(key) && <em> new</em>}
              </b>{' '}
              <span>{state(item)}</span>
            </label>
          );
        })}
        {calm && <p className="dim">// chalk stays off while this device asks for less motion.</p>}
      </fieldset>
      <p className="dim">// tonnage is every kilo ever banked here; it unlocks looks, never lift.</p>
    </div>
  );
}
