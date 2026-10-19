import { LIVERIES } from '../../../adapters/rendering/livery.ts';
import { THOUSAND_POUNDS, kilos } from '../../../domains/good-lift/meet-card.ts';
import type { KitSheet } from '../good-lift.models.ts';
export interface KitItem { id: string; kind: string; earned: boolean; kg?: number; feat?: string; left: number }

const NAMES: Record<string, string> = { standard: 'Standard', chalk: 'Chalk', gjermundbu: 'Gjermundbu helmet' };
const LOOKS: Record<string, string> = {
  standard: 'the wing as it has always been',
  chalk: 'a puff of chalk from the hands as a plate or a rep loads',
  gjermundbu: 'iron, with a spectacle guard, and no horns',
};
// What each feat that earns a piece asks for.
const FEATS: Record<string, string> = {
  'clean-meet': 'a clean meet: four lifts or more, every light white',
  'thousand-pound-club': 'the 1,000 lb club: 453.6 kg in one run',
};

export const nameOf = (key: string) => LIVERIES[key as keyof typeof LIVERIES]?.name ?? NAMES[key] ?? key;
export const lookOf = (key: string) => LIVERIES[key as keyof typeof LIVERIES]?.look ?? LOOKS[key] ?? '';
export const weight = (kg: number) => kg < 1000 ? `${kilos(kg)} kg` : `${(kg / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} t`;
// A row's classes: quiet while still to earn, lit while worn.
export const rowClass = (earned: boolean, worn: boolean) => [earned ? '' : 'locked', worn ? 'worn' : ''].filter(Boolean).join(' ') || undefined;

// One theme unlocks both pieces, and appears only once in the progress ladder and news.
export const pieceName = (item: KitItem) => (item.kind === 'wing' ? `${nameOf(item.id)} wing + harness` : nameOf(item.id));

// What a piece still asks for, and how far off it is.
export function asks(item: KitItem, sheet: { best: number }) {
  if (item.kg) return `${weight(item.kg)} banked · ${kilos(item.left)} kg to go`;
  if (item.feat === 'thousand-pound-club') {
    return `${FEATS[item.feat]} · best ${kilos(sheet.best)} kg, ${kilos(Math.max(0, THOUSAND_POUNDS - sheet.best))} kg short`;
  }
  return FEATS[item.feat ?? ''] ?? 'not yet earned';
}


/** Read-only kit view data; choosing a piece stays an explicit session command. */
export function buildKitView(sheet: KitSheet) {
 const fresh = new Set(sheet.fresh);
 const piece = (key: string): KitItem => sheet.items.find(item => item.id === key) ?? {id:key, kind:'wing', earned:key === 'standard', left:0};
 const wings = ['standard', ...sheet.items.filter(item => item.kind === 'wing').map(item => item.id)];
 const { next } = sheet;
 const below = next ? sheet.items.reduce((most, item) => (item.kg && item.kg < next.kg! ? Math.max(most, item.kg) : most), 0) : 0;
 const done = next ? Math.min(1, Math.max(0, (sheet.tonnage - below) / (next.kg! - below))) : 1;
 const state = (item: KitItem) => item.earned ? `unlocked · ${lookOf(item.id)}` : asks(item, sheet);
 return { fresh, piece, wings, next, done, state };
}
