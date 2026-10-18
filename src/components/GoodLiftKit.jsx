import { useEffect, useId, useRef, useState } from 'react';
import { LIVERIES, liveryPicture, paintLivery } from '../game/livery.js';
import { HARNESSES } from '../game/harness.js';
import { emptyKit } from '../game/wing-kit.js';
import { THOUSAND_POUNDS, kilos } from '../game/meet-card.js';

// The meet sheet's kit tab: what the kilos banked over every run, and two of the feats, have earned
// (`sheet`, good-lift-store.js's kitSheet), and the choice of what to fly in. A choice goes to the
// game (`onKit`), which keeps only what has been earned, writes it down and dresses the glider at
// once, and hands back the kit now worn. Plain controls throughout, each labelled with its state:
// independent radio groups for wing and harness, and check boxes for chalk and helmet. Like
// the rest of the sheet it ships with the game, never with the page.

const NAMES = { standard: 'Standard', chalk: 'Chalk', gjermundbu: 'Gjermundbu helmet' };
const LOOKS = {
  standard: 'the wing as it has always been',
  chalk: 'a puff of chalk from the hands as a plate or a rep loads',
  gjermundbu: 'iron, with a spectacle guard, and no horns',
};
// What each feat that earns a piece asks for.
const FEATS = {
  'clean-meet': 'a clean meet: four lifts or more, every light white',
  'thousand-pound-club': 'the 1,000 lb club: 453.6 kg in one run',
};

const nameOf = (key) => LIVERIES[key]?.name ?? NAMES[key] ?? key;
const lookOf = (key) => LIVERIES[key]?.look ?? LOOKS[key] ?? '';
const weight = (kg) => kg < 1000 ? `${kilos(kg)} kg` : `${(kg / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} t`;
// Whether this device asks for less motion, for which the chalk, though switched on, never shows
// (meet-chalk.js).
const calmDevice = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// A row's classes: quiet while still to earn, lit while worn.
const rowClass = (earned, worn) => [earned ? '' : 'locked', worn ? 'worn' : ''].filter(Boolean).join(' ') || undefined;

// One theme unlocks both pieces, and appears only once in the progress ladder and news.
const pieceName = (item) => (item.kind === 'wing' ? `${nameOf(item.id)} wing + harness` : nameOf(item.id));

// What a piece still asks for, and how far off it is.
function asks(item, sheet) {
  if (item.kg) return `${weight(item.kg)} banked · ${kilos(item.left)} kg to go`;
  if (item.feat === 'thousand-pound-club') {
    return `${FEATS[item.feat]} · best ${kilos(sheet.best)} kg, ${kilos(Math.max(0, THOUSAND_POUNDS - sheet.best))} kg short`;
  }
  return FEATS[item.feat] ?? 'not yet earned';
}

/**
 * A wing's livery painted small, as the wing wears it: the span along, the chord down. The owner's
 * own painting, a large file, is asked for only once the swatch is on screen, so a sheet opened on
 * its result never fetches six of them.
 */
function Swatch({ id }) {
  const canvas = useRef(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return undefined;
    let current = true;
    const { width, height } = canvas.current;
    paintLivery(ctx, id, width, height);
    const ask = () =>
      liveryPicture(id, import.meta.env.BASE_URL).then((picture) => {
        if (current && picture) ctx.drawImage(picture, 0, 0, width, height);
      });
    const seen = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        seen.disconnect();
        ask();
      })
      : null;
    if (seen) seen.observe(canvas.current);
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
export function KitNews({ sheet }) {
  const fresh = sheet?.items.filter((item) => sheet.fresh.includes(item.id)) ?? [];
  if (!fresh.length) return null;
  const chalk = calmDevice() ? 'chalk (off while this device asks for less motion)' : 'chalk, switched on';
  const names = fresh.map((item) => (item.id === 'chalk' ? chalk : pieceName(item)));
  return <p className="good-lift-fresh">new kit: {names.join(' · ')} — see [ kit ]</p>;
}

/** The kit tab. Without a `sheet` (a run's controller that keeps none) it says so and offers nothing. */
export default function GoodLiftKit({ sheet, onKit }) {
  const id = useId();
  const [worn, setWorn] = useState(() => sheet?.worn ?? emptyKit());
  useEffect(() => {
    if (sheet?.worn) setWorn(sheet.worn);
  }, [sheet]);
  if (!sheet) return <p className="dim">// the kit comes with a run.</p>;

  const calm = calmDevice();
  const fresh = new Set(sheet.fresh);
  // The standard wing is no piece of the ladder: every visitor has it.
  const piece = (key) => sheet.items.find((item) => item.id === key) ?? { id: key, kind: 'wing', earned: key === 'standard' };
  const wings = ['standard', ...sheet.items.filter((item) => item.kind === 'wing').map((item) => item.id)];
  // Only what the game kept is shown as worn: a choice it would not keep changes nothing. Only the
  // change is sent, which the game lays over the kit it keeps, so a tab drawn again from an older
  // sheet (the map opened over it) can never put back a piece since changed.
  const choose = (change) => {
    const now = onKit?.(change);
    if (now) setWorn(now);
  };
  const { next } = sheet;
  // How far from the last rung to the next the tonnage has come.
  const below = next ? sheet.items.reduce((most, item) => (item.kg && item.kg < next.kg ? Math.max(most, item.kg) : most), 0) : 0;
  const done = next ? Math.min(1, Math.max(0, (sheet.tonnage - below) / (next.kg - below))) : 1;
  const state = (item) => (item.earned ? `unlocked · ${lookOf(item.id)}` : asks(item, sheet));

  return (
    <div className="good-lift-kit">
      <p className="good-lift-tonnage">
        lifetime <strong>{kilos(sheet.tonnage)} kg</strong> banked
        {next ? ` · next: ${pieceName(next)} at ${weight(next.kg)}, ${kilos(next.left)} kg to go` : ' · every rung of the ladder is open'}
      </p>
      <p className="good-lift-ladder" aria-hidden="true">
        <i style={{ '--done': done.toFixed(3) }} />
      </p>

      <fieldset className="good-lift-choice">
        <legend>wing</legend>
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
              <span>{key === 'standard' ? lookOf(key) : state(item)}</span>
            </label>
          );
        })}
      </fieldset>

      <fieldset className="good-lift-choice">
        <legend>cocoon harness</legend>
        <p className="dim">// each colour unlocks for wing and harness together. Mix them as you like.</p>
        {wings.map((key) => {
          const item = piece(key);
          const theme = HARNESSES[key];
          const look = theme?.look ?? 'the original blue-grey cocoon';
          return (
            <label key={key} className={rowClass(item.earned, worn.harness === key)}>
              <input type="radio" name={`${id}-harness`} value={key} checked={worn.harness === key} disabled={!item.earned} onChange={() => choose({ harness: key })} />
              <span className={`good-lift-swatch harness${theme ? '' : ' standard'}`} style={theme ? { '--body': theme.body, '--trim': theme.trim } : undefined} aria-hidden="true" />
              <b>{nameOf(key)}{fresh.has(key) && <em> new</em>}</b>{' '}
              <span>{item.earned ? `unlocked · ${look}` : asks(item, sheet)}</span>
            </label>
          );
        })}
      </fieldset>

      <fieldset className="good-lift-choice">
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
