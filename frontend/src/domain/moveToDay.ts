import { formatClock, formatDuration } from './format';
import { buildTimeline, stopProblemText } from './timeline';
import { stayForDay } from './trip';
import { applyTripEdit } from './tripEdits';
import type { Trip } from './types';

export type MoveCheck = { fits: true } | { fits: false; reason: string };

/** Whether a stop still works at the end of another day: open when it would arrive, and back at the hotel by
 * the day's end. Plays the target day's timeline with the stop added, so it uses the same rules as the cards. */
export function checkMoveToDay(trip: Trip, dayNumber: number, stopId: string, toDayNumber: number): MoveCheck {
  const moved = applyTripEdit(trip, { type: 'moveToDay', dayNumber, stopId, toDayNumber });
  const day = moved.days.find((d) => d.number === toDayNumber);
  if (moved === trip || !day) return { fits: false, reason: "Can't move there." };
  const place = trip.places[day.stops[day.stops.length - 1].placeId];
  const city = stayForDay(moved, day).city;
  if (place.city !== city) return { fits: false, reason: `This day is in ${city}.` };
  const timeline = buildTimeline(moved, day);
  const added = timeline.stops[timeline.stops.length - 1];
  if (added.problem) return { fits: false, reason: stopProblemText(added.problem, added.arriveMin) };
  if (timeline.overrunMin > 0)
    return {
      fits: false,
      reason: `Back at ${formatClock(timeline.backAtMin)}, ${formatDuration(timeline.overrunMin)} after the day ends.`,
    };
  return { fits: true };
}
