import type { TripEdit } from '../domain/tripEdits';
import type { Trip } from '../domain/types';

/** The one trip v1 shows. Single user; trip selection comes later. */
export const TRIP_ID = 'demo';

async function request(path: string, init?: RequestInit): Promise<Trip> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as Trip;
}

export function fetchTrip(id: string): Promise<Trip> {
  return request(`/api/trips/${id}`);
}

/** Saves one edit; the server answers with the trip as stored. */
export function saveEdit(id: string, edit: TripEdit): Promise<Trip> {
  return request(`/api/trips/${id}/edits`, { method: 'POST', body: JSON.stringify(edit) });
}
