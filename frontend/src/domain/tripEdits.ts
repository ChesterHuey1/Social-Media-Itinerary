import { defaultStayMinutes } from './timeline';
import type { BacklogItem, Day, Stop, StopColor, Trip } from './types';

export type StopChanges = Partial<Pick<Stop, 'title' | 'color' | 'objectives' | 'stay' | 'lockedAtMin'>>;

/** Every way the user can change a trip. AI never dispatches these; only user actions do.
 * The backend applies the same edits (backend/src/pinpoint/trips/edits.py); its copy is the one saved. */
export type TripEdit =
  | { type: 'moveStop'; dayNumber: number; fromIndex: number; toIndex: number }
  | { type: 'updateStop'; dayNumber: number; stopId: string; changes: StopChanges }
  | { type: 'addComment'; dayNumber: number; stopId: string; commentId: string; body: string; createdAt: string }
  | { type: 'moveToBacklog'; dayNumber: number; stopId: string }
  /** Moves a stop to the end of another day. Its locked time is cleared: it was a time on the old day. */
  | { type: 'moveToDay'; dayNumber: number; stopId: string; toDayNumber: number }
  | { type: 'addFromBacklog'; dayNumber: number; stop: Stop }
  /** Puts a day back to exactly these stops. Undo after Optimize route sends the day's previous stops. */
  | { type: 'replaceDayStops'; dayNumber: number; stops: Stop[] }
  /** Puts every day and the backlog back exactly. Undo after Build itinerary sends the plan from before. */
  | { type: 'restorePlan'; days: { dayNumber: number; stops: Stop[] }[]; backlog: BacklogItem[] };


function updateDay(trip: Trip, dayNumber: number, change: (day: Day) => Day): Trip {
  return { ...trip, days: trip.days.map((d) => (d.number === dayNumber ? change(d) : d)) };
}

function updateStop(trip: Trip, dayNumber: number, stopId: string, change: (stop: Stop) => Stop): Trip {
  return updateDay(trip, dayNumber, (day) => ({
    ...day,
    stops: day.stops.map((s) => (s.id === stopId ? change(s) : s)),
  }));
}

export function applyTripEdit(trip: Trip, edit: TripEdit): Trip {
  switch (edit.type) {
    case 'moveStop': {
      const { fromIndex, toIndex } = edit;
      const count = trip.days.find((d) => d.number === edit.dayNumber)?.stops.length ?? 0;
      const inRange = (i: number) => i >= 0 && i < count;
      if (fromIndex === toIndex || !inRange(fromIndex) || !inRange(toIndex)) return trip;
      return updateDay(trip, edit.dayNumber, (day) => {
        const stops = [...day.stops];
        const [moved] = stops.splice(fromIndex, 1);
        stops.splice(toIndex, 0, moved);
        return { ...day, stops };
      });
    }

    case 'updateStop':
      return updateStop(trip, edit.dayNumber, edit.stopId, (stop) => ({ ...stop, ...edit.changes }));

    case 'addComment': {
      const body = edit.body.trim();
      if (!body) return trip;
      return updateStop(trip, edit.dayNumber, edit.stopId, (stop) => ({
        ...stop,
        comments: [...stop.comments, { id: edit.commentId, body, createdAt: edit.createdAt }],
      }));
    }

    case 'moveToBacklog': {
      const stop = trip.days.find((d) => d.number === edit.dayNumber)?.stops.find((s) => s.id === edit.stopId);
      if (!stop) return trip;
      const withoutStop = updateDay(trip, edit.dayNumber, (day) => ({
        ...day,
        stops: day.stops.filter((s) => s.id !== edit.stopId),
      }));
      return {
        ...withoutStop,
        backlog: [{ placeId: stop.placeId, reason: `Moved here from Day ${edit.dayNumber}.` }, ...trip.backlog],
      };
    }

    case 'moveToDay': {
      const stop = trip.days.find((d) => d.number === edit.dayNumber)?.stops.find((s) => s.id === edit.stopId);
      if (!stop || edit.toDayNumber === edit.dayNumber || !trip.days.some((d) => d.number === edit.toDayNumber)) return trip;
      const withoutStop = updateDay(trip, edit.dayNumber, (day) => ({
        ...day,
        stops: day.stops.filter((s) => s.id !== edit.stopId),
      }));
      return updateDay(withoutStop, edit.toDayNumber, (day) => ({ ...day, stops: [...day.stops, { ...stop, lockedAtMin: null }] }));
    }

    case 'restorePlan': {
      const byDay = new Map(edit.days.map((d) => [d.dayNumber, d.stops]));
      return {
        ...trip,
        days: trip.days.map((d) => (byDay.has(d.number) ? { ...d, stops: byDay.get(d.number) ?? [] } : d)),
        backlog: edit.backlog,
      };
    }

    case 'replaceDayStops': {
      const placeIds = new Set(edit.stops.map((s) => s.placeId));
      const withStops = updateDay(trip, edit.dayNumber, (day) => ({ ...day, stops: edit.stops }));
      return { ...withStops, backlog: trip.backlog.filter((b) => !placeIds.has(b.placeId)) };
    }

    case 'addFromBacklog': {
      const { placeId } = edit.stop;
      if (!trip.backlog.some((b) => b.placeId === placeId)) return trip;
      const withStop = updateDay(trip, edit.dayNumber, (day) => ({ ...day, stops: [...day.stops, edit.stop] }));
      return { ...withStop, backlog: trip.backlog.filter((b) => b.placeId !== placeId) };
    }
  }
}

/** Same as backend/src/pinpoint/plan/defaults.py; both test suites check it. */
export const STOP_COLOR_CYCLE: StopColor[] = ['green', 'blue', 'amber', 'ink'];

/** The stop a backlog place becomes when added to the end of a day. Both the browser and the server
 * insert exactly this stop, so the defaults live in one place. */
export function stopFromBacklog(trip: Trip, dayNumber: number, placeId: string, id: string): Stop {
  const place = trip.places[placeId];
  const count = trip.days.find((d) => d.number === dayNumber)?.stops.length ?? 0;
  return {
    id,
    placeId,
    title: null,
    color: STOP_COLOR_CYCLE[count % STOP_COLOR_CYCLE.length],
    objectives: place.objectives,
    stay: { minutes: defaultStayMinutes(place.objectives), source: 'estimate' },
    lockedAtMin: null,
    comments: [],
  };
}
