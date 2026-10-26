import type { TripEdit } from '../domain/tripEdits';
import type { BacklogItem, Flight, SpendingCategory, Stay, Stop, Trip } from '../domain/types';

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
  // The session ran out: reloading shows sign-in.
  if (response.status === 401) window.location.reload();
  if (!response.ok) {
    // The server's reason, written for people (FastAPI's `detail`), when it gave one.
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === 'string' ? body.detail : `${init?.method ?? 'GET'} ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchTrip(id: string): Promise<Trip> {
  return request(`/api/trips/${id}`);
}

let firstLoad: Promise<Trip> | null = null;

/** The first load of the trip, started once and read with use(), so loading needs no effect. Starts only after sign-in. */
export function loadTrip(): Promise<Trip> {
  firstLoad ??= fetchTrip(TRIP_ID);
  return firstLoad;
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

export type NewExpense = { amount: number; currency: string; category: SpendingCategory; note: string; date: string };

/** The rate an expense on this date would use; `rateDate` can be earlier (weekends) or the latest rate (future dates). */
export type FxQuote = { currency: string; usdPerUnit: number; rateDate: string };

export function fxQuote(currency: string, date: string): Promise<FxQuote> {
  return request<FxQuote>('/api/fx?' + new URLSearchParams({ currency, date }).toString());
}

/** The server converts at the expense date's rate and answers with the trip as stored. */
export function addExpense(id: string, expense: NewExpense): Promise<Trip> {
  return request('/api/trips/' + id + '/expenses', { method: 'POST', body: JSON.stringify(expense) });
}

export function deleteExpense(id: string, expenseId: string): Promise<Trip> {
  return request('/api/trips/' + id + '/expenses/' + expenseId, { method: 'DELETE' });
}

/** One Trip setup change. The server saves it, then works the days out again from flights, hotels and hours. */
export type SetupChange =
  | { type: 'setTripDetails'; name: string; travelers: number; budgetUsd: number }
  | { type: 'setDayHours'; dayNumber: number; startMin: number; endMin: number }
  | { type: 'saveFlight'; flight: Flight }
  | { type: 'removeFlight'; flightId: string }
  | { type: 'saveStay'; stay: Stay };

export function saveSetup(id: string, change: SetupChange): Promise<Trip> {
  return request('/api/trips/' + id + '/setup', { method: 'POST', body: JSON.stringify(change) });
}
