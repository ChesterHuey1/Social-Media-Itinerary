import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatClock, formatDate, formatDateRange, formatUsd } from '../../domain/format';
import type { Day, Trip } from '../../domain/types';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { TextField } from '../../ui/Field';
import ui from '../../ui/ui.module.css';
import type { BuiltState } from '../../state/api';
import { useTrip } from '../../state/tripContext';
import { BookingsSection } from './BookingsSection';
import { SavedPlacesSection } from './SavedPlacesSection';
import s from './TripSetup.module.css';

export function TripSetupPage() {
  const { trip, build } = useTrip();
  const navigate = useNavigate();
  const [building, setBuilding] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [included, setIncluded] = useState(
    () => new Set(trip.savedPlaces.filter((sp) => sp.included).map((sp) => sp.placeId)),
  );

  const toggle = (placeId: string) =>
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });

  const buildTrip = async () => {
    setBuilding(true);
    setBuildFailed(false);
    try {
      const result = await build([...included]);
      const built: BuiltState = { placed: result.placed, backlogged: result.backlogged.length, previous: result.previous, at: Date.now() };
      navigate('/trip/day/1', { state: { built } });
    } catch {
      setBuildFailed(true);
      setBuilding(false);
    }
  };

  return (
    <div className={s.page}>
      <main className={s.main}>
        <header className={s.intro}>
          <h1 className={s.screenTitle}>Plan a trip</h1>
          <p className={s.muted}>
            Add your flights and hotels first. They decide when each day can start, where it begins and ends, and which
            city you're in.
          </p>
        </header>

        <BookingsSection trip={trip} />
        <TripDetailsSection trip={trip} />
        <DayHoursSection trip={trip} />
        <SavedPlacesSection trip={trip} included={included} onToggle={toggle} />

        <footer className={s.footer}>
          <span className={s.muted}>
            {included.size} places across {trip.days.length} days. Anything that doesn't fit goes to the backlog.
          </span>
          {buildFailed && (
            <span className={s.buildError} role="alert">
              Couldn't build the itinerary. Check that the backend is running, then try again.
            </span>
          )}
          <Button variant="primary" tall icon="arrowRight" onClick={buildTrip} disabled={building || included.size === 0}>
            {building ? 'Building your trip…' : 'Build itinerary'}
          </Button>
        </footer>
      </main>
    </div>
  );
}

function nightsByCity(trip: Trip): string {
  const nights = new Map<string, number>();
  for (const day of trip.days) {
    if (day.date >= trip.endDate) continue;
    const city = trip.stays.find((st) => st.id === day.stayId)?.city;
    if (city) nights.set(city, (nights.get(city) ?? 0) + 1);
  }
  return [...nights].map(([city, n]) => `${city} ${n} ${n === 1 ? 'night' : 'nights'}`).join(', ');
}

function TripDetailsSection({ trip }: { trip: Trip }) {
  return (
    <section className={s.section} aria-labelledby="step-2">
      <div className={s.sectionHead}>
        <span className={s.step}>2</span>
        <h2 id="step-2" className={s.sectionTitle}>
          Trip details
        </h2>
      </div>
      <div className={s.grid2}>
        <TextField label="Trip name" defaultValue={trip.name} />
        <div className={ui.field}>
          <span className={ui.fieldLabel}>Dates and cities</span>
          <div className={s.derived}>
            <span>
              {formatDateRange(trip.startDate, trip.endDate)} · {trip.days.length} days
            </span>
            <span className={ui.help}>From your flights and hotels: {nightsByCity(trip)}</span>
          </div>
        </div>
        <TextField
          label="Travelers"
          type="number"
          min={1}
          defaultValue={trip.travelers}
        />
        <TextField
          label="Total budget (USD)"
          defaultValue={formatUsd(trip.budgetUsd)}
        />
      </div>
    </section>
  );
}

function flightSets(trip: Trip, day: Day): { start: boolean; end: boolean } {
  return {
    start: trip.flights.some((f) => f.direction === 'arrive' && f.date === day.date),
    end: trip.flights.some((f) => f.direction === 'depart' && f.date === day.date),
  };
}

function DayHoursSection({ trip }: { trip: Trip }) {
  return (
    <section className={s.section} aria-labelledby="step-3">
      <div className={s.sectionHead}>
        <span className={s.step}>3</span>
        <h2 id="step-3" className={s.sectionTitle}>
          Day hours
        </h2>
        <p className={s.muted}>When you want to leave the hotel and be back. Flight days are set for you.</p>
      </div>
      <div className={s.stack}>
        {trip.days.map((day) => {
          const fromFlight = flightSets(trip, day);
          return (
            <div key={day.number} className={s.dayRow}>
              <span className={s.dayLabel}>
                <span className={s.dayName}>Day {day.number}</span>
                <span className={s.dayDate}>{formatDate(day.date)}</span>
              </span>
              <input
                aria-label={`Day ${day.number} start`}
                className={cx(ui.input, ui.inputTime, fromFlight.start && ui.inputDerived)}
                defaultValue={formatClock(day.startMin)}
              />
              <input
                aria-label={`Day ${day.number} end`}
                className={cx(ui.input, ui.inputTime, fromFlight.end && ui.inputDerived)}
                defaultValue={formatClock(day.endMin)}
              />
              <span className={ui.help}>{day.note}</span>
            </div>
          );
        })}
      </div>
      <div className={s.spread}>
        <span className={s.small}>Buffers: 90 min after landing, 3 h before departure, 10 min per travel leg</span>
        <Button variant="text">Change buffers</Button>
      </div>
    </section>
  );
}
