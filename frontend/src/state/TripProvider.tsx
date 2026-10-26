import { use, useRef, useState, type ReactNode } from 'react';
import { applyTripEdit, type TripEdit } from '../domain/tripEdits';
import type { Trip } from '../domain/types';
import { fetchTrip, saveEdit, TRIP_ID } from './api';
import { TripContext } from './tripContext';

// Started once, outside render, and read with use() so loading needs no effect.
const initialTrip = fetchTrip(TRIP_ID);

/**
 * Each edit shows on screen at once, then saves to the server in order.
 * When the last save in flight comes back, the screen takes the server's copy.
 * If a save fails, the screen reloads the stored trip and says so.
 */
export function TripProvider({ children }: { children: ReactNode }) {
  const [trip, setTrip] = useState<Trip>(use(initialTrip));
  const [saveError, setSaveError] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);

  const edit = (change: TripEdit) => {
    setTrip((current) => applyTripEdit(current, change));
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

  return <TripContext value={{ trip, edit, saveError }}>{children}</TripContext>;
}
