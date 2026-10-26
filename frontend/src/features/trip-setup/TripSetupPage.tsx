import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatDateRange, parseTimeInput, toTimeInput } from '../../domain/format';
import type { Day, Trip } from '../../domain/types';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { TextField } from '../../ui/Field';
import ui from '../../ui/ui.module.css';
import { planOf, type BuildResult, type BuiltState } from '../../state/api';
import { useTrip } from '../../state/tripContext';
import { BookingsSection } from './BookingsSection';
import { RebuildPreview } from './RebuildPreview';
import { SavedPlacesSection } from './SavedPlacesSection';
import s from './TripSetup.module.css';
import { useSave } from './useSave';

export function TripSetupPage() {
  const { trip, build, preview } = useTrip();
  const navigate = useNavigate();
  const [building, setBuilding] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  // A rebuild shows what would change first; Apply saves exactly that plan.
  const [previewed, setPreviewed] = useState<BuildResult | null>(null);
  const rebuilding = trip.days.some((d) => d.stops.length > 0);
  const [included, setIncluded] = useState(
    () => new Set(trip.savedPlaces.filter((sp) => sp.status === 'in_trip').map((sp) => sp.placeId)),
  );

  const toggle = (placeId: string) => {
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
    setPreviewed(null);
  };

  const showPreview = async () => {
    setBuilding(true);
    setBuildFailed(false);
    try {
      setPreviewed(await preview([...included]));
    } catch {
      setBuildFailed(true);
    }
    setBuilding(false);
  };

  const buildTrip = async () => {
    setBuilding(true);
    setBuildFailed(false);
    try {
      const result = await build([...included], previewed ? planOf(previewed.trip) : undefined);
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
        {previewed && <RebuildPreview before={trip} after={previewed.trip} />}

        <footer className={s.footer}>
          <span className={s.muted}>
            {included.size} places across {trip.days.length} days. Anything that doesn't fit goes to the backlog.
          </span>
          {buildFailed && (
            <span className={s.buildError} role="alert">
              Couldn't build the itinerary. Check that the backend is running, then try again.
            </span>
          )}
          {previewed ? (
            <span className={s.footerActions}>
              <Button tall onClick={() => setPreviewed(null)} disabled={building}>
                Cancel
              </Button>
              <Button variant="primary" tall icon="arrowRight" onClick={buildTrip} disabled={building}>
                {building ? 'Saving…' : 'Apply changes'}
              </Button>
            </span>
          ) : (
            <Button
              variant="primary"
              tall
              icon="arrowRight"
              onClick={rebuilding ? showPreview : buildTrip}
              disabled={building || included.size === 0}
            >
              {building ? (rebuilding ? 'Working it out…' : 'Building your trip…') : rebuilding ? 'Rebuild itinerary' : 'Build itinerary'}
            </Button>
          )}
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
  const { save, saving, error } = useSave();
  const [name, setName] = useState(trip.name);
  const [travelers, setTravelers] = useState(String(trip.travelers));
  const [budget, setBudget] = useState(String(trip.budgetUsd));
  const changed = name !== trip.name || Number(travelers) !== trip.travelers || Number(budget) !== trip.budgetUsd;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save({ type: 'setTripDetails', name, travelers: Number(travelers), budgetUsd: Number(budget) });
  };

  return (
    <section className={s.section} aria-labelledby="step-2">
      <div className={s.sectionHead}>
        <span className={s.step}>2</span>
        <h2 id="step-2" className={s.sectionTitle}>
          Trip details
        </h2>
      </div>
      <form className={s.stack} onSubmit={submit} aria-label="Trip details">
        <div className={s.grid2}>
          <TextField label="Trip name" required value={name} onChange={(e) => setName(e.target.value)} />
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
            max={50}
            required
            value={travelers}
            onChange={(e) => setTravelers(e.target.value)}
          />
          <TextField
            label="Total budget (USD)"
            inputMode="decimal"
            pattern="[0-9]*[.]?[0-9]{0,2}"
            required
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        {error && (
          <p className={s.formError} role="alert">
            {error}
          </p>
        )}
        <div className={s.formActions}>
          <Button type="submit" disabled={saving || !changed}>
            {saving ? 'Saving…' : changed ? 'Save details' : 'Saved'}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Which ends of the day a flight sets. Those come from the flight and aren't edited here. */
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
        {trip.days.map((day) => (
          // Keyed by the stored hours, so a saved or refused change resets the inputs to what the server has.
          <DayHoursRow key={`${day.number} ${day.startMin} ${day.endMin}`} day={day} fromFlight={flightSets(trip, day)} />
        ))}
      </div>
    </section>
  );
}

function DayHoursRow({ day, fromFlight }: { day: Day; fromFlight: { start: boolean; end: boolean } }) {
  const { save, error } = useSave();
  const [start, setStart] = useState(toTimeInput(day.startMin));
  const [end, setEnd] = useState(toTimeInput(day.endMin));

  /** Saves when a time is finished being edited and differs from what's stored. */
  const commit = () => {
    const startMin = parseTimeInput(start);
    const endMin = parseTimeInput(end);
    if (startMin === null || endMin === null || (startMin === day.startMin && endMin === day.endMin)) return;
    save({ type: 'setDayHours', dayNumber: day.number, startMin, endMin });
  };

  return (
    <div className={s.dayRow}>
      <span className={s.dayLabel}>
        <span className={s.dayName}>Day {day.number}</span>
        <span className={s.dayDate}>{formatDate(day.date)}</span>
      </span>
      <input
        type="time"
        aria-label={`Day ${day.number} start`}
        className={cx(ui.input, ui.inputTime, fromFlight.start && ui.inputDerived)}
        disabled={fromFlight.start}
        value={start}
        onChange={(e) => setStart(e.target.value)}
        onBlur={commit}
      />
      <input
        type="time"
        aria-label={`Day ${day.number} end`}
        className={cx(ui.input, ui.inputTime, fromFlight.end && ui.inputDerived)}
        disabled={fromFlight.end}
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        onBlur={commit}
      />
      {error ? (
        <span className={s.formError} role="alert">
          {error}
        </span>
      ) : (
        <span className={ui.help}>{day.note}</span>
      )}
    </div>
  );
}
