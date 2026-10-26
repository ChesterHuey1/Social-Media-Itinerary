import { createContext, useContext } from 'react';
import type { Trip } from '../domain/types';
import type { TripEdit } from '../domain/tripEdits';

type TripContextValue = {
  trip: Trip;
  edit: (change: TripEdit) => void;
  /** True when the last save failed and the screen was reset to the stored trip. */
  saveError: boolean;
};

export const TripContext = createContext<TripContextValue | null>(null);

/** The trip and the one function that changes it. Every edit goes through `applyTripEdit`. */
export function useTrip() {
  const value = useContext(TripContext);
  if (!value) throw new Error('useTrip must be used inside <TripProvider>');
  return value;
}
