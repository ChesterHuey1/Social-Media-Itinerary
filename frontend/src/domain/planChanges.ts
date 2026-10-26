import type { Trip } from './types';

/** Where a place is in a plan: a day number, the backlog, or not on the trip. */
export type Spot = number | 'backlog' | null;

export type PlanChange = { placeId: string; from: Spot; to: Spot; reason: string | null };

function spots(trip: Trip): Map<string, Spot> {
  const where = new Map<string, Spot>();
  for (const b of trip.backlog) where.set(b.placeId, 'backlog');
  for (const d of trip.days) for (const s of d.stops) where.set(s.placeId, d.number);
  return where;
}

/** Every place whose day or backlog spot differs between two plans, in the new plan's order. A place that only
 * moved within its day isn't listed. `reason` is the backlog's reason when a place ends up there. */
export function planChanges(before: Trip, after: Trip): PlanChange[] {
  const was = spots(before);
  const now = spots(after);
  const reasons = new Map(after.backlog.map((b) => [b.placeId, b.reason]));
  const order = [...new Set([...now.keys(), ...was.keys()])];
  return order
    .map((placeId) => ({ placeId, from: was.get(placeId) ?? null, to: now.get(placeId) ?? null }))
    .filter((c) => c.from !== c.to)
    .map((c) => ({ ...c, reason: c.to === 'backlog' ? (reasons.get(c.placeId) ?? null) : null }));
}

export function spotText(spot: Spot): string {
  return spot === null ? 'Not on the trip' : spot === 'backlog' ? 'Backlog' : `Day ${spot}`;
}
