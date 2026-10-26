import { defaultStayMinutes } from './timeline';
import type { Day, Stop, StopColor, Trip } from './types';

export type StopChanges = Partial<Pick<Stop, 'title' | 'color' | 'objectives' | 'stay' | 'lockedAtMin'>>;

/** Every way the user can change a trip. AI never dispatches these; only user actions do. */
export type TripEdit =
  | { type: 'moveStop'; dayNumber: number; fromIndex: number; toIndex: number }
  | { type: 'updateStop'; dayNumber: number; stopId: string; changes: StopChanges }
  | { type: 'addComment'; dayNumber: number; stopId: string; commentId: string; body: string; createdAt: string }
  | { type: 'moveToBacklog'; dayNumber: number; stopId: string }
  | { type: 'addFromBacklog'; dayNumber: number; placeId: string; stopId: string };

const STOP_COLOR_CYCLE: StopColor[] = ['orange', 'slate', 'moss', 'ink'];

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

    case 'addFromBacklog': {
      const place = trip.places[edit.placeId];
      if (!place || !trip.backlog.some((b) => b.placeId === edit.placeId)) return trip;
      const withStop = updateDay(trip, edit.dayNumber, (day) => ({
        ...day,
        stops: [
          ...day.stops,
          {
            id: edit.stopId,
            placeId: place.id,
            title: null,
            color: STOP_COLOR_CYCLE[day.stops.length % STOP_COLOR_CYCLE.length],
            objectives: place.objectives,
            stay: { minutes: defaultStayMinutes(place.objectives), source: 'estimate' },
            lockedAtMin: null,
            comments: [],
          },
        ],
      }));
      return { ...withStop, backlog: trip.backlog.filter((b) => b.placeId !== edit.placeId) };
    }
  }
}
