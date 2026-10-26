import { formatClock, formatDuration } from './format';
import { distanceM } from './geo';
import { buildTimeline, stopProblemText } from './timeline';
import { stayForDay } from './trip';
import { applyTripEdit, stopFromBacklog } from './tripEdits';
import type { Trip } from './types';

export type DayFit = { fits: true } | { fits: false; reason: string };

/** Whether the last stop of a day works there: same city, open when it would arrive, and back at the hotel by
 * the day's end. Plays the day's timeline, so it uses the same rules as the cards. */
function lastStopFits(trip: Trip, dayNumber: number): DayFit {
  const day = trip.days.find((d) => d.number === dayNumber);
  if (!day || day.stops.length === 0) return { fits: false, reason: "Can't add it there." };
  const place = trip.places[day.stops[day.stops.length - 1].placeId];
  const city = stayForDay(trip, day).city;
  if (place.city !== city) return { fits: false, reason: `This day is in ${city}.` };
  const timeline = buildTimeline(trip, day);
  const added = timeline.stops[timeline.stops.length - 1];
  if (added.problem) return { fits: false, reason: stopProblemText(added.problem, added.arriveMin) };
  if (timeline.overrunMin > 0)
    return {
      fits: false,
      reason: `Back at ${formatClock(timeline.backAtMin)}, ${formatDuration(timeline.overrunMin)} after the day ends.`,
    };
  return { fits: true };
}

/** Whether a stop still works at the end of another day. */
export function checkMoveToDay(trip: Trip, dayNumber: number, stopId: string, toDayNumber: number): DayFit {
  const moved = applyTripEdit(trip, { type: 'moveToDay', dayNumber, stopId, toDayNumber });
  return moved === trip ? { fits: false, reason: "Can't move there." } : lastStopFits(moved, toDayNumber);
}

/** The day a new saved place fits best: a day in its city where it fits at the end, nearest to that day's other
 * stops (or its hotel, when empty). Null with the reason when no day works. */
export function suggestDay(trip: Trip, placeId: string): { dayNumber: number } | { dayNumber: null; reason: string } {
  const place = trip.places[placeId];
  const sameCity = trip.days.filter((d) => stayForDay(trip, d).city === place.city);
  if (sameCity.length === 0) return { dayNumber: null, reason: `No day in ${place.city} on this trip.` };

  const distanceTo = (dayNumber: number) => {
    const day = trip.days.find((d) => d.number === dayNumber)!;
    const points = day.stops.length > 0 ? day.stops.map((s) => trip.places[s.placeId].location) : [stayForDay(trip, day).location];
    return Math.min(...points.map((p) => distanceM(p, place.location)));
  };
  const fitting = sameCity
    .filter((d) => {
      const stop = stopFromBacklog(trip, d.number, placeId, 'check');
      const withPlace = { ...trip, days: trip.days.map((x) => (x === d ? { ...x, stops: [...x.stops, stop] } : x)) };
      return lastStopFits(withPlace, d.number).fits;
    })
    .map((d) => d.number);
  if (fitting.length === 0) return { dayNumber: null, reason: `No day in ${place.city} has room.` };
  return { dayNumber: fitting.reduce((best, n) => (distanceTo(n) < distanceTo(best) ? n : best)) };
}
