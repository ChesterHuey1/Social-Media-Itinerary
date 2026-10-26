import { createContext, useContext } from 'react';
import type { Trip } from '../domain/types';
import type { TripEdit } from '../domain/tripEdits';
import type { BuildResult, NewExpense, OptimizeResult } from './api';

type TripContextValue = {
  trip: Trip;
  /** `animate` glides cards to their new spots, as after Optimize route. */
  edit: (change: TripEdit, animate?: boolean) => void;
  optimize: (dayNumber: number) => Promise<OptimizeResult>;
  /** Puts these saved places onto days and plans each day. */
  build: (includedPlaceIds: string[]) => Promise<BuildResult>;
  /** Saves an expense; the server converts it to dollars. Rejects with the server's reason. */
  addExpense: (expense: NewExpense) => Promise<void>;
  removeExpense: (expenseId: string) => Promise<void>;
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
