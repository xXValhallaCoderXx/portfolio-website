export interface LandingScoreData { expiresAt: number; distance: number; grade: string; points: number; bestDistance: number }
export interface FlightPanel { id: string; path: string; landing?: LandingScoreData | null; next?: { id: string; label: string } | null }
