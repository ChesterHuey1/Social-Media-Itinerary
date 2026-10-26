import { useReducer, type ReactNode } from 'react';
import { applyTripEdit } from '../domain/tripEdits';
import { demoTrip } from '../mocks/demoTrip';
import { TripContext } from './tripContext';

/** Holds the trip in memory. Part 2 loads it from the API and saves each edit. */
export function TripProvider({ children }: { children: ReactNode }) {
  const [trip, edit] = useReducer(applyTripEdit, demoTrip);
  return <TripContext value={{ trip, edit }}>{children}</TripContext>;
}
