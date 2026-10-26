import { formatDate, formatDistance, formatDuration, formatUsd } from '../../domain/format';
import type { DaySummary } from '../../domain/schedule';
import type { Day, Stay } from '../../domain/types';
import { Button } from '../../ui/Button';
import s from './DayView.module.css';

/** An empty day has no route to optimize; its primary button is Add a place in the empty state. */
type DayHeaderProps = { day: Day; stay: Stay; summary: DaySummary; onShowMap: () => void };

function totalText(summary: DaySummary): string {
  return `${summary.estimated ? 'About ' : ''}${formatUsd(summary.totalUsd)}`;
}

export function DayHeader({ day, stay, summary, onShowMap }: DayHeaderProps) {
  const hasStops = summary.stopCount > 0;
  return (
    <header className={s.header}>
      <div className={s.titleBlock}>
        <span className={s.dayKicker}>
          Day {day.number} · {formatDate(day.date)} · {stay.city}
        </span>
        <h2 className={s.dayTitle}>{day.title}</h2>
        {hasStops && (
          <p className={s.dayTotal}>
            <strong>{totalText(summary)}</strong> for the day · {summary.stopCount} stops · {formatDistance(summary.distanceM)}
          </p>
        )}
      </div>
      <div className={s.actions}>
        <Button className={s.showMap} onClick={onShowMap}>
          Show map
        </Button>
        {hasStops && <Button icon="plus">Add place</Button>}
        {hasStops && (
          <Button variant="primary" icon="route">
            Optimize route
          </Button>
        )}
      </div>
    </header>
  );
}

/** The itemized version of the header's total, after the last stop. */
export function DayBreakdown({ summary }: { summary: DaySummary }) {
  const rows = [
    { label: 'Food', value: summary.foodUsd },
    { label: 'Tickets', value: summary.ticketsUsd },
    { label: 'Transit', value: summary.transitUsd },
  ];
  return (
    <section className={s.breakdown} aria-labelledby="breakdown-title">
      <h3 id="breakdown-title" className={s.breakdownTitle}>
        Day breakdown
      </h3>
      <dl className={s.breakdownList}>
        {rows.map((r) => (
          <div key={r.label} className={s.breakdownRow}>
            <dt>{r.label}</dt>
            <dd>{formatUsd(r.value, r.label === 'Transit')}</dd>
          </div>
        ))}
        <div className={s.breakdownRow}>
          <dt>Travel</dt>
          <dd>
            {formatDuration(summary.travelMin)} · {formatDistance(summary.distanceM)}
          </dd>
        </div>
        {summary.bookAhead.length > 0 && (
          <div className={s.breakdownRow}>
            <dt>Book ahead</dt>
            <dd>{summary.bookAhead.join(', ')}</dd>
          </div>
        )}
        <div className={`${s.breakdownRow} ${s.breakdownTotal}`}>
          <dt>Total per person</dt>
          <dd>{totalText(summary)}</dd>
        </div>
      </dl>
    </section>
  );
}
