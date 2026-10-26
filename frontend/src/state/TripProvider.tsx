import { use, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { applyTripEdit, type TripEdit } from '../domain/tripEdits';
import type { Trip } from '../domain/types';
import {
  addExpense as saveExpense,
  buildItinerary,
  deleteExpense,
  fetchTrip,
  loadTrip,
  optimizeDay,
  saveEdit,
  TRIP_ID,
  type BuildResult,
  type NewExpense,
  type OptimizeResult,
} from './api';
import { TripContext } from './tripContext';

/** Swaps in a new trip with a View Transition, so cards glide to new spots (300 ms, set in tokens.css). */
function showWithTransition(update: () => void) {
  if (typeof document.startViewTransition === 'function') document.startViewTransition(() => flushSync(update));
  else update();
}

/**
 * Each edit shows on screen at once, then saves to the server in order.
 * When the last save in flight comes back, the screen takes the server's copy.
 * If a save fails, the screen reloads the stored trip and says so.
 * Optimize route and Build itinerary wait their turn behind pending saves, then show the server's result.
 */
export function TripProvider({ children }: { children: ReactNode }) {
  const [trip, setTrip] = useState<Trip>(use(loadTrip()));
  const [saveError, setSaveError] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);

  const edit = (change: TripEdit, animate = false) => {
    if (animate) showWithTransition(() => setTrip((current) => applyTripEdit(current, change)));
    else setTrip((current) => applyTripEdit(current, change));
    inFlight.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        const saved = await saveEdit(TRIP_ID, change);
        setSaveError(false);
        if (inFlight.current === 1) setTrip(saved);
      } catch {
        setSaveError(true);
        setTrip(await fetchTrip(TRIP_ID));
      } finally {
        inFlight.current -= 1;
      }
    });
  };

  const optimize = (dayNumber: number) =>
    new Promise<OptimizeResult>((resolve, reject) => {
      queue.current = queue.current.then(async () => {
        try {
          const result = await optimizeDay(TRIP_ID, dayNumber);
          showWithTransition(() => setTrip(result.trip));
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

  const build = (includedPlaceIds: string[]) =>
    new Promise<BuildResult>((resolve, reject) => {
      queue.current = queue.current.then(async () => {
        try {
          const result = await buildItinerary(TRIP_ID, includedPlaceIds);
          setTrip(result.trip);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

  /** Runs a server call that returns the stored trip, after pending saves, and shows that trip. */
  const save = (call: () => Promise<Trip>) =>
    new Promise<void>((resolve, reject) => {
      queue.current = queue.current.then(async () => {
        try {
          setTrip(await call());
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

  const addExpense = (expense: NewExpense) => save(() => saveExpense(TRIP_ID, expense));
  const removeExpense = (expenseId: string) => save(() => deleteExpense(TRIP_ID, expenseId));

  return (
    <TripContext value={{ trip, edit, optimize, build, addExpense, removeExpense, saveError }}>{children}</TripContext>
  );
}
