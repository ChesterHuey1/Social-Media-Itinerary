import { distanceM } from './geo';
import { checkVisit } from './hours';
import { LEG_SLACK_MIN, type Timeline } from './timeline';
import type { Day, LatLng, Place, Trip } from './types';

const MIN_OPEN_GAP_MIN = 30;
const NEARBY_M = 4000;
const SUGGESTED_VISIT_MIN = 60;

/** Free time between the last stop and when you must head back to the hotel. */
export function openTimeAtEnd(day: Day, timeline: Timeline): { fromMin: number; toMin: number } | null {
  const last = timeline.stops.at(-1);
  if (!last || !timeline.returnLeg) return null;
  const toMin = Math.floor((day.endMin - timeline.returnLeg.minutes - LEG_SLACK_MIN) / 5) * 5;
  return toMin - last.leaveMin >= MIN_OPEN_GAP_MIN ? { fromMin: last.leaveMin, toMin } : null;
}

export type DaySummary = {
  stopCount: number;
  distanceM: number;
  travelMin: number;
  foodUsd: number;
  ticketsUsd: number;
  transitUsd: number;
  totalUsd: number;
  /** True when any amount is an AI estimate or a leg is a straight-line guess. */
  estimated: boolean;
  bookAhead: string[];
};

/** One day's totals: shown as one line under the title, and itemized after the last stop. */
export function daySummary(timeline: Timeline): DaySummary {
  const legs = [...timeline.stops.map((t) => t.legBefore), ...(timeline.returnLeg ? [timeline.returnLeg] : [])];
  const costs = timeline.stops.map((t) => t.place.cost).filter((c) => c !== null);
  const foodUsd = costs.filter((c) => c.per === 'person').reduce((sum, c) => sum + c.usd, 0);
  const ticketsUsd = costs.filter((c) => c.per === 'ticket').reduce((sum, c) => sum + c.usd, 0);
  const transitUsd = legs.reduce((sum, leg) => sum + (leg.fareUsd ?? 0), 0);
  return {
    stopCount: timeline.stops.length,
    distanceM: legs.reduce((sum, leg) => sum + leg.distanceM, 0),
    travelMin: legs.reduce((sum, leg) => sum + leg.minutes, 0),
    foodUsd,
    ticketsUsd,
    transitUsd,
    totalUsd: foodUsd + ticketsUsd + transitUsd,
    estimated: costs.some((c) => c.source === 'deepseek') || legs.some((leg) => leg.source === 'estimate'),
    bookAhead: timeline.stops.filter((t) => t.place.needsBooking).map((t) => t.stop.title ?? t.place.name),
  };
}

/** Backlog places within walking-plus-short-ride range of any stop on the day. */
export function nearbyBacklog(trip: Trip, day: Day): Place[] {
  const stopLocations = day.stops.map((s) => trip.places[s.placeId].location);
  return trip.backlog
    .map((b) => trip.places[b.placeId])
    .filter((p) => stopLocations.some((loc) => distanceM(loc, p.location) <= NEARBY_M));
}

/** Backlog places near `near` that pass the hours rules for a visit starting at `fromMin`. */
export function backlogOpenAt(trip: Trip, near: LatLng, fromMin: number): Place[] {
  return trip.backlog
    .map((b) => trip.places[b.placeId])
    .filter((p) => distanceM(near, p.location) <= NEARBY_M)
    .filter((p) => checkVisit(fromMin, SUGGESTED_VISIT_MIN, p.hours, p.lastEntryMin).ok);
}
