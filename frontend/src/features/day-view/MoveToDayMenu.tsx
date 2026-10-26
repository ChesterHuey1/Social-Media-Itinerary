import { formatDate } from '../../domain/format';
import { checkMoveToDay } from '../../domain/dayFit';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import s from './DayView.module.css';

type Props = { dayNumber: number; stopId: string; onClose: () => void };

/** Every other day, each saying whether the stop fits at its end. A day where it doesn't fit can still be picked. */
export function MoveToDayMenu({ dayNumber, stopId, onClose }: Props) {
  const { trip, edit } = useTrip();
  const move = (toDayNumber: number) => {
    edit({ type: 'moveToDay', dayNumber, stopId, toDayNumber }, true);
    onClose();
  };

  return (
    <div className={s.moveMenu} role="group" aria-label="Move to another day">
      {trip.days
        .filter((d) => d.number !== dayNumber)
        .map((d) => {
          const check = checkMoveToDay(trip, dayNumber, stopId, d.number);
          return (
            <div key={d.number} className={s.moveRow}>
              <span className={s.moveText}>
                <span className={s.strong}>
                  Day {d.number} · {formatDate(d.date)}
                </span>
                <span className={check.fits ? s.small : s.moveWarn}>{check.fits ? 'Fits at the end' : check.reason}</span>
              </span>
              <Button variant="text" onClick={() => move(d.number)}>
                Move here
              </Button>
            </div>
          );
        })}
      <Button variant="text" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}
