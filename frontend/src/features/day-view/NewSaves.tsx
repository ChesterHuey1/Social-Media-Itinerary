import { suggestDay } from '../../domain/dayFit';
import { stopFromBacklog } from '../../domain/tripEdits';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import { ObjectiveChip } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import s from './DayView.module.css';

/** Places saved since the trip was built. Each goes to the day it fits best, or to the backlog. Hidden when none. */
export function NewSaves() {
  const { trip, edit } = useTrip();
  const saves = trip.savedPlaces.filter((sp) => sp.status === 'new');
  if (saves.length === 0) return null;

  return (
    <section id="new-saves" aria-labelledby="new-saves-title" className={s.section}>
      <div className={s.sectionHead}>
        <h2 id="new-saves-title" className={s.sectionTitle}>
          New saves
        </h2>
        <span className={s.small}>Saved since you built the trip</span>
      </div>
      <ul className={cx(s.card, s.backlogList)}>
        {saves.map((sp) => {
          const place = trip.places[sp.placeId];
          const suggestion = suggestDay(trip, sp.placeId);
          return (
            <li key={sp.placeId} className={s.backlogItem}>
              <div className={s.backlogText}>
                <span>
                  <span className={s.strong}>{place.name}</span> <span className={s.small}>{place.area}</span>
                </span>
                {suggestion.dayNumber === null && <span className={s.small}>{suggestion.reason}</span>}
                <div className={s.chips}>
                  {place.objectives.map((o) => (
                    <ObjectiveChip key={o} objective={o} />
                  ))}
                </div>
              </div>
              <span className={s.actions}>
                {suggestion.dayNumber !== null && (
                  <Button
                    icon="plus"
                    onClick={() =>
                      edit({
                        type: 'savedToDay',
                        dayNumber: suggestion.dayNumber,
                        stop: stopFromBacklog(trip, suggestion.dayNumber, sp.placeId, crypto.randomUUID()),
                      })
                    }
                  >
                    Add to Day {suggestion.dayNumber}
                  </Button>
                )}
                <Button variant="text" onClick={() => edit({ type: 'savedToBacklog', placeId: sp.placeId })}>
                  Backlog
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
