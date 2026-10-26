import { Link } from 'react-router-dom';
import { EXPENSE_CATEGORIES, spendByCategory, totalSpent } from '../../domain/budget';
import { formatDate, formatDateRange, formatUsd } from '../../domain/format';
import type { Trip } from '../../domain/types';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { SmallLabel } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import s from './DayView.module.css';

function nightsLabel(trip: Trip, stayId: string): string {
  const nights = trip.days.filter((d) => d.stayId === stayId && d.date < trip.endDate).map((d) => d.number);
  if (nights.length === 0) return '';
  return nights.length === 1 ? `Night ${nights[0]}` : `Nights ${nights[0]}–${nights.at(-1)}`;
}

export function Sidebar({ trip, activeDay }: { trip: Trip; activeDay: number }) {
  return (
    <aside className={s.sidebar}>
      <section className={cx(s.group, s.tripGroup)}>
        <h1 className={s.tripName}>{trip.name}</h1>
        <div className={s.meta}>
          {formatDateRange(trip.startDate, trip.endDate)} · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}
        </div>
        {trip.stays.map((stay) => (
          <div key={stay.id} className={s.stay}>
            <Icon name="bed" />
            <span>
              {stay.name} <span className={s.meta}>{nightsLabel(trip, stay.id)}</span>
            </span>
          </div>
        ))}
        <Link to="/setup" className={s.editTrip}>
          Edit trip details
        </Link>
      </section>

      <nav aria-label="Days" className={s.group}>
        <span className={s.daysLabel}>
          <SmallLabel>Days</SmallLabel>
        </span>
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
                <span className={s.dayRowText}>
                  <span className={s.dayName}>Day {day.number}</span>
                  <span className={s.dayDate}>{formatDate(day.date)}</span>
                </span>
                <span className={s.dayCount}>
                  {count} {count === 1 ? 'stop' : 'stops'}
                </span>
              </Link>
            );
          })}
          <a href="#backlog" className={cx(s.dayRow, s.backlogRow)}>
            <span>Backlog</span>
            <span className={s.pill}>{trip.backlog.length}</span>
          </a>
        </div>
      </nav>

      <div className={cx(s.group, s.budgetGroup)}>
        <BudgetPanel trip={trip} />
      </div>
    </aside>
  );
}

function BudgetPanel({ trip }: { trip: Trip }) {
  const byCategory = spendByCategory(trip);
  const spent = totalSpent(byCategory);
  const over = spent - trip.budgetUsd;
  const percent = Math.min(100, Math.round((spent / trip.budgetUsd) * 100));

  return (
    <section aria-label="Budget" className={s.budget}>
      <SmallLabel>Budget</SmallLabel>
      <div className={s.budgetFigure}>
        <span className={s.budgetNumber}>{over > 0 ? `${formatUsd(over)} over` : formatUsd(spent)}</span>
        <span className={s.meta}>of {formatUsd(trip.budgetUsd)} spent</span>
      </div>
      <div className={s.bar} role="img" aria-label={`${percent} percent of budget spent`}>
        <div className={s.barFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={s.categories}>
        {EXPENSE_CATEGORIES.map((c) => (
          <div key={c.id} className={s.category}>
            <span>{c.label}</span>
            <span>{formatUsd(byCategory[c.id])}</span>
          </div>
        ))}
      </div>
      <Button icon="plus">Add expense</Button>
    </section>
  );
}
