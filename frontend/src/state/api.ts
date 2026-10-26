import type { TripEdit } from '../domain/tripEdits';
import type { BacklogItem, Stop, Trip } from '../domain/types';

export type PlanSnapshot = { days: { dayNumber: number; stops: Stop[] }[]; backlog: BacklogItem[] };

export type BuildResult = {
  trip: Trip;
  /** The plan before building, for Undo. */
  previous: PlanSnapshot;
  placed: number;
  backlogged: { placeId: string; reason: string }[];
};

/** Passed to Day 1 after Build itinerary, for the toast and its Undo. */
export type BuiltState = { placed: number; backlogged: number; previous: PlanSnapshot; at: number };

export type OptimizeResult = {
  trip: Trip;
  /** The day before optimizing, for Undo. */
  previousStops: Stop[];
  dropped: { placeId: string; reason: string }[];
};

/** The one trip v1 shows. Single user; trip selection comes later. */
export const TRIP_ID = 'demo';

async function request<T = Trip>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

export function fetchTrip(id: string): Promise<Trip> {
  return request(`/api/trips/${id}`);
}

/** Saves one edit; the server answers with the trip as stored. */
export function saveEdit(id: string, edit: TripEdit): Promise<Trip> {
  return request(`/api/trips/${id}/edits`, { method: 'POST', body: JSON.stringify(edit) });
}

/** Reorders a day on the server (OR-Tools). Dropped stops go to the backlog with a reason. */
export function optimizeDay(id: string, dayNumber: number): Promise<OptimizeResult> {
  return request<OptimizeResult>(`/api/trips/${id}/days/${dayNumber}/optimize`, { method: 'POST' });
}

/** Puts the chosen saved places onto days by city and area, then plans each day. */
export function buildItinerary(id: string, includedPlaceIds: string[]): Promise<BuildResult> {
  return request<BuildResult>('/api/trips/' + id + '/build', { method: 'POST', body: JSON.stringify({ includedPlaceIds }) });
}
