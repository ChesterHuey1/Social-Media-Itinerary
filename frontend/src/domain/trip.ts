import type { Day, Stay, Trip } from './types';

export function stayForDay(trip: Trip, day: Day): Stay {
  const stay = trip.stays.find((s) => s.id === day.stayId);
  if (!stay) throw new Error(`Day ${day.number} points at missing stay ${day.stayId}`);
  return stay;
}
