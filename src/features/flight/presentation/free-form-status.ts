/** Functional navigation status shares the HUD; flight instruction belongs to Training. */
export function freeFormStatus({ stalled, collapsed, outside, destination }: {
  stalled: boolean; collapsed: boolean; outside: boolean; destination: string | null;
}): string {
  if (stalled) return 'stalled';
  if (collapsed) return 'collapsed';
  if (outside) return 'Returning to fjord';
  return destination ? `Flying to ${destination}` : '';
}
