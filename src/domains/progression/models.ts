export interface FlightProgress {
  unlocked: string[];
  visited: string[];
  stones: number[];
  landingBests: Record<string, number>;
  cloudbase: { discovered: boolean; bestAltitude: number };
}
export interface WornKit { wing: string; harness: string; helmet: boolean; chalk: boolean; glider: string }
export interface KitReward { readonly id: string; readonly kind: string; readonly kg?: number; readonly feat?: string; readonly after?: string }
