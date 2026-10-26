import { Link } from 'react-router-dom';
import { BudgetPanel } from '../budget/BudgetPanel';
import { formatDate, formatDateRange } from '../../domain/format';
import type { Trip } from '../../domain/types';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/Icon';
import s from './DayView.module.css';

export function Sidebar({ trip, activeDay }: { trip: Trip; activeDay: number }) {
  return (
    <aside className={s.sidebar}>
      <section className={cx(s.group, s.tripGroup)}>
        <h1 className={s.tripName}>{trip.name}</h1>
        <div className={s.meta}>
          {formatDateRange(trip.startDate, trip.endDate)} · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}
        </div>
        <Link to="/setup" className={s.editTrip}>
          Edit trip details
        </Link>
      </section>

      <nav aria-label="Days" className={s.nav}>
        <div className={s.days}>
          {trip.days.map((day) => {
            const active = day.number === activeDay;
            const count = day.stops.length;
            return (
              <Link
                key={day.number}
                to={`/trip/day/${day.number}`}
                aria-current={active ? 'page' : undefined}
                className={cx(s.dayRow, active && s.dayRowActive)}
              >
                <span className={s.dayNum}>{day.number}</span>
                <span>{formatDate(day.date)}</span>
                <span className={s.dayCount}>
                  {count} {count === 1 ? 'stop' : 'stops'}
                </span>
              </Link>
            );
          })}
        </div>
        <a href="#backlog" className={cx(s.dayRow, s.backlogRow)}>
          <span className={s.dayNum}>
            <Icon name="backlog" />
          </span>
          <span>Backlog</span>
          <span className={s.pill}>{trip.backlog.length}</span>
        </a>
      </nav>

      <div className={s.budgetGroup}>
        <BudgetPanel trip={trip} />
      </div>
    </aside>
  );
}
