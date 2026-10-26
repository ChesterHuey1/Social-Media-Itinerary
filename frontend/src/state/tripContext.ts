import { createContext, useContext, type Dispatch } from 'react';
import type { Trip } from '../domain/types';
import type { TripEdit } from '../domain/tripEdits';

export const TripContext = createContext<{ trip: Trip; edit: Dispatch<TripEdit> } | null>(null);

/** The trip and the one function that changes it. Every edit goes through `applyTripEdit`. */
export function useTrip() {
  const value = useContext(TripContext);
  if (!value) throw new Error('useTrip must be used inside <TripProvider>');
  return value;
}
