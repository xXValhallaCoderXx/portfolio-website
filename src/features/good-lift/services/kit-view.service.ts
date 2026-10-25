import { LIVERIES } from '../../../adapters/rendering/livery.ts';
import { FEATS as FEAT_LIST, THOUSAND_POUNDS, kilos } from '../../../domains/good-lift/meet-card.ts';
import { GLIDERS, GLIDER_NAMES, isGlider } from '../../../domains/good-lift/glider-ids.ts';
import { keepEarned, kitSheet, type KitProgress } from '../../../domains/progression/good-lift-store.ts';
import type { KitSheet } from '../good-lift.models.ts';
import type { GliderMenu } from '../../flight/presentation/menu-model.ts';
export interface KitItem { id: string; kind: string; earned: boolean; kg?: number; feat?: string; after?: string; left: number;
  met?: { kg: boolean; feat: boolean; after: boolean } }

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

export const nameOf = (key: string) => LIVERIES[key as keyof typeof LIVERIES]?.name ?? (isGlider(key) ? GLIDER_NAMES[key].name : NAMES[key]) ?? key;
export const lookOf = (key: string) => LIVERIES[key as keyof typeof LIVERIES]?.look ?? LOOKS[key] ?? '';
export const weight = (kg: number) => kg < 1000 ? `${kilos(kg)} kg` : `${(kg / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} t`;
// A row's classes: quiet while still to earn, lit while worn.
export const rowClass = (earned: boolean, worn: boolean) => [earned ? '' : 'locked', worn ? 'worn' : ''].filter(Boolean).join(' ') || undefined;

// One theme unlocks both pieces, and appears only once in the progress ladder and news.
export const pieceName = (item: KitItem) => (item.kind === 'wing' ? `${nameOf(item.id)} wing + harness`
  : isGlider(item.id) ? `${nameOf(item.id)} · ${GLIDER_NAMES[item.id].badge} glider` : nameOf(item.id));

// A feat as an ask: its name, and what it takes.
const featAsk = (id: string) => {
  const feat = FEAT_LIST.find((each) => each.id === id);
  return feat ? `${feat.name} — ${feat.text.charAt(0).toLowerCase()}${feat.text.slice(1).replace(/\.$/, '')}` : 'not yet earned';
};

// What a glider still asks for, every ask said with whether it is met: kilos, a glider first, a feat.
function gliderAsks(item: KitItem) {
  const said: string[] = [];
  if (item.kg) said.push(item.met?.kg ? `${weight(item.kg)} ✓` : `${weight(item.kg)} banked · ${kilos(item.left)} kg to go`);
  if (item.after) said.push(item.met?.after ? `${nameOf(item.after)} ✓` : `unlock ${nameOf(item.after)} first`);
  if (item.feat) said.push(item.met?.feat ? `${FEAT_LIST.find((each) => each.id === item.feat)?.name ?? item.feat} ✓` : featAsk(item.feat));
  return said.join(' · ');
}

// What a piece still asks for, and how far off it is.
export function asks(item: KitItem, sheet: { best: number }) {
  if (item.kind === 'glider') return gliderAsks(item);
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

/**
 * The gliders as the launch hub offers them, from the store's `progress` and the `kit` kept: the one
 * the next run flies, and every glider, earned or with what it still asks. Plain data, so the hub
 * needs none of the game to show it.
 */
export function gliderMenu(progress: KitProgress, kit: unknown): GliderMenu {
  const sheet = kitSheet(progress, kit, []);
  const options = GLIDERS.map((id) => {
    const item = sheet.items.find((each) => each.id === id);
    const { name, badge, role } = GLIDER_NAMES[id];
    return { id, name, badge, role, earned: !item || item.earned, lock: item && !item.earned ? asks(item, sheet) : '' };
  });
  return { worn: keepEarned(kit, progress).glider, options };
}
