import { stopFromBacklog } from '../../domain/tripEdits';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import { ObjectiveChip } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import s from './DayView.module.css';

export function Backlog({ dayNumber }: { dayNumber: number }) {
  const { trip, edit } = useTrip();
  const count = trip.backlog.length;
  return (
    <section id="backlog" aria-labelledby="backlog-title" className={s.section}>
      <div className={s.sectionHead}>
        <h2 id="backlog-title" className={s.sectionTitle}>
          Backlog
        </h2>
        <span className={s.small}>
          {count} {count === 1 ? 'place' : 'places'}
        </span>
      </div>
      {count === 0 ? (
        <p className={s.small}>Nothing here yet.</p>
      ) : (
        <ul className={cx(s.card, s.backlogList)}>
          {trip.backlog.map((item) => {
            const place = trip.places[item.placeId];
            return (
              <li key={item.placeId} className={s.backlogItem}>
                <div className={s.backlogText}>
                  <span>
                    <span className={s.strong}>{place.name}</span> <span className={s.small}>{place.area}</span>
                  </span>
                  <span className={s.small}>{item.reason}</span>
                  <div className={s.chips}>
                    {place.objectives.map((o) => (
                      <ObjectiveChip key={o} objective={o} />
                    ))}
                  </div>
                </div>
                <Button
                  icon="plus"
                  onClick={() => edit({ type: 'addFromBacklog', dayNumber, stop: stopFromBacklog(trip, dayNumber, place.id, crypto.randomUUID()) })}
                >
                  Day {dayNumber}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
